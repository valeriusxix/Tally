import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { isIsoCurrency } from "../shared/money.js";
import { isValidTimeZone } from "../shared/time.js";
import { getDb, schema } from "../server/db/index.js";
import { REMINDER_TONES } from "../server/db/schema.js";
import { getProfile, nowIso, requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Create or change the business profile. currency and timezone are required the first time. Changing currency does not convert existing entries.",
  schema: z.object({
    businessName: z.string().max(120).optional().describe("Business name"),
    currency: z
      .string()
      .optional()
      .describe("ISO 4217 code in capitals, e.g. NGN, KES, GHS, USD"),
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone, e.g. Africa/Lagos"),
    languages: z
      .array(z.string())
      .optional()
      .describe("Languages the owner speaks, as BCP 47 tags, e.g. ['en', 'yo', 'pcm']"),
    reminderTone: z
      .enum(REMINDER_TONES)
      .optional()
      .describe("Tone for payment reminders: friendly | firm | formal"),
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const currency = args.currency?.trim().toUpperCase();
    if (currency !== undefined && !isIsoCurrency(currency))
      fail(`${args.currency} is not an ISO 4217 currency code.`, {
        errorCode: "invalid_currency",
      });
    if (args.timezone !== undefined && !isValidTimeZone(args.timezone))
      fail(`${args.timezone} is not an IANA timezone.`, {
        errorCode: "invalid_timezone",
      });
    const existing = await getProfile(ownerEmail);
    const now = nowIso();
    if (!existing) {
      if (!currency || !args.timezone)
        fail("currency and timezone are required to set up the profile.", {
          errorCode: "profile_incomplete",
        });
      await getDb()
        .insert(schema.profiles)
        .values({
          ownerEmail,
          orgId,
          businessName: args.businessName?.trim() ?? "",
          currency,
          timezone: args.timezone,
          languages: args.languages ?? [],
          reminderTone: args.reminderTone ?? "friendly",
          createdAt: now,
          updatedAt: now,
        });
    } else {
      await getDb()
        .update(schema.profiles)
        .set({
          ...(args.businessName !== undefined
            ? { businessName: args.businessName.trim() }
            : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
          ...(args.languages !== undefined ? { languages: args.languages } : {}),
          ...(args.reminderTone !== undefined
            ? { reminderTone: args.reminderTone }
            : {}),
          updatedAt: now,
        })
        .where(eq(schema.profiles.ownerEmail, ownerEmail));
    }
    const saved = await getProfile(ownerEmail);
    if (!saved) fail("Profile was not saved.", { statusCode: 500 });
    return {
      businessName: saved.businessName,
      currency: saved.currency,
      timezone: saved.timezone,
      languages: saved.languages ?? [],
      reminderTone: saved.reminderTone,
    };
  },
});
