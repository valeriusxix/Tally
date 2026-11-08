import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getProfile, requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Read the business profile: name, ISO 4217 currency, IANA timezone, languages and reminder tone. configured=false means it must be set up with update-profile before logging entries.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await getProfile(ownerEmail);
    if (!profile) return { configured: false as const, profile: null };
    return {
      configured: true as const,
      profile: {
        businessName: profile.businessName,
        currency: profile.currency,
        timezone: profile.timezone,
        languages: profile.languages ?? [],
        reminderTone: profile.reminderTone,
      },
    };
  },
});
