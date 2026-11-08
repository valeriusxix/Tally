import { fail } from "@agent-native/core/action";
import { z } from "zod";

import { ENTRY_TYPES } from "../db/schema.js";
import {
  deriveFields,
  type EntryFields,
  normalizeOccurredAt,
  requireContact,
  requireItem,
} from "./tally.js";

const minor = (what: string) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .describe(
      `${what} in integer minor units of the profile currency (₦1,500 = 150000 for NGN; $12.50 = 1250 for USD)`,
    );

export const entryTypeSchema = z
  .enum(ENTRY_TYPES)
  .describe(
    "sale | purchase | expense | payment_received | payment_made | stock_count",
  );

/** Every optional entry field. `null` clears a field on update. */
export const entryFieldShape = {
  occurredAt: z
    .string()
    .optional()
    .describe(
      "When it happened: ISO 8601 with offset, or YYYY-MM-DD in the profile timezone. Omit for now.",
    ),
  contactId: z
    .string()
    .nullable()
    .optional()
    .describe("Contact id from find-contact or upsert-contact"),
  itemId: z
    .string()
    .nullable()
    .optional()
    .describe("Item id from find-item or upsert-item"),
  qty: z.coerce
    .number()
    .min(0)
    .nullable()
    .optional()
    .describe("Quantity in the item's unit; for stock_count, the counted number"),
  unitPrice: minor("Price per unit").nullable().optional(),
  total: minor("Total value of the entry (payment amount for payments)")
    .nullable()
    .optional(),
  paid: minor(
    "Amount paid now for sale/purchase (0 = all on credit)",
  )
    .nullable()
    .optional(),
  description: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .describe("Short note, e.g. 'shop rent' or 'fuel for generator'"),
  assumed: z
    .array(z.string())
    .optional()
    .describe('Fields filled from a default rather than spoken, e.g. ["price"]'),
};

export type EntryPatch = {
  occurredAt?: string | undefined;
  contactId?: string | null | undefined;
  itemId?: string | null | undefined;
  qty?: number | null | undefined;
  unitPrice?: number | null | undefined;
  total?: number | null | undefined;
  paid?: number | null | undefined;
  description?: string | null | undefined;
  assumed?: string[] | undefined;
};

/** Applies a patch over existing fields, checks referenced records, derives. */
export async function buildFields(
  ownerEmail: string,
  timezone: string,
  base: EntryFields,
  patch: EntryPatch,
): Promise<EntryFields> {
  const next: EntryFields = { ...base };
  if (patch.occurredAt !== undefined)
    next.occurredAt = normalizeOccurredAt(patch.occurredAt, timezone);
  for (const key of [
    "contactId",
    "itemId",
    "qty",
    "unitPrice",
    "total",
    "paid",
    "description",
  ] as const) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.assumed !== undefined) next.assumed = patch.assumed;
  // A recomputed total should not survive when the inputs changed and the
  // caller did not restate the total.
  if (
    patch.total === undefined &&
    (patch.qty !== undefined || patch.unitPrice !== undefined) &&
    next.type !== "stock_count" &&
    next.qty !== null &&
    next.unitPrice !== null
  ) {
    next.total = null;
  }
  if (next.contactId) await requireContact(ownerEmail, next.contactId);
  if (next.itemId) await requireItem(ownerEmail, next.itemId);
  if (next.description !== null && next.description.trim() === "")
    next.description = null;
  if (next.qty !== null && !Number.isFinite(next.qty))
    fail("qty must be a number.", { errorCode: "invalid_qty" });
  return deriveFields(next);
}

export function emptyFields(type: EntryFields["type"], occurredAt: string): EntryFields {
  return {
    type,
    occurredAt,
    contactId: null,
    itemId: null,
    qty: null,
    unitPrice: null,
    total: null,
    paid: null,
    description: null,
    assumed: [],
  };
}
