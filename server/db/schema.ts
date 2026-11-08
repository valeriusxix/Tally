import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

// Tally's books are private to the business owner who keeps them: every table
// carries owner_email (and org_id for tenant scoping), and every action
// filters by the signed-in owner. Money is always integer minor units in the
// profile currency. Timestamps are UTC ISO strings so string order = time order.

export const ENTRY_TYPES = [
  "sale",
  "purchase",
  "expense",
  "payment_received",
  "payment_made",
  "stock_count",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_STATUSES = ["committed", "draft", "void"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const CAPTURE_SOURCES = ["mic", "chat", "telegram", "ui"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export const REMINDER_TONES = ["friendly", "firm", "formal"] as const;

export const profiles = pgTable("tally_profiles", {
  ownerEmail: text("owner_email").primaryKey(),
  orgId: text("org_id"),
  businessName: text("business_name").notNull().default(""),
  currency: text("currency").notNull(),
  timezone: text("timezone").notNull(),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  reminderTone: text("reminder_tone", { enum: REMINDER_TONES })
    .notNull()
    .default("friendly"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const contacts = pgTable("tally_contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  phone: text("phone"),
  preferredLanguage: text("preferred_language"),
  notes: text("notes"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const items = pgTable("tally_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  unit: text("unit"),
  defaultPrice: integer("default_price"),
  trackStock: boolean("track_stock").notNull().default(true),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const entries = pgTable("tally_entries", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ENTRY_TYPES }).notNull(),
  status: text("status", { enum: ENTRY_STATUSES })
    .notNull()
    .default("committed"),
  occurredAt: text("occurred_at").notNull(),
  contactId: text("contact_id"),
  itemId: text("item_id"),
  qty: doublePrecision("qty"),
  unitPrice: integer("unit_price"),
  total: integer("total"),
  paid: integer("paid"),
  currency: text("currency").notNull(),
  description: text("description"),
  rawText: text("raw_text"),
  assumed: jsonb("assumed").$type<string[]>().notNull().default([]),
  source: text("source", { enum: CAPTURE_SOURCES }).notNull().default("ui"),
  createdVia: text("created_via", { enum: ["agent", "user"] })
    .notNull()
    .default("user"),
  voidReason: text("void_reason"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type QuestionChoice = {
  label: string;
  /** Entry fields to apply when this choice is picked. */
  patch?: Record<string, unknown>;
};

export const questions = pgTable("tally_questions", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull(),
  question: text("question").notNull(),
  field: text("field"),
  choices: jsonb("choices").$type<QuestionChoice[]>().notNull().default([]),
  status: text("status", { enum: ["open", "resolved", "dismissed"] })
    .notNull()
    .default("open"),
  answer: text("answer"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const corrections = pgTable("tally_corrections", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull(),
  field: text("field").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  entryCreatedVia: text("entry_created_via").notNull(),
  editedVia: text("edited_via", { enum: ["agent", "user"] }).notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
});

export const reminders = pgTable("tally_reminders", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  message: text("message").notNull(),
  language: text("language"),
  channel: text("channel", { enum: ["whatsapp", "sms", "copy"] })
    .notNull()
    .default("whatsapp"),
  status: text("status", { enum: ["draft", "sent", "cancelled"] })
    .notNull()
    .default("draft"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
});
