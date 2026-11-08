import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { daysBetween, localDateKey } from "../shared/time.js";
import { getDb, schema } from "../server/db/index.js";
import { computeBalances, getProfile, requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Who owes the user (owedToMe) and whom the user owes (iOwe), in minor units, biggest first, with the date and age in days of each contact's oldest unpaid debt. Payments clear the oldest debt first. Pass contactId for one person.",
  schema: z.object({
    contactId: z.string().optional().describe("Only this contact"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "people", to: "/people" }),
    label: "Open People",
  }),
  run: async ({ contactId }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await getProfile(ownerEmail);
    const timezone = profile?.timezone ?? "UTC";
    const today = localDateKey(new Date(), timezone);
    const balances = await computeBalances(
      ownerEmail,
      contactId ? [contactId] : undefined,
    );
    const ids = [...balances.keys()];
    const contacts = ids.length
      ? await getDb()
          .select({
            id: schema.contacts.id,
            name: schema.contacts.name,
            phone: schema.contacts.phone,
          })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.ownerEmail, ownerEmail),
              inArray(schema.contacts.id, ids),
            ),
          )
      : [];
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const age = (iso: string | null) =>
      iso ? daysBetween(localDateKey(iso, timezone), today) : null;
    const owedToMe = [];
    const iOwe = [];
    for (const b of balances.values()) {
      const contact = byId.get(b.contactId);
      if (!contact) continue;
      if (b.owedToMe !== 0)
        owedToMe.push({
          contactId: b.contactId,
          name: contact.name,
          phone: contact.phone,
          amount: b.owedToMe,
          oldestDebtAt: b.oldestOwedToMeAt,
          oldestDebtAgeDays: age(b.oldestOwedToMeAt),
          openDebts: b.openDebtsToMe.length,
        });
      if (b.iOwe !== 0)
        iOwe.push({
          contactId: b.contactId,
          name: contact.name,
          phone: contact.phone,
          amount: b.iOwe,
          oldestDebtAt: b.oldestIOweAt,
          oldestDebtAgeDays: age(b.oldestIOweAt),
          openDebts: b.openDebtsIOwe.length,
        });
    }
    owedToMe.sort((a, b) => b.amount - a.amount);
    iOwe.sort((a, b) => b.amount - a.amount);
    return {
      currency: profile?.currency ?? null,
      totalOwedToMe: owedToMe.reduce((s, r) => s + Math.max(0, r.amount), 0),
      totalIOwe: iOwe.reduce((s, r) => s + Math.max(0, r.amount), 0),
      owedToMe,
      iOwe,
    };
  },
});
