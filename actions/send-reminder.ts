import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  nowIso,
  requireContact,
  requireOwner,
} from "../server/lib/tally.js";

function sendLink(channel: string, phone: string | null, message: string) {
  if (channel === "copy" || !phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (channel === "whatsapp")
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

export default defineAction({
  description:
    "Send an approved reminder draft. Requires the owner's approval every time; only call it when the owner asked to send. Marks it sent and returns the WhatsApp/SMS link that delivers the message from the owner's phone.",
  schema: z.object({ id: z.string().describe("Reminder id from draft-reminder") }),
  needsApproval: true,
  run: async ({ id }, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const r = schema.reminders;
    const [reminder] = await getDb()
      .select()
      .from(r)
      .where(and(eq(r.id, id), eq(r.ownerEmail, ownerEmail)))
      .limit(1);
    if (!reminder)
      fail("Reminder not found.", { errorCode: "reminder_not_found", statusCode: 404 });
    if (reminder.status !== "draft")
      fail(`This reminder is already ${reminder.status}.`, {
        errorCode: "reminder_not_draft",
        statusCode: 409,
      });
    const contact = await requireContact(ownerEmail, reminder.contactId);
    if (reminder.channel !== "copy" && !contact.phone)
      fail(`${contact.name} has no phone number. Add one with upsert-contact first.`, {
        errorCode: "no_phone",
        statusCode: 409,
      });
    const sentAt = nowIso();
    const [updated] = await getDb()
      .update(r)
      .set({ status: "sent", sentAt })
      .where(and(eq(r.id, id), eq(r.ownerEmail, ownerEmail), eq(r.status, "draft")))
      .returning({ id: r.id, status: r.status });
    if (!updated)
      fail("This reminder changed while sending. Try again.", {
        errorCode: "reminder_not_draft",
        statusCode: 409,
      });
    return {
      id,
      status: updated.status,
      sentAt,
      contactName: contact.name,
      channel: reminder.channel,
      sendUrl: sendLink(reminder.channel, contact.phone, reminder.message),
      message: reminder.message,
    };
  },
});
