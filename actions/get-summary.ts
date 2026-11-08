import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import {
  addDays,
  daysBetween,
  localDateKey,
  localRangeToUtc,
} from "../shared/time.js";
import { getDb, schema } from "../server/db/index.js";
import {
  computeBalances,
  getProfile,
  requireOwner,
} from "../server/lib/tally.js";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Local date YYYY-MM-DD in the profile timezone (inclusive)");

export default defineAction({
  description:
    "Totals for a local date range (default today), committed entries only, minor units: sales, purchases, expenses, cash in, cash out, new credit given, top items, top expenses, per-day series, plus current top debtors and open Needs You count.",
  schema: z.object({ from: dateKey.optional(), to: dateKey.optional() }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "recap",
      to: `/recap${args.from ? `?from=${args.from}&to=${args.to ?? args.from}` : ""}`,
    }),
    label: "Open Recap",
  }),
  run: async (args, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const profile = await getProfile(ownerEmail);
    const timezone = profile?.timezone ?? "UTC";
    const today = localDateKey(new Date(), timezone);
    const from = args.from ?? args.to ?? today;
    const to = args.to && args.to >= from ? args.to : from;
    const { fromUtc, toUtc } = localRangeToUtc(from, to, timezone);
    const e = schema.entries;
    const rows = await getDb()
      .select({
        type: e.type,
        occurredAt: e.occurredAt,
        itemId: e.itemId,
        qty: e.qty,
        total: e.total,
        paid: e.paid,
        description: e.description,
      })
      .from(e)
      .where(
        and(
          eq(e.ownerEmail, ownerEmail),
          eq(e.status, "committed"),
          gte(e.occurredAt, fromUtc),
          lt(e.occurredAt, toUtc),
        ),
      )
      .limit(50_000);

    const totals = {
      sales: 0,
      purchases: 0,
      expenses: 0,
      cashIn: 0,
      cashOut: 0,
      creditGiven: 0,
      creditTaken: 0,
      paymentsReceived: 0,
      paymentsMade: 0,
      entryCount: rows.length,
    };
    const spanDays = daysBetween(from, to) + 1;
    const days = new Map<string, { sales: number; cashIn: number; cashOut: number }>();
    if (spanDays <= 92) {
      for (let i = 0; i < spanDays; i++)
        days.set(addDays(from, i), { sales: 0, cashIn: 0, cashOut: 0 });
    }
    const itemSales = new Map<string, { qty: number; total: number }>();
    const expenseByNote = new Map<string, number>();
    for (const r of rows) {
      const total = r.total ?? 0;
      const paid = r.paid ?? 0;
      const day = days.get(localDateKey(r.occurredAt, timezone));
      let cin = 0;
      let cout = 0;
      switch (r.type) {
        case "sale":
          totals.sales += total;
          totals.creditGiven += total - paid;
          cin = paid;
          if (day) day.sales += total;
          if (r.itemId) {
            const s = itemSales.get(r.itemId) ?? { qty: 0, total: 0 };
            s.qty += r.qty ?? 0;
            s.total += total;
            itemSales.set(r.itemId, s);
          }
          break;
        case "purchase":
          totals.purchases += total;
          totals.creditTaken += total - paid;
          cout = paid;
          break;
        case "expense": {
          totals.expenses += total;
          cout = paid || total;
          const key = (r.description ?? "Other").trim().toLowerCase();
          expenseByNote.set(key, (expenseByNote.get(key) ?? 0) + total);
          break;
        }
        case "payment_received":
          totals.paymentsReceived += total;
          cin = total;
          break;
        case "payment_made":
          totals.paymentsMade += total;
          cout = total;
          break;
      }
      totals.cashIn += cin;
      totals.cashOut += cout;
      if (day) {
        day.cashIn += cin;
        day.cashOut += cout;
      }
    }

    const itemIds = [...itemSales.keys()];
    const itemNames = itemIds.length
      ? await getDb()
          .select({ id: schema.items.id, name: schema.items.name, unit: schema.items.unit })
          .from(schema.items)
          .where(and(eq(schema.items.ownerEmail, ownerEmail), inArray(schema.items.id, itemIds)))
      : [];
    const nameById = new Map(itemNames.map((i) => [i.id, i]));
    const topItems = [...itemSales.entries()]
      .map(([id, s]) => ({
        itemId: id,
        name: nameById.get(id)?.name ?? "",
        unit: nameById.get(id)?.unit ?? null,
        qty: Math.round(s.qty * 1000) / 1000,
        total: s.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const topExpenses = [...expenseByNote.entries()]
      .map(([description, total]) => ({ description, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const balances = await computeBalances(ownerEmail);
    const debtorIds = [...balances.values()]
      .filter((b) => b.owedToMe > 0)
      .sort((a, b) => b.owedToMe - a.owedToMe)
      .slice(0, 5);
    const debtorNames = debtorIds.length
      ? await getDb()
          .select({ id: schema.contacts.id, name: schema.contacts.name })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.ownerEmail, ownerEmail),
              inArray(schema.contacts.id, debtorIds.map((d) => d.contactId)),
            ),
          )
      : [];
    const debtorName = new Map(debtorNames.map((c) => [c.id, c.name]));
    const [openRow] = await getDb()
      .select({ open: count() })
      .from(schema.questions)
      .where(
        and(eq(schema.questions.ownerEmail, ownerEmail), eq(schema.questions.status, "open")),
      );

    return {
      from,
      to,
      currency: profile?.currency ?? null,
      timezone,
      totals,
      topItems,
      topExpenses,
      topDebtors: debtorIds.map((d) => ({
        contactId: d.contactId,
        name: debtorName.get(d.contactId) ?? "",
        amount: d.owedToMe,
        oldestDebtAt: d.oldestOwedToMeAt,
      })),
      days: [...days.entries()].map(([date, d]) => ({ date, ...d })),
      openQuestions: Number(openRow?.open ?? 0),
    };
  },
});
