---
name: needs-you
description: >-
  Read before creating or resolving a Needs You clarification, or when the
  owner is on the Needs You screen. Covers writing one good question, choices
  with patches, and committing the draft.
scope: runtime
---

# Needs You

Needs You holds draft entries that can't be committed yet. Drafts don't count
toward balances, stock or totals until resolved.

## Creating a question

- Use `create-question` only when a required fact is missing or ambiguous:
  price, quantity, who, whether they paid, an unclear number, another
  currency, or two contacts that both match.
- Put everything you DO know in `entry` (type, contact, item, qty, paid,
  rawText, source). Ask about exactly one thing.
- Write the question in the owner's language, short enough to read at a
  glance: "How much was the beans?", "Which Musa: Musa Bello or Musa Garba?",
  "Did Ngozi pay?".
- Set `field`: price | qty | contact | item | paid | currency | type | date |
  other.
- Add `choices` when the answer is one of a few options, each with a `patch`
  in minor units so one tap commits it:
  - Which contact → one choice per candidate, `patch: { contactId }`.
  - Paid? → `{ label: "Paid all", patch: { paid: <total> } }`,
    `{ label: "On credit", patch: { paid: 0 } }`.
  - Price → the item's usual price if one exists, as a choice.
- Tell the owner in one line that it's waiting in Needs You.

## Resolving

- When the owner answers (in chat, or from the Needs You card, which sends
  the question id as context), turn the answer into fields and call
  `resolve-question` with `answer` (their words) and `patch`, or
  `choiceIndex` if they picked a choice.
- If the answer creates a new person or item, `upsert-contact` /
  `upsert-item` first, then patch with the id.
- `incomplete_entry` means something else is still missing: ask that next.
  Don't guess it.
- Confirm with one line from the returned entry, plus the new balance.
- If the owner says to drop it, `void-entry` with their reason.

## Listing

`list-questions` returns open questions, oldest first. When the owner asks
"what's waiting?", read them out briefly, one line each.
