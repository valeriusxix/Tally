---
name: recap
description: >-
  Read before writing a daily or weekly recap or answering "how did I do?".
  Covers which numbers to pull, how to phrase them, and what not to claim.
scope: runtime
---

# Recap

## Period

- "Today" → today in the profile timezone. "This week" → last 7 days
  including today, unless the owner means Monday–today. "This month" → the
  1st to today. If `navigation.period` is set on the recap screen, use it.

## Numbers

1. `get-summary` with `from`/`to` (local dates). All amounts are minor units
   of `currency`; format them as money.
2. For comparison, call `get-summary` again for the previous period of the
   same length, and mention a change only if it's clear (e.g. sales up 20%).
3. `list-balances` if debts matter to the question.

## What to say

Reply in the owner's language, in at most 6 short lines:

1. Sales total, and cash actually received (cash in).
2. Cash out (purchases paid + expenses + supplier payments).
3. New credit given and the biggest debtor(s) with age of oldest debt.
4. Top item(s).
5. Anything waiting in Needs You (drafts are not in these totals).
6. One practical observation from the data, e.g. "₦85,000 of today's sales
   are on credit" or "Musa's debt is 40 days old". No advice on tax, loans
   or investment.

"Sales minus purchases and expenses" is a rough cash view, not profit; say so
if you mention it. Never invent numbers that aren't in the action results.
