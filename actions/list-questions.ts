import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getProfile, presentEntries, requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "List open Needs You questions (oldest first) with their draft entries and choices.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("Max questions"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "needs-you", to: "/needs-you" }),
    label: "Open Needs You",
  }),
  run: async ({ limit }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await getProfile(ownerEmail);
    const q = schema.questions;
    const rows = await getDb()
      .select()
      .from(q)
      .where(and(eq(q.ownerEmail, ownerEmail), eq(q.status, "open")))
      .orderBy(desc(q.createdAt))
      .limit(limit);
    const entryRows = rows.length
      ? await getDb()
          .select()
          .from(schema.entries)
          .where(
            and(
              eq(schema.entries.ownerEmail, ownerEmail),
              inArray(
                schema.entries.id,
                rows.map((r) => r.entryId),
              ),
            ),
          )
      : [];
    const entries = await presentEntries(
      ownerEmail,
      entryRows,
      profile?.timezone ?? "UTC",
    );
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
      questions: rows.reverse().map((r) => ({
        id: r.id,
        question: r.question,
        field: r.field,
        choices: r.choices ?? [],
        createdAt: r.createdAt,
        entry: byId.get(r.entryId) ?? null,
      })),
    };
  },
});
