import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { CAPTURE_SOURCES } from "../server/db/schema.js";
import {
  buildFields,
  emptyFields,
  entryFieldShape,
  entryTypeSchema,
} from "../server/lib/entry-input.js";
import {
  actorOf,
  commitProblem,
  computeBalances,
  computeStock,
  nowIso,
  presentEntries,
  requireEntry,
  requireOwner,
  requireProfile,
  summarizeBalance,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Create one committed ledger entry. Money is integer minor units in the profile currency. sale/purchase need total (or qty+unitPrice) and paid; anything left owed needs contactId. Fails with incomplete_entry when something is missing: then park it with create-question instead of guessing. Returns the stored entry, the contact's new balance and the item's new stock.",
  schema: z.object({
    type: entryTypeSchema,
    ...entryFieldShape,
    rawText: z
      .string()
      .max(4000)
      .optional()
      .describe("The original transcript or typed note, verbatim"),
    source: z
      .enum(CAPTURE_SOURCES)
      .optional()
      .describe("Where the note came from: mic | chat | telegram | ui"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "today",
      to: `/today?entry=${encodeURIComponent(result.entry.id)}`,
      params: { entryId: result.entry.id },
    }),
    label: "Open entry",
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const profile = await requireProfile(ownerEmail);
    const fields = await buildFields(
      ownerEmail,
      profile.timezone,
      emptyFields(args.type, nowIso()),
      args,
    );
    const problem = commitProblem(fields);
    if (problem)
      fail(`Can't commit this ${args.type}: ${problem}`, {
        errorCode: "incomplete_entry",
        statusCode: 422,
      });
    const now = nowIso();
    const id = crypto.randomUUID();
    const actor = actorOf(ctx);
    await getDb()
      .insert(schema.entries)
      .values({
        id,
        ...fields,
        status: "committed",
        currency: profile.currency,
        rawText: args.rawText ?? null,
        source: args.source ?? (actor === "agent" ? "chat" : "ui"),
        createdVia: actor,
        ownerEmail,
        orgId,
        createdAt: now,
        updatedAt: now,
      });
    // Read back what was actually stored.
    const stored = await requireEntry(ownerEmail, id);
    const [entry] = await presentEntries(ownerEmail, [stored], profile.timezone);
    const balance = stored.contactId
      ? summarizeBalance(
          (await computeBalances(ownerEmail, [stored.contactId])).get(stored.contactId),
        )
      : null;
    const stock = stored.itemId
      ? ((await computeStock(ownerEmail, [stored.itemId])).get(stored.itemId)?.stock ?? 0)
      : null;
    return { entry, contactBalance: balance, itemStock: stock };
  },
});
