import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  computeBalances,
  nowIso,
  requireContact,
  requireOwner,
  requireProfile,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Save a payment reminder draft for a contact's outstanding balance. You write the message (contact's preferred language, profile reminder tone, the exact stored balance). Nothing is sent; send-reminder needs the owner's approval. Fails with nothing_owed when the contact owes nothing.",
  schema: z.object({
    contactId: z.string().describe("Contact id"),
    message: z.string().min(1).max(1000).describe("Full reminder text to send"),
    language: z.string().max(35).optional().describe("BCP 47 tag of the message"),
    channel: z
      .enum(["whatsapp", "sms", "copy"])
      .default("whatsapp")
      .describe("whatsapp | sms | copy (owner copies it manually)"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "people",
      to: `/people/${encodeURIComponent(result.contactId)}`,
      params: { contactId: result.contactId },
    }),
    label: "Review reminder",
  }),
  run: async (args, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const profile = await requireProfile(ownerEmail);
    const contact = await requireContact(ownerEmail, args.contactId);
    const balance = (await computeBalances(ownerEmail, [contact.id])).get(contact.id);
    const amount = balance?.owedToMe ?? 0;
    if (amount <= 0)
      fail(`${contact.name} doesn't owe anything right now.`, {
        errorCode: "nothing_owed",
        statusCode: 409,
      });
    const row = {
      id: crypto.randomUUID(),
      contactId: contact.id,
      amount,
      currency: profile.currency,
      message: args.message.trim(),
      language: args.language ?? contact.preferredLanguage ?? null,
      channel: args.channel,
      status: "draft" as const,
      ownerEmail,
      orgId,
      createdAt: nowIso(),
    };
    await getDb().insert(schema.reminders).values(row);
    return {
      id: row.id,
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      amount,
      currency: profile.currency,
      message: row.message,
      channel: row.channel,
      status: row.status,
      canSend: row.channel === "copy" || Boolean(contact.phone),
    };
  },
});
