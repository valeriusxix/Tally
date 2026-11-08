export const ENTRY_TYPE_LIST = [
  "sale",
  "purchase",
  "expense",
  "payment_received",
  "payment_made",
  "stock_count",
] as const;
export type LedgerEntryType = (typeof ENTRY_TYPE_LIST)[number];

/** Entry types that can leave money owed between the user and a contact. */
export function createsDebt(type: LedgerEntryType): boolean {
  return type === "sale" || type === "purchase";
}

export function isPayment(type: LedgerEntryType): boolean {
  return type === "payment_received" || type === "payment_made";
}
