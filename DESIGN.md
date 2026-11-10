# Visual Design Contract

Tally is a quiet, record-first workspace for a small business owner. The
screens show the books; the agent panel is where notes are spoken or typed.
AgentKit owns the conversation primitives; the app owns the ledger screens.

## Product mode

- Mode: `operate`
- Audience and cadence: shop owners and traders who log many short notes a
  day, often on a phone, often in more than one language.
- Primary workflow: speak a note, glance at the entries it produced, fix
  anything wrong, and answer the few questions the agent couldn't settle.

## Visual direction

- Direction name: Quiet ledger
- Palette family: neutral ink and semantic surfaces. Money owed to the owner,
  money the owner owes, drafts and voids use semantic tokens, never a
  separate brand color.
- Type treatment: dense sans-serif labels, tabular figures for every amount,
  the original note shown in a muted line under each entry.
- Composition: a persistent rail (Today, Needs You, People, Stock, Recap,
  Business) beside a content canvas, with the capture bar at the top of Today
  and the agent in the sidebar.
- Shape language: borderless lists, soft selected rows, quiet corners, compact
  icon controls, small chips for assumed values.

## Guardrails

- Preserve the scaffold's semantic tokens and shared component seams.
- Every number on screen comes from an action result; never format money
  outside `shared/money.ts`.
- Keep domain screens distinct from full-page chat and use the AgentSidebar
  for contextual AI.
- No placeholder destinations: every rail item opens a working screen.
