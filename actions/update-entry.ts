import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  buildFields,
  entryFieldShape,
  entryTypeSchema,
} from "../server/lib/entry-input.js";
import {
  actorOf,
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

const TRACKED = [
  "type",
  "occurredAt",
  "contactId",
  "itemId",
  "qty",
  "unitPrice",
  "total",
  "paid",
  "description",
] as const;

export default defineAction({
  description:
    "Correct an entry's fields (only pass what changes; null clears). Every changed field is recorded as a correction. A field the user corrects is no longer 'assumed'. Committed entries must stay complete; drafts stay drafts until resolve-question. Void entries can't be edited.",
  schema: z.object({
    id: z.string().describe("Entry id"),
    type: entryTypeSchema.optional(),
    ...entryFieldShape,
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
    const current = await requireEntry(ownerEmail, args.id);
    if (current.status === "void")
      fail("This entry was voided and can't be edited.", {
        errorCode: "entry_void",
        statusCode: 409,
      });
    const base = fieldsOf(current);
    if (args.type) base.type = args.type;
    const { id: _id, type: _type, ...patch } = args;
    const next = await buildFields(ownerEmail, profile.timezone, base, patch);
    // Spoken corrections replace defaults: drop "assumed" for touched fields.
    if (patch.assumed === undefined) {
      const touched = new Set(Object.keys(patch));
      if (touched.has("unitPrice") || touched.has("total"))
        next.assumed = next.assumed.filter((f) => f !== "price");
      next.assumed = next.assumed.filter((f) => !touched.has(f));
    }
    if (current.status === "committed") {
      const problem = commitProblem(next);
      if (problem)
        fail(`That change would leave the entry incomplete: ${problem}`, {
          errorCode: "incomplete_entry",
          statusCode: 422,
        });
    }
    const old = fieldsOf(current);
    const changed = TRACKED.filter(
      (key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]),
    );
    const now = nowIso();
    const editedVia = actorOf(ctx);
    if (changed.length || JSON.stringify(old.assumed) !== JSON.stringify(next.assumed)) {
      await getDb().transaction(async (tx) => {
        await tx
          .update(schema.entries)
          .set({ ...next, updatedAt: now })
          .where(
            and(
              eq(schema.entries.id, current.id),
              eq(schema.entries.ownerEmail, ownerEmail),
            ),
          );
        if (changed.length) {
          await tx.insert(schema.corrections).values(
            changed.map((field) => ({
              id: crypto.randomUUID(),
              entryId: current.id,
              field,
              oldValue: old[field] as unknown,
              newValue: next[field] as unknown,
              entryCreatedVia: current.createdVia,
              editedVia,
              ownerEmail,
              orgId,
              createdAt: now,
            })),
          );
        }
      });
    }
    const stored = await requireEntry(ownerEmail, current.id);
    const [entry] = await presentEntries(ownerEmail, [stored], profile.timezone);
    const contactIds = [...new Set([current.contactId, stored.contactId].filter(Boolean))] as string[];
    const balances = await computeBalances(ownerEmail, contactIds);
    const itemIds = [...new Set([current.itemId, stored.itemId].filter(Boolean))] as string[];
    const stock = await computeStock(ownerEmail, itemIds);
    return {
      entry,
      changedFields: changed,
      balances: contactIds.map((cid) => ({
        contactId: cid,
        ...summarizeBalance(balances.get(cid)),
      })),
      stock: itemIds.map((iid) => ({ itemId: iid, stock: stock.get(iid)?.stock ?? 0 })),
    };
  },
});
