import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { bestScore, computeStock, requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Fuzzy-search items by spoken name or alias. Returns up to 5 matches with score 0..1, unit, defaultPrice (minor units, null if unset) and current stock. Empty query lists all items.",
  schema: z.object({
    query: z.string().describe("Item as the user said it, e.g. 'rice' or 'shinkafa'"),
    limit: z.coerce.number().int().min(1).max(200).default(5).describe("Max matches"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "stock", to: "/stock" }),
    label: "Open Stock",
  }),
  run: async ({ query, limit }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const i = schema.items;
    const rows = await getDb()
      .select({
        id: i.id,
        name: i.name,
        aliases: i.aliases,
        unit: i.unit,
        defaultPrice: i.defaultPrice,
        trackStock: i.trackStock,
      })
      .from(i)
      .where(eq(i.ownerEmail, ownerEmail))
      .limit(5000);
    const scored = query.trim()
      ? rows
          .map((row) => ({ row, ...bestScore(query, row.name, row.aliases ?? []) }))
          .filter((m) => m.score >= 0.45)
          .sort((a, b) => b.score - a.score)
      : rows
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((row) => ({ row, score: 0, matched: row.name }));
    const top = scored.slice(0, limit);
    const stock = await computeStock(
      ownerEmail,
      top.map((m) => m.row.id),
    );
    return {
      matches: top.map((m) => ({
        id: m.row.id,
        name: m.row.name,
        aliases: m.row.aliases ?? [],
        unit: m.row.unit,
        defaultPrice: m.row.defaultPrice,
        trackStock: m.row.trackStock,
        stock: m.row.trackStock ? (stock.get(m.row.id)?.stock ?? 0) : null,
        score: Math.round(m.score * 100) / 100,
        matchedOn: m.matched,
      })),
    };
  },
});
