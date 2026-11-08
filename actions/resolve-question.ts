import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  buildFields,
  entryFieldShape,
  type EntryPatch,
} from "../server/lib/entry-input.js";
import {
  commitProblem,
  computeBalances,
  computeStock,
  fieldsOf,
  nowIso,
  presentEntries,
  requireEntry,
  requireOwner,
  requireProfile,
  summarizeBalance,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Answer a Needs You question and commit its draft. Pass choiceIndex for a picked choice, and/or patch with the fields the answer gives (minor units). Fails with incomplete_entry if the draft still can't be committed; the question then stays open.",
  schema: z.object({
    questionId: z.string().describe("Question id from list-questions"),
    answer: z.string().max(500).describe("The answer as the user gave it"),
    choiceIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Index of the chosen choice, if any"),
    patch: z.object(entryFieldShape).optional().describe("Entry fields the answer sets"),
  }),
  run: async (args, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await requireProfile(ownerEmail);
    const q = schema.questions;
    const [question] = await getDb()
      .select()
      .from(q)
      .where(and(eq(q.id, args.questionId), eq(q.ownerEmail, ownerEmail)))
      .limit(1);
    if (!question)
      fail("Question not found.", { errorCode: "question_not_found", statusCode: 404 });
    if (question.status !== "open")
      fail(`This question is already ${question.status}.`, {
        errorCode: "question_closed",
        statusCode: 409,
      });
    const draft = await requireEntry(ownerEmail, question.entryId);
    if (draft.status !== "draft")
      fail("The entry for this question is no longer a draft.", {
        errorCode: "not_draft",
        statusCode: 409,
      });
    let choicePatch: EntryPatch = {};
    if (args.choiceIndex !== undefined) {
      const choice = question.choices?.[args.choiceIndex];
      if (!choice)
        fail("choiceIndex is out of range.", { errorCode: "invalid_choice" });
      choicePatch = (choice.patch ?? {}) as EntryPatch;
    }
    const patch = { ...choicePatch, ...(args.patch ?? {}) };
    const next = await buildFields(ownerEmail, profile.timezone, fieldsOf(draft), patch);
    const touched = new Set(Object.keys(patch));
    if (touched.has("unitPrice") || touched.has("total"))
      next.assumed = next.assumed.filter((f) => f !== "price");
    const problem = commitProblem(next);
    if (problem)
      fail(`Still can't commit: ${problem}`, {
        errorCode: "incomplete_entry",
        statusCode: 422,
      });
    const now = nowIso();
    await getDb().transaction(async (tx) => {
      await tx
        .update(schema.entries)
        .set({ ...next, status: "committed", updatedAt: now })
        .where(and(eq(schema.entries.id, draft.id), eq(schema.entries.ownerEmail, ownerEmail)));
      await tx
        .update(q)
        .set({ status: "resolved", answer: args.answer, resolvedAt: now })
        .where(and(eq(q.id, question.id), eq(q.ownerEmail, ownerEmail)));
    });
    const stored = await requireEntry(ownerEmail, draft.id);
    const [entry] = await presentEntries(ownerEmail, [stored], profile.timezone);
    const balance = stored.contactId
      ? summarizeBalance(
          (await computeBalances(ownerEmail, [stored.contactId])).get(stored.contactId),
        )
      : null;
    const stock = stored.itemId
      ? ((await computeStock(ownerEmail, [stored.itemId])).get(stored.itemId)?.stock ?? 0)
      : null;
    return { questionId: question.id, entry, contactBalance: balance, itemStock: stock };
  },
});
