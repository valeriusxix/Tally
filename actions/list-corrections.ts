import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Recent edits to entries, newest first. By default only edits to agent-made entries: read these to learn the owner's names, prices and habits before parsing similar notes.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(30).describe("Max rows"),
    includeUserEntries: z
      .boolean()
      .optional()
      .describe("Also include edits to entries the user typed in the UI"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ limit, includeUserEntries }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const c = schema.corrections;
    const filters = [eq(c.ownerEmail, ownerEmail)];
    if (!includeUserEntries) filters.push(eq(c.entryCreatedVia, "agent"));
    const rows = await getDb()
      .select()
      .from(c)
      .where(and(...filters))
      .orderBy(desc(c.createdAt))
      .limit(limit);
    const entryIds = [...new Set(rows.map((r) => r.entryId))];
    const entries = entryIds.length
      ? await getDb()
          .select({
            id: schema.entries.id,
            type: schema.entries.type,
            rawText: schema.entries.rawText,
          })
          .from(schema.entries)
          .where(
            and(
              eq(schema.entries.ownerEmail, ownerEmail),
              inArray(schema.entries.id, entryIds),
            ),
          )
      : [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
      corrections: rows.map((r) => ({
        id: r.id,
        entryId: r.entryId,
        entryType: byId.get(r.entryId)?.type ?? null,
        rawText: byId.get(r.entryId)?.rawText ?? null,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        editedVia: r.editedVia,
        createdAt: r.createdAt,
      })),
    };
  },
});
