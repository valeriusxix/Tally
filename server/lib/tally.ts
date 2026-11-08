import { fail } from "@agent-native/core/action";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { isValidTimeZone, localDateKey, zonedToUtc } from "../../shared/time.js";
import { getDb, schema } from "../db/index.js";
import type { EntryType } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Identity and profile
// ---------------------------------------------------------------------------

export type Ctx = {
  userEmail?: string | null;
  orgId?: string | null;
  caller?: string;
} | undefined;

export function requireOwner(ctx: Ctx) {
  const ownerEmail =
    ctx?.userEmail ??
    fail("Sign in to keep your books.", {
      errorCode: "unauthenticated",
      statusCode: 401,
    });
  return { ownerEmail, orgId: ctx?.orgId ?? null };
}

/** Writes made from the agent loop are "agent"; everything else is the user. */
export function actorOf(ctx: Ctx): "agent" | "user" {
  return ctx?.caller === "tool" ? "agent" : "user";
}

export type Profile = typeof schema.profiles.$inferSelect;

export async function getProfile(ownerEmail: string): Promise<Profile | null> {
  const [row] = await getDb()
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.ownerEmail, ownerEmail))
    .limit(1);
  return row ?? null;
}

export async function requireProfile(ownerEmail: string): Promise<Profile> {
  const profile = await getProfile(ownerEmail);
  if (!profile) {
    fail(
      "Set up the business profile first (currency and timezone). Ask the user for their currency and timezone, then call update-profile.",
      { errorCode: "profile_required", statusCode: 409 },
    );
  }
  return profile;
}

export function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Accepts an ISO date-time with offset, or a bare YYYY-MM-DD (taken as noon in
 * the profile timezone, for "yesterday" style notes without a time).
 */
export function normalizeOccurredAt(
  value: string | undefined | null,
  timezone: string,
): string {
  if (!value) return nowIso();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    if (!isValidTimeZone(timezone)) return `${value}T12:00:00.000Z`;
    return zonedToUtc(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
      12,
      0,
      timezone,
    ).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    fail(
      "occurredAt must be YYYY-MM-DD or an ISO 8601 date-time with a UTC offset.",
      { errorCode: "invalid_time" },
    );
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail("occurredAt is not a valid date-time.", { errorCode: "invalid_time" });
  }
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Fuzzy name matching (contacts and items)
// ---------------------------------------------------------------------------

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** 0..1 similarity between a spoken query and one stored name or alias. */
export function nameScore(query: string, candidate: string): number {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const qTokens = q.split(" ");
  const cTokens = c.split(" ");
  const shared = qTokens.filter((token) => cTokens.includes(token)).length;
  // "Musa" vs "Musa Bello": every spoken token is in the stored name.
  const containment = shared / qTokens.length;
  const tokenScore =
    shared === 0 ? 0 : 0.55 + 0.35 * containment * (shared / cTokens.length) ** 0.5;
  const prefix = c.startsWith(q) || q.startsWith(c) ? 0.8 : 0;
  const editRatio = 1 - levenshtein(q, c) / Math.max(q.length, c.length);
  // Per-token fuzzy: "Ngozzi" vs "Mama Ngozi".
  let bestToken = 0;
  for (const qt of qTokens) {
    for (const ct of cTokens) {
      if (qt.length < 3 || ct.length < 3) continue;
      const r = 1 - levenshtein(qt, ct) / Math.max(qt.length, ct.length);
      bestToken = Math.max(bestToken, r);
    }
  }
  const tokenFuzzy = bestToken >= 0.75 ? 0.5 + 0.3 * bestToken : 0;
  return Math.min(
    0.99,
    Math.max(tokenScore, prefix, editRatio * 0.9, tokenFuzzy),
  );
}

export function bestScore(
  query: string,
  name: string,
  aliases: string[],
): { score: number; matched: string } {
  let best = { score: nameScore(query, name), matched: name };
  for (const alias of aliases) {
    const score = nameScore(query, alias);
    if (score > best.score) best = { score, matched: alias };
  }
  return best;
}

export function mergeAliases(existing: string[], add: string[] | undefined) {
  const out = [...existing];
  for (const alias of add ?? []) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    if (!out.some((a) => normalizeName(a) === normalizeName(trimmed))) {
      out.push(trimmed);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Record lookups scoped to the owner
// ---------------------------------------------------------------------------

export async function requireContact(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.ownerEmail, ownerEmail)),
    )
    .limit(1);
  if (!row) {
    fail(`Contact ${id} not found. Use find-contact to get a valid id.`, {
      errorCode: "contact_not_found",
      statusCode: 404,
    });
  }
  return row;
}

export async function requireItem(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.id, id), eq(schema.items.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) {
    fail(`Item ${id} not found. Use find-item to get a valid id.`, {
      errorCode: "item_not_found",
      statusCode: 404,
    });
  }
  return row;
}

export async function requireEntry(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.entries)
    .where(
      and(eq(schema.entries.id, id), eq(schema.entries.ownerEmail, ownerEmail)),
    )
    .limit(1);
  if (!row) {
    fail(`Entry ${id} not found.`, {
      errorCode: "entry_not_found",
      statusCode: 404,
    });
  }
  return row;
}

// ---------------------------------------------------------------------------
// Entry shaping and validation
// ---------------------------------------------------------------------------

export type EntryRow = typeof schema.entries.$inferSelect;

export type EntryFields = {
  type: EntryType;
  occurredAt: string;
  contactId: string | null;
  itemId: string | null;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  paid: number | null;
  description: string | null;
  assumed: string[];
};

/**
 * Fills derivable fields (total from qty × unit price, paid for money-out
 * types) without inventing any amount the user did not give.
 */
export function deriveFields(fields: EntryFields): EntryFields {
  const out = { ...fields };
  if (
    out.total === null &&
    out.qty !== null &&
    out.unitPrice !== null &&
    out.type !== "stock_count"
  ) {
    out.total = Math.round(out.qty * out.unitPrice);
  }
  if (out.type === "expense" && out.paid === null && out.total !== null) {
    out.paid = out.total;
  }
  if (
    (out.type === "payment_received" || out.type === "payment_made") &&
    out.total !== null
  ) {
    out.paid = out.total;
  }
  if (out.type === "stock_count") {
    out.total = null;
    out.paid = null;
    out.unitPrice = null;
  }
  return out;
}

/** Returns the reason an entry can't be committed, or null when it can. */
export function commitProblem(f: EntryFields): string | null {
  switch (f.type) {
    case "sale":
    case "purchase": {
      if (f.total === null)
        return "total is missing (give total, or qty and unitPrice).";
      if (f.paid === null)
        return "paid is missing: how much was paid now? Use 0 for credit, or the total for a cash deal.";
      if (f.paid > f.total)
        return "paid is more than total. Log the extra as a separate payment entry.";
      if (f.total - f.paid > 0 && !f.contactId)
        return `contactId is required when money is left owed (${f.type === "sale" ? "who owes you" : "whom you owe"}).`;
      if (f.qty !== null && f.qty <= 0) return "qty must be more than 0.";
      return null;
    }
    case "expense":
      if (f.total === null) return "total is missing for the expense.";
      return null;
    case "payment_received":
    case "payment_made":
      if (!f.contactId) return "contactId is required for a payment.";
      if (f.total === null || f.total <= 0)
        return "total (the payment amount) must be more than 0.";
      return null;
    case "stock_count":
      if (!f.itemId) return "itemId is required for a stock count.";
      if (f.qty === null || f.qty < 0) return "qty (the counted number) is required.";
      return null;
  }
}

export function fieldsOf(row: EntryRow): EntryFields {
  return {
    type: row.type,
    occurredAt: row.occurredAt,
    contactId: row.contactId,
    itemId: row.itemId,
    qty: row.qty,
    unitPrice: row.unitPrice,
    total: row.total,
    paid: row.paid,
    description: row.description,
    assumed: row.assumed ?? [],
  };
}

export async function presentEntries(
  ownerEmail: string,
  rows: EntryRow[],
  timezone: string,
) {
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
  const itemIds = [...new Set(rows.map((r) => r.itemId).filter(Boolean))] as string[];
  const entryIds = rows.map((r) => r.id);
  const db = getDb();
  const [contactRows, itemRows, questionRows] = await Promise.all([
    contactIds.length
      ? db
          .select({ id: schema.contacts.id, name: schema.contacts.name })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.ownerEmail, ownerEmail),
              inArray(schema.contacts.id, contactIds),
            ),
          )
      : Promise.resolve([]),
    itemIds.length
      ? db
          .select({
            id: schema.items.id,
            name: schema.items.name,
            unit: schema.items.unit,
          })
          .from(schema.items)
          .where(
            and(
              eq(schema.items.ownerEmail, ownerEmail),
              inArray(schema.items.id, itemIds),
            ),
          )
      : Promise.resolve([]),
    entryIds.length
      ? db
          .select({
            id: schema.questions.id,
            entryId: schema.questions.entryId,
            question: schema.questions.question,
          })
          .from(schema.questions)
          .where(
            and(
              eq(schema.questions.ownerEmail, ownerEmail),
              eq(schema.questions.status, "open"),
              inArray(schema.questions.entryId, entryIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const contactsById = new Map(contactRows.map((c) => [c.id, c]));
  const itemsById = new Map(itemRows.map((i) => [i.id, i]));
  const questionByEntry = new Map(questionRows.map((q) => [q.entryId, q]));
  return rows.map((r) => presentEntry(r, timezone, {
    contact: r.contactId ? contactsById.get(r.contactId) ?? null : null,
    item: r.itemId ? itemsById.get(r.itemId) ?? null : null,
    question: questionByEntry.get(r.id) ?? null,
  }));
}

export function presentEntry(
  r: EntryRow,
  timezone: string,
  related: {
    contact?: { id: string; name: string } | null;
    item?: { id: string; name: string; unit: string | null } | null;
    question?: { id: string; question: string } | null;
  } = {},
) {
  const owed =
    (r.type === "sale" || r.type === "purchase") &&
    r.total !== null &&
    r.paid !== null
      ? r.total - r.paid
      : null;
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    occurredAt: r.occurredAt,
    localDate: localDateKey(r.occurredAt, timezone),
    contact: related.contact ?? (r.contactId ? { id: r.contactId, name: "" } : null),
    item: related.item ?? (r.itemId ? { id: r.itemId, name: "", unit: null } : null),
    qty: r.qty,
    unitPrice: r.unitPrice,
    total: r.total,
    paid: r.paid,
    owed,
    currency: r.currency,
    description: r.description,
    rawText: r.rawText,
    assumed: r.assumed ?? [],
    source: r.source,
    createdVia: r.createdVia,
    voidReason: r.voidReason,
    openQuestion: related.question
      ? { id: related.question.id, question: related.question.question }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Balances (oldest debt first) and stock
// ---------------------------------------------------------------------------

const LEDGER_SCAN_LIMIT = 50_000;

type Debt = { entryId: string; occurredAt: string; remaining: number };

export type ContactBalance = {
  contactId: string;
  /** What the contact owes the user (negative = the user holds their credit). */
  owedToMe: number;
  /** What the user owes the contact (negative = the user has prepaid). */
  iOwe: number;
  oldestOwedToMeAt: string | null;
  oldestIOweAt: string | null;
  openDebtsToMe: Debt[];
  openDebtsIOwe: Debt[];
};

function settle(debts: Debt[], payments: number) {
  let left = payments;
  const open: Debt[] = [];
  for (const debt of debts) {
    const applied = Math.min(left, debt.remaining);
    left -= applied;
    const remaining = debt.remaining - applied;
    if (remaining > 0) open.push({ ...debt, remaining });
  }
  const totalDebt = debts.reduce((sum, d) => sum + d.remaining, 0);
  return { balance: totalDebt - payments, open };
}

export async function computeBalances(
  ownerEmail: string,
  contactIds?: string[],
): Promise<Map<string, ContactBalance>> {
  const e = schema.entries;
  const filters = [
    eq(e.ownerEmail, ownerEmail),
    eq(e.status, "committed"),
    isNotNull(e.contactId),
    inArray(e.type, ["sale", "purchase", "payment_received", "payment_made"]),
  ];
  if (contactIds?.length) filters.push(inArray(e.contactId, contactIds));
  const rows = await getDb()
    .select({
      id: e.id,
      type: e.type,
      contactId: e.contactId,
      occurredAt: e.occurredAt,
      total: e.total,
      paid: e.paid,
    })
    .from(e)
    .where(and(...filters))
    .orderBy(asc(e.occurredAt), asc(e.createdAt))
    .limit(LEDGER_SCAN_LIMIT);

  const acc = new Map<
    string,
    { toMe: Debt[]; iOwe: Debt[]; received: number; made: number }
  >();
  for (const row of rows) {
    const id = row.contactId as string;
    const bucket =
      acc.get(id) ?? { toMe: [], iOwe: [], received: 0, made: 0 };
    acc.set(id, bucket);
    const total = row.total ?? 0;
    const owed = total - (row.paid ?? 0);
    if (row.type === "sale" && owed > 0)
      bucket.toMe.push({ entryId: row.id, occurredAt: row.occurredAt, remaining: owed });
    if (row.type === "purchase" && owed > 0)
      bucket.iOwe.push({ entryId: row.id, occurredAt: row.occurredAt, remaining: owed });
    if (row.type === "payment_received") bucket.received += total;
    if (row.type === "payment_made") bucket.made += total;
  }

  const out = new Map<string, ContactBalance>();
  for (const [contactId, b] of acc) {
    const toMe = settle(b.toMe, b.received);
    const iOwe = settle(b.iOwe, b.made);
    out.set(contactId, {
      contactId,
      owedToMe: toMe.balance,
      iOwe: iOwe.balance,
      oldestOwedToMeAt: toMe.open[0]?.occurredAt ?? null,
      oldestIOweAt: iOwe.open[0]?.occurredAt ?? null,
      openDebtsToMe: toMe.open,
      openDebtsIOwe: iOwe.open,
    });
  }
  for (const id of contactIds ?? []) {
    if (!out.has(id)) {
      out.set(id, {
        contactId: id,
        owedToMe: 0,
        iOwe: 0,
        oldestOwedToMeAt: null,
        oldestIOweAt: null,
        openDebtsToMe: [],
        openDebtsIOwe: [],
      });
    }
  }
  return out;
}

export function summarizeBalance(b: ContactBalance | undefined) {
  if (!b) return { owedToMe: 0, iOwe: 0, net: 0 };
  return { owedToMe: b.owedToMe, iOwe: b.iOwe, net: b.owedToMe - b.iOwe };
}

/**
 * Stock = latest committed stock_count (or 0) + purchases − sales after it.
 * Only items with stock tracking on get a number.
 */
export async function computeStock(
  ownerEmail: string,
  itemIds?: string[],
): Promise<Map<string, { stock: number; lastCountAt: string | null }>> {
  const e = schema.entries;
  const filters = [
    eq(e.ownerEmail, ownerEmail),
    eq(e.status, "committed"),
    isNotNull(e.itemId),
    isNotNull(e.qty),
    inArray(e.type, ["sale", "purchase", "stock_count"]),
  ];
  if (itemIds?.length) filters.push(inArray(e.itemId, itemIds));
  const rows = await getDb()
    .select({ type: e.type, itemId: e.itemId, qty: e.qty, occurredAt: e.occurredAt })
    .from(e)
    .where(and(...filters))
    .orderBy(asc(e.occurredAt), asc(e.createdAt))
    .limit(LEDGER_SCAN_LIMIT);
  const out = new Map<string, { stock: number; lastCountAt: string | null }>();
  for (const row of rows) {
    const id = row.itemId as string;
    const cur = out.get(id) ?? { stock: 0, lastCountAt: null };
    const qty = row.qty ?? 0;
    if (row.type === "stock_count") {
      cur.stock = qty;
      cur.lastCountAt = row.occurredAt;
    } else if (row.type === "purchase") cur.stock += qty;
    else if (row.type === "sale") cur.stock -= qty;
    cur.stock = Math.round(cur.stock * 1000) / 1000;
    out.set(id, cur);
  }
  for (const id of itemIds ?? []) {
    if (!out.has(id)) out.set(id, { stock: 0, lastCountAt: null });
  }
  return out;
}
