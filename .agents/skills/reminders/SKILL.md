---
name: reminders
description: >-
  Read before drafting or sending a payment reminder. Covers the exact amount,
  language and tone, and the approval rule for sending.
scope: runtime
---

# Payment reminders

Nothing leaves the app without the owner's approval.

## Drafting

1. Identify the contact (`navigation.contactId` or `find-contact`).
2. `list-balances` with that `contactId`. Use the stored `owedToMe` amount
   and the oldest debt date exactly; never round or estimate. If they owe
   nothing, say so and stop.
3. `get-profile` for `businessName` and `reminderTone`.
4. Write the message:
   - In the contact's `preferredLanguage` if set, otherwise the language the
     owner is using.
   - Tone: friendly = warm and short; firm = polite but clear about the date;
     formal = business letter style.
   - Include who it's from (business name), the exact amount formatted in the
     profile currency, and optionally since when. Keep it under ~400
     characters. No threats, no interest or penalties the owner didn't state,
     no legal language.
5. `draft-reminder` with the message (channel `whatsapp` by default, `sms`
   if the owner asks, `copy` if there's no phone and the owner wants to send
   it themselves).
6. Show the draft text in the reply and say it is waiting for their approval
   on the person's page. If the contact has no phone, ask for one
   (`upsert-contact`).

## Sending

- Only call `send-reminder` when the owner explicitly asks to send that
  draft. It always pauses for the owner's approval.
- After it succeeds, give the owner the returned `sendUrl` to tap; that link
  opens WhatsApp/SMS with the message on their phone. Don't say it was
  delivered: you can only confirm it was marked sent.
- Never send several reminders in one go unless the owner asked for each.
