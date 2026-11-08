import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  actorOf,
  nowIso,
  requireEntry,
  requireOwner,
} from "../server/lib/tally.js";

export default defineAction({
  description:
    "Cancel an entry with a reason. Only when the user explicitly asks to cancel/delete it; for fixes use update-entry. Also closes any open Needs You question on it.",
  schema: z.object({
    id: z.string().describe("Entry id"),
    reason: z.string().min(1).max(300).describe("Why, in the user's words"),
  }),
  run: async ({ id, reason }, ctx) => {
    const { ownerEmail, orgId } = requireOwner(ctx);
    const current = await requireEntry(ownerEmail, id);
    if (current.status === "void")
      fail("This entry is already void.", { errorCode: "entry_void", statusCode: 409 });
    const now = nowIso();
    await getDb().transaction(async (tx) => {
      await tx
        .update(schema.entries)
        .set({ status: "void", voidReason: reason, updatedAt: now })
        .where(and(eq(schema.entries.id, id), eq(schema.entries.ownerEmail, ownerEmail)));
      await tx
        .update(schema.questions)
        .set({ status: "dismissed", resolvedAt: now, answer: `Entry voided: ${reason}` })
        .where(
          and(
            eq(schema.questions.entryId, id),
            eq(schema.questions.ownerEmail, ownerEmail),
            eq(schema.questions.status, "open"),
          ),
        );
      await tx.insert(schema.corrections).values({
        id: crypto.randomUUID(),
        entryId: id,
        field: "status",
        oldValue: current.status,
        newValue: "void",
        entryCreatedVia: current.createdVia,
        editedVia: actorOf(ctx),
        ownerEmail,
        orgId,
        createdAt: now,
      });
    });
    const stored = await requireEntry(ownerEmail, id);
    return { id, status: stored.status, voidReason: stored.voidReason };
  },
});
