import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import { localDateKey, localRangeToUtc } from "../shared/time.js";
import { getDb, schema } from "../server/db/index.js";
import { ENTRY_STATUSES } from "../server/db/schema.js";
import { entryTypeSchema } from "../server/lib/entry-input.js";
import {
  getProfile,
  presentEntries,
  requireOwner,
} from "../server/lib/tally.js";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Local date YYYY-MM-DD in the profile timezone");

export default defineAction({
  description:
    "List ledger entries, newest first. Filter by local date range (inclusive), contact, item, type or status. Default status is committed + draft. Use to verify writes.",
  schema: z.object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    contactId: z.string().optional().describe("Only this contact's entries"),
    itemId: z.string().optional().describe("Only this item's entries"),
    type: entryTypeSchema.optional(),
    status: z
      .enum([...ENTRY_STATUSES, "all"] as const)
      .optional()
      .describe("committed | draft | void | all. Omit for committed + draft"),
    limit: z.coerce.number().int().min(1).max(500).default(100).describe("Max rows"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "today", to: "/today" }),
    label: "Open Today",
  }),
  run: async (args, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await getProfile(ownerEmail);
    const timezone = profile?.timezone ?? "UTC";
    const e = schema.entries;
    const filters = [eq(e.ownerEmail, ownerEmail)];
    if (args.from || args.to) {
      const today = localDateKey(new Date(), timezone);
      const { fromUtc, toUtc } = localRangeToUtc(
        args.from ?? "2000-01-01",
        args.to ?? today,
        timezone,
      );
      filters.push(gte(e.occurredAt, fromUtc), lt(e.occurredAt, toUtc));
    }
    if (args.contactId) filters.push(eq(e.contactId, args.contactId));
    if (args.itemId) filters.push(eq(e.itemId, args.itemId));
    if (args.type) filters.push(eq(e.type, args.type));
    if (!args.status) filters.push(inArray(e.status, ["committed", "draft"]));
    else if (args.status !== "all") filters.push(eq(e.status, args.status));
    const rows = await getDb()
      .select()
      .from(e)
      .where(and(...filters))
      .orderBy(desc(e.occurredAt), desc(e.createdAt))
      .limit(args.limit);
    return {
      currency: profile?.currency ?? null,
      timezone,
      entries: await presentEntries(ownerEmail, rows, timezone),
    };
  },
});
