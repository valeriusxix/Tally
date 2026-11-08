import { useActionQuery } from "@agent-native/core/client/hooks";
import { useCallback } from "react";

import { formatMoney } from "@shared/money";
import { localDateKey } from "@shared/time";

export type EntryType =
  | "sale"
  | "purchase"
  | "expense"
  | "payment_received"
  | "payment_made"
  | "stock_count";

export type Entry = {
  id: string;
  type: EntryType;
  status: "committed" | "draft" | "void";
  occurredAt: string;
  localDate: string;
  contact: { id: string; name: string } | null;
  item: { id: string; name: string; unit: string | null } | null;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  paid: number | null;
  owed: number | null;
  currency: string;
  description: string | null;
  rawText: string | null;
  assumed: string[];
  source: string;
  createdVia: string;
  voidReason: string | null;
  openQuestion: { id: string; question: string } | null;
};

export const ENTRY_TYPES: EntryType[] = [
  "sale",
  "purchase",
  "expense",
  "payment_received",
  "payment_made",
  "stock_count",
];

/** Money direction for colouring: in = money toward the owner. */
export function entryDirection(type: EntryType): "in" | "out" | "neutral" {
  if (type === "sale" || type === "payment_received") return "in";
  if (type === "stock_count") return "neutral";
  return "out";
}

export function useProfile() {
  const query = useActionQuery("get-profile", {});
  const profile = query.data?.configured ? query.data.profile : null;
  return {
    ...query,
    profile,
    configured: query.data?.configured ?? false,
    currency: profile?.currency ?? "USD",
    timezone:
      profile?.timezone ??
      (typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC"),
  };
}

export function useMoney() {
  const { currency } = useProfile();
  return useCallback(
    (minor: number | null | undefined) => formatMoney(minor, currency),
    [currency],
  );
}

export function todayKey(timezone: string) {
  return localDateKey(new Date(), timezone);
}

export function formatQty(qty: number | null, unit: string | null) {
  if (qty === null) return "";
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 1000) / 1000);
  return unit ? `${n} ${unit}` : n;
}

export function formatDay(dateKey: string, locale?: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12)));
}

export function formatTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function errorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "errorCode" in error &&
    typeof (error as { errorCode: unknown }).errorCode === "string"
  )
    return (error as { errorCode: string }).errorCode;
  return undefined;
}
