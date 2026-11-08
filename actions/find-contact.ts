import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  bestScore,
  computeBalances,
  requireOwner,
  summarizeBalance,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Fuzzy-search contacts by spoken name or alias. Returns up to 5 matches with score 0..1 and current balance. Treat score >= 0.85 with a clear lead as a match; otherwise ask. Empty query lists recent contacts.",
  schema: z.object({
    query: z.string().describe("Name as the user said it, e.g. 'Mama Ngozi'"),
    limit: z.coerce.number().int().min(1).max(500).default(5).describe("Max matches"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "people", to: "/people" }),
    label: "Open People",
  }),
  run: async ({ query, limit }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const c = schema.contacts;
    const rows = await getDb()
      .select({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        phone: c.phone,
        preferredLanguage: c.preferredLanguage,
        updatedAt: c.updatedAt,
      })
      .from(c)
      .where(eq(c.ownerEmail, ownerEmail))
      .limit(5000);
    const scored = query.trim()
      ? rows
          .map((row) => ({ row, ...bestScore(query, row.name, row.aliases ?? []) }))
          .filter((m) => m.score >= 0.45)
          .sort((a, b) => b.score - a.score)
      : rows
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((row) => ({ row, score: 0, matched: row.name }));
    const top = scored.slice(0, limit);
    const balances = await computeBalances(
      ownerEmail,
      top.map((m) => m.row.id),
    );
    return {
      matches: top.map((m) => ({
        id: m.row.id,
        name: m.row.name,
        aliases: m.row.aliases ?? [],
        phone: m.row.phone,
        preferredLanguage: m.row.preferredLanguage,
        score: Math.round(m.score * 100) / 100,
        matchedOn: m.matched,
        balance: summarizeBalance(balances.get(m.row.id)),
      })),
    };
  },
});
