import { runMigrations } from "@agent-native/core/db";

// Additive only: never edit an applied entry; append a new named one.
export default runMigrations(
  [
    {
      version: 1,
      name: "tally-core-ledger",
      sql: `CREATE TABLE IF NOT EXISTS tally_profiles (
  owner_email TEXT PRIMARY KEY,
  org_id TEXT,
  business_name TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  timezone TEXT NOT NULL,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminder_tone TEXT NOT NULL DEFAULT 'friendly' CHECK (reminder_tone IN ('friendly', 'firm', 'formal')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tally_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  phone TEXT,
  preferred_language TEXT,
  notes TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tally_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit TEXT,
  default_price INTEGER CHECK (default_price IS NULL OR default_price >= 0),
  track_stock BOOLEAN NOT NULL DEFAULT true,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tally_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'expense', 'payment_received', 'payment_made', 'stock_count')),
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'draft', 'void')),
  occurred_at TEXT NOT NULL,
  contact_id TEXT,
  item_id TEXT,
  qty DOUBLE PRECISION,
  unit_price INTEGER CHECK (unit_price IS NULL OR unit_price >= 0),
  total INTEGER CHECK (total IS NULL OR total >= 0),
  paid INTEGER CHECK (paid IS NULL OR paid >= 0),
  currency TEXT NOT NULL,
  description TEXT,
  raw_text TEXT,
  assumed JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'ui' CHECK (source IN ('mic', 'chat', 'telegram', 'ui')),
  created_via TEXT NOT NULL DEFAULT 'user' CHECK (created_via IN ('agent', 'user')),
  void_reason TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tally_questions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  question TEXT NOT NULL,
  field TEXT,
  choices JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  answer TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS tally_corrections (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  entry_created_via TEXT NOT NULL,
  edited_via TEXT NOT NULL CHECK (edited_via IN ('agent', 'user')),
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tally_reminders (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  message TEXT NOT NULL,
  language TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'copy')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'cancelled')),
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS tally_contacts_owner_name_idx ON tally_contacts (owner_email, name);
CREATE INDEX IF NOT EXISTS tally_items_owner_name_idx ON tally_items (owner_email, name);
CREATE INDEX IF NOT EXISTS tally_entries_owner_time_idx ON tally_entries (owner_email, occurred_at);
CREATE INDEX IF NOT EXISTS tally_entries_owner_contact_idx ON tally_entries (owner_email, contact_id, occurred_at);
CREATE INDEX IF NOT EXISTS tally_entries_owner_item_idx ON tally_entries (owner_email, item_id, occurred_at);
CREATE INDEX IF NOT EXISTS tally_questions_owner_status_idx ON tally_questions (owner_email, status, created_at);
CREATE INDEX IF NOT EXISTS tally_corrections_owner_time_idx ON tally_corrections (owner_email, created_at);
CREATE INDEX IF NOT EXISTS tally_reminders_owner_contact_idx ON tally_reminders (owner_email, contact_id, created_at)`,
    },
  ],
  { table: "tally_app_migrations" },
);
