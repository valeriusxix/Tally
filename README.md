# Tally

Voice-first bookkeeping for small businesses. Speak (or type) a note in any
language, or a mix of languages, and an AI agent turns it into ledger
entries, stock changes and who-owes-whom balances. The owner reviews and
corrects everything in the UI. Built on [Agent-Native](https://agent-native.com):
the agent and the UI share the same SQL data and the same actions.

> "Musa take 2 bags rice, he pay 50k. Fuel 8k."
> → Sale: 2 bags rice to Musa, ₦150,000. Musa owes ₦100,000.
> → Expense: fuel ₦8,000.

## Screens

| Route | What it does |
| --- | --- |
| `/today` | Mic + type box, today's totals, today's entries; tap an entry to correct or void it |
| `/needs-you` | Notes the agent couldn't finish (missing price, unclear person). One-tap answers |
| `/people` | Who owes you, whom you owe (oldest debt first), contact history, payment reminders |
| `/stock` | Items, live stock levels, usual prices, physical recounts |
| `/recap` | Totals for any period, sales by day, top items, top debtors |
| `/profile` | Business name, currency, timezone, languages, reminder tone |

## How it works

- **Actions** (`actions/`): 19 typed actions (`log-entry`, `find-contact`,
  `list-balances`, `send-reminder`, …) used by both the agent and the UI.
- **Ledger rules** (`server/lib/tally.ts`): money is integer minor units in
  the profile currency; payments clear the oldest debt first; stock = last
  count + purchases − sales; drafts and voids never count toward totals.
- **Agent instructions**: `AGENTS.md` plus runtime skills in
  `.agents/skills/` (`voice-capture`, `needs-you`, `reminders`, `recap`).
- **Safety**: the agent never guesses an amount (it parks the note in Needs
  You), every edit is recorded as a correction, and `send-reminder` always
  needs the owner's approval.

## Run it locally

Requires Node 22.22+ and pnpm 10.

```bash
pnpm install
pnpm dev            # opens http://localhost:8080
```

Click **Continue as local dev**, set your currency and timezone, then open
the agent panel and connect an AI provider (an Anthropic API key under
**Custom keys** works). Tap the mic or type a note and press **Record**.

Useful checks:

```bash
pnpm typecheck
pnpm agent-native:doctor
AGENT_USER_EMAIL=you@example.com pnpm action list-balances
```

## Status

Hackathon build. Not yet done: Telegram capture, in-app translations of the UI
(the agent already replies in the owner's language), and direct WhatsApp
Business sending (reminders open WhatsApp/SMS on the owner's phone with the
message pre-filled).
