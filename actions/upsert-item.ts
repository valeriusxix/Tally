import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  mergeAliases,
  normalizeName,
  nowIso,
  requireItem,
  requireOwner,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Create an item (omit id), or update one (pass id): rename, add aliases, set unit, default price or stock tracking. Only set defaultPrice from a price the user actually said. Run find-item first to avoid duplicates. Stock levels change only through entries.",
  schema: z.object({
    id: z.string().optional().describe("Existing item id to update; omit to create"),
    name: z.string().min(1).max(120).optional().describe("Item name as spoken"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("Other names, including other languages, e.g. ['shinkafa']"),
    unit: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("Unit of sale, e.g. 'bag', 'crate', 'kg', 'piece'"),
    defaultPrice: z.coerce
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe("Usual selling price per unit in minor units; null clears it"),
    trackStock: z
      .boolean()
      .optional()
      .describe("false for services or things you don't count. Default true"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "stock",
      to: `/stock/${encodeURIComponent(result.id)}`,
      params: { itemId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const now = nowIso();
    const i = schema.items;
    if (!args.id) {
      if (!args.name)
        fail("name is required to create an item.", { errorCode: "name_required" });
      const existing = await getDb()
        .select({ id: i.id, name: i.name })
        .from(i)
        .where(eq(i.ownerEmail, ownerEmail))
        .limit(5000);
      const dupe = existing.find(
        (row) => normalizeName(row.name) === normalizeName(args.name ?? ""),
      );
      if (dupe)
        fail(
          `An item named "${dupe.name}" already exists (id ${dupe.id}). Update it instead.`,
          { errorCode: "duplicate_item", statusCode: 409, details: { id: dupe.id } },
        );
      const row = {
        id: crypto.randomUUID(),
        name: args.name.trim(),
        aliases: mergeAliases([], args.aliases),
        unit: args.unit ?? null,
        defaultPrice: args.defaultPrice ?? null,
        trackStock: args.trackStock ?? true,
        ownerEmail,
        orgId,
        createdAt: now,
        updatedAt: now,
      };
      await getDb().insert(i).values(row);
      const { ownerEmail: _o, orgId: _g, ...visible } = row;
      return { ...visible, created: true };
    }
    const current = await requireItem(ownerEmail, args.id);
    await getDb()
      .update(i)
      .set({
        name: args.name?.trim() ?? current.name,
        aliases: mergeAliases(current.aliases ?? [], [
          ...(args.aliases ?? []),
          ...(args.name && normalizeName(args.name) !== normalizeName(current.name)
            ? [current.name]
            : []),
        ]),
        unit: args.unit === undefined ? current.unit : args.unit,
        defaultPrice:
          args.defaultPrice === undefined ? current.defaultPrice : args.defaultPrice,
        trackStock: args.trackStock ?? current.trackStock,
        updatedAt: now,
      })
      .where(and(eq(i.id, current.id), eq(i.ownerEmail, ownerEmail)));
    const saved = await requireItem(ownerEmail, current.id);
    return {
      id: saved.id,
      name: saved.name,
      aliases: saved.aliases,
      unit: saved.unit,
      defaultPrice: saved.defaultPrice,
      trackStock: saved.trackStock,
      created: false,
    };
  },
});
