---
name: voice-capture
description: >-
  Read before turning any spoken or typed note into ledger entries. Covers
  parsing multi-entry notes in any language, numbers and money slang, matching
  people and items, defaults, and when to commit versus ask.
scope: runtime
---

# Voice capture

A note is what the owner said or typed, verbatim. Your job: turn it into one
entry per thing that happened, using only facts from the note, existing
records, or saved default prices.

## 1. Before parsing

1. `get-profile`. If `configured` is false, ask for currency and timezone and
   stop. Note `currency`, `timezone` and `languages`.
2. If the note is a correction ("no, it was 3 bags", "that's wrong"), it's not
   a new entry: use `navigation.entryId` (or the last entry you logged) and
   `update-entry`.
3. Skim `list-corrections` (limit 20) once per conversation. It shows names,
   prices and habits the owner has fixed before; apply them.

## 2. Split the note

One spoken note often holds several events. "Sold Musa 2 bags rice, he paid
50k, then I bought fuel 8k and Ngozi brought 20k she was owing" is three
entries: a `sale`, an `expense`, a `payment_received`. Keep each entry's
`rawText` as the full original note.

| Said | Type |
| --- | --- |
| sold, gave, he/she took, customer bought | `sale` |
| bought, restocked, supplier brought goods | `purchase` |
| paid rent/fuel/transport/salary/levy (not stock) | `expense` |
| X paid me / brought money / cleared part of debt | `payment_received` |
| I paid supplier / settled what I owe | `payment_made` |
| I counted / remaining is / we have N left | `stock_count` |

## 3. Numbers and money

- Store integer minor units of the profile currency. NGN ₦1,500 → `150000`.
- Common slang: "50k" = 50,000; "1.5k" = 1,500; "2m"/"2 million" =
  2,000,000; "a thousand five" = 1,500; Nigerian "5 kobo"/"one naira" are
  literal. Words in other languages (e.g. Yoruba "ẹgbẹ̀rún" = 1,000, Hausa
  "dubu" = 1,000, Swahili "elfu" = 1,000) are numbers too. If you aren't sure
  how big a number is, ask; don't guess.
- If the note names a different currency from the profile's ("$20" when the
  profile is NGN), do not convert: create a question.
- `total` is the full value. `paid` is what changed hands now. If qty and a
  price per unit are said, pass `qty` + `unitPrice`; the action computes total.
- "Paid 50k out of 150k" → total 15000000, paid 5000000.

## 4. People and items

- `find-contact` with the name as spoken. Use the top match when its score is
  ≥ 0.85 and clearly ahead of the next (gap ≥ 0.1). If several match
  ("Musa" with two Musas), ask which. If none match, `upsert-contact` with the
  name exactly as said (keep spelling, honorifics like "Mama", "Alhaji").
- If the owner uses a new nickname for a known person, add it as an alias.
- `find-item` the same way. New item → `upsert-item` with the name as said and
  the unit if spoken ("bag", "crate", "carton"). Translations or other names go
  in `aliases`.
- `navigation.contactId` / `itemId` resolve "him", "her", "this one".

## 5. Defaults and when to ask

- Price not said but the item has `defaultPrice`: use it and pass
  `assumed: ["price"]`. The UI shows the chip so the owner can check.
- Price not said and no default: create a question (field `price`).
- Payment not said:
  - no person named (walk-in) → cash sale, `paid` = total;
  - a person named → ask "Did Musa pay?" with choices *Paid all* (patch
    paid = total), *On credit* (patch paid = 0).
  - Words like "on credit", "he'll pay later", "owing", "abeg I go pay" mean
    `paid: 0`; "paid", "cash", "transfer" mean paid in full unless an amount
    is given.
- Date: no date means now. "Yesterday", "Friday", "last week Monday" resolve
  against the profile timezone; pass `occurredAt` as `YYYY-MM-DD`.
- Expenses need a short `description` ("fuel", "shop rent").
- Never invent quantities, prices, names or payments.

## 6. Commit or ask

- Everything known → `log-entry` with `source` set to the capture source
  (`mic` for voice, otherwise `chat`).
- Something missing → `create-question` with `entry` holding everything you
  do know, ONE short question in the owner's language, and `choices` with
  `patch`es when the answer is one of a few options. Read the `needs-you`
  skill first.
- In a multi-entry note, commit the complete ones and park only the unclear
  one.

## 7. Verify and confirm

- After writing, trust the returned `entry`, `contactBalance` and `itemStock`
  (they are read back from the database), or call `list-entries` for today.
- If an action fails, say so in one line and fix the input or ask. Never claim
  success you didn't see.
- Reply in the owner's language, one line per entry plus any balance change.
  Example (owner spoke Pidgin):
  - "Sale: 2 bags rice to Musa, ₦150,000. Musa now owe you ₦100,000."
  - "Expense: fuel ₦8,000."
  - "1 dey Needs You: how much the beans be?"
- No greetings, no summaries of what you're about to do.
