import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { CAPTURE_SOURCES, type QuestionChoice } from "../server/db/schema.js";
import {
  buildFields,
  emptyFields,
  entryFieldShape,
  entryTypeSchema,
} from "../server/lib/entry-input.js";
import {
  actorOf,
  nowIso,
  presentEntries,
  requireEntry,
  requireOwner,
  requireProfile,
} from "../server/lib/tally.js";

const patchShape = z.object({
  contactId: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  qty: z.number().min(0).nullable().optional(),
  unitPrice: z.number().int().min(0).nullable().optional(),
  total: z.number().int().min(0).nullable().optional(),
  paid: z.number().int().min(0).nullable().optional(),
  description: z.string().nullable().optional(),
  occurredAt: z.string().optional(),
});

export default defineAction({
  description:
    "Park an uncertain note in Needs You: saves a draft entry (excluded from totals) with ONE short question in the user's language. Pass `entry` with everything you do know, or `entryId` of an existing draft. Each choice may carry `patch` (entry fields in minor units) so the owner can resolve with one tap.",
  schema: z.object({
    question: z.string().min(1).max(300).describe("One short question, in the user's language"),
    field: z
      .string()
      .max(40)
      .optional()
      .describe("What is missing: price | qty | contact | item | paid | currency | type | date | other"),
    choices: z
      .array(
        z.object({
          label: z.string().min(1).max(80).describe("Button text"),
          patch: patchShape.optional().describe("Entry fields to set if picked"),
        }),
      )
      .max(6)
      .optional()
      .describe("Optional quick answers"),
    entryId: z.string().optional().describe("Existing draft entry id"),
    entry: z
      .object({
        type: entryTypeSchema,
        ...entryFieldShape,
        rawText: z.string().max(4000).optional().describe("Original note, verbatim"),
        source: z.enum(CAPTURE_SOURCES).optional().describe("mic | chat | telegram | ui"),
      })
      .optional()
      .describe("What is known so far; creates a new draft"),
  }),
  link: () => ({
    url: buildDeepLink({ view: "needs-you", to: "/needs-you" }),
    label: "Open Needs You",
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const profile = await requireProfile(ownerEmail);
    if (!args.entryId === !args.entry)
      fail("Pass exactly one of entryId or entry.", { errorCode: "invalid_input" });
    const now = nowIso();
    const actor = actorOf(ctx);
    let entryId = args.entryId;
    if (entryId) {
      const existing = await requireEntry(ownerEmail, entryId);
      if (existing.status !== "draft")
        fail("Questions can only be attached to draft entries.", {
          errorCode: "not_draft",
          statusCode: 409,
        });
      const [open] = await getDb()
        .select({ id: schema.questions.id })
        .from(schema.questions)
        .where(
          and(
            eq(schema.questions.entryId, entryId),
            eq(schema.questions.ownerEmail, ownerEmail),
            eq(schema.questions.status, "open"),
          ),
        )
        .limit(1);
      if (open)
        fail(`This draft already has an open question (${open.id}).`, {
          errorCode: "question_exists",
          statusCode: 409,
        });
    }
    const questionId = crypto.randomUUID();
    // Resolve referenced records before opening the transaction; inside it
    // only `tx` is used.
    const newDraft = args.entry
      ? {
          meta: args.entry,
          fields: await buildFields(
            ownerEmail,
            profile.timezone,
            emptyFields(args.entry.type, now),
            (({ type: _t, rawText: _r, source: _s, ...rest }) => rest)(args.entry),
          ),
        }
      : null;
    await getDb().transaction(async (tx) => {
      if (newDraft) {
        const { rawText, source } = newDraft.meta;
        const fields = newDraft.fields;
        entryId = crypto.randomUUID();
        await tx.insert(schema.entries).values({
          id: entryId,
          ...fields,
          status: "draft",
          currency: profile.currency,
          rawText: rawText ?? null,
          source: source ?? (actor === "agent" ? "chat" : "ui"),
          createdVia: actor,
          ownerEmail,
          orgId,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx.insert(schema.questions).values({
        id: questionId,
        entryId: entryId as string,
        question: args.question,
        field: args.field ?? null,
        choices: (args.choices ?? []) as QuestionChoice[],
        status: "open",
        ownerEmail,
        orgId,
        createdAt: now,
      });
    });
    const stored = await requireEntry(ownerEmail, entryId as string);
    const [entry] = await presentEntries(ownerEmail, [stored], profile.timezone);
    return { questionId, question: args.question, choices: args.choices ?? [], entry };
  },
});
