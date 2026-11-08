import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireOwner } from "../server/lib/tally.js";

export default defineAction({
  description:
    "Reminder drafts and sent history, newest first. Filter by contact or status.",
  schema: z.object({
    contactId: z.string().optional().describe("Only this contact"),
    status: z.enum(["draft", "sent", "cancelled"]).optional().describe("Filter by status"),
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("Max rows"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    const { ownerEmail } = requireOwner(ctx);
    const r = schema.reminders;
    const filters = [eq(r.ownerEmail, ownerEmail)];
    if (args.contactId) filters.push(eq(r.contactId, args.contactId));
    if (args.status) filters.push(eq(r.status, args.status));
    const rows = await getDb()
      .select()
      .from(r)
      .where(and(...filters))
      .orderBy(desc(r.createdAt))
      .limit(args.limit);
    const ids = [...new Set(rows.map((x) => x.contactId))];
    const contacts = ids.length
      ? await getDb()
          .select({ id: schema.contacts.id, name: schema.contacts.name, phone: schema.contacts.phone })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.ownerEmail, ownerEmail), inArray(schema.contacts.id, ids)))
      : [];
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return {
      reminders: rows.map((x) => ({
        id: x.id,
        contactId: x.contactId,
        contactName: byId.get(x.contactId)?.name ?? "",
        phone: byId.get(x.contactId)?.phone ?? null,
        amount: x.amount,
        currency: x.currency,
        message: x.message,
        language: x.language,
        channel: x.channel,
        status: x.status,
        createdAt: x.createdAt,
        sentAt: x.sentAt,
      })),
    };
  },
});
