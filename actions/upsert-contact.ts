import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  mergeAliases,
  normalizeName,
  nowIso,
  requireContact,
  requireOwner,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Create a contact (omit id), or update one (pass id): rename, add aliases, set phone or preferred language. Store names exactly as the user said them. Run find-contact first so you don't create duplicates.",
  schema: z.object({
    id: z.string().optional().describe("Existing contact id to update; omit to create"),
    name: z.string().min(1).max(120).optional().describe("Name exactly as spoken"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("Other names to add, e.g. nicknames or other spellings"),
    phone: z
      .string()
      .max(32)
      .nullable()
      .optional()
      .describe("Phone in international format, e.g. +2348012345678"),
    preferredLanguage: z
      .string()
      .max(35)
      .nullable()
      .optional()
      .describe("BCP 47 tag for reminders, e.g. 'yo' or 'en'"),
    notes: z.string().max(500).nullable().optional().describe("Short note"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "people",
      to: `/people/${encodeURIComponent(result.id)}`,
      params: { contactId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const now = nowIso();
    const c = schema.contacts;
    if (args.phone && !/^\+?[0-9 ()-]{6,}$/.test(args.phone))
      fail("phone should be digits, ideally +<country code><number>.", {
        errorCode: "invalid_phone",
      });
    const phone = args.phone ? args.phone.replace(/[\s()-]/g, "") : args.phone;
    if (!args.id) {
      if (!args.name)
        fail("name is required to create a contact.", { errorCode: "name_required" });
      const existing = await getDb()
        .select({ id: c.id, name: c.name })
        .from(c)
        .where(eq(c.ownerEmail, ownerEmail))
        .limit(5000);
      const dupe = existing.find(
        (row) => normalizeName(row.name) === normalizeName(args.name ?? ""),
      );
      if (dupe)
        fail(
          `A contact named "${dupe.name}" already exists (id ${dupe.id}). Update it instead.`,
          { errorCode: "duplicate_contact", statusCode: 409, details: { id: dupe.id } },
        );
      const row = {
        id: crypto.randomUUID(),
        name: args.name.trim(),
        aliases: mergeAliases([], args.aliases),
        phone: phone ?? null,
        preferredLanguage: args.preferredLanguage ?? null,
        notes: args.notes ?? null,
        ownerEmail,
        orgId,
        createdAt: now,
        updatedAt: now,
      };
      await getDb().insert(c).values(row);
      const { ownerEmail: _o, orgId: _g, ...visible } = row;
      return { ...visible, created: true };
    }
    const current = await requireContact(ownerEmail, args.id);
    const next = {
      name: args.name?.trim() ?? current.name,
      aliases: mergeAliases(current.aliases ?? [], [
        ...(args.aliases ?? []),
        // Keep the old name findable after a rename.
        ...(args.name && normalizeName(args.name) !== normalizeName(current.name)
          ? [current.name]
          : []),
      ]),
      phone: phone === undefined ? current.phone : phone,
      preferredLanguage:
        args.preferredLanguage === undefined
          ? current.preferredLanguage
          : args.preferredLanguage,
      notes: args.notes === undefined ? current.notes : args.notes,
      updatedAt: now,
    };
    await getDb()
      .update(c)
      .set(next)
      .where(and(eq(c.id, current.id), eq(c.ownerEmail, ownerEmail)));
    const saved = await requireContact(ownerEmail, current.id);
    return {
      id: saved.id,
      name: saved.name,
      aliases: saved.aliases,
      phone: saved.phone,
      preferredLanguage: saved.preferredLanguage,
      notes: saved.notes,
      created: false,
    };
  },
});
