import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCopy,
  IconMessage2,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { EntryEditor } from "@/components/tally/EntryEditor";
import { EntryRow } from "@/components/tally/EntryRow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type Entry, useMoney, useProfile } from "@/lib/tally";

type Reminder = {
  id: string;
  amount: number;
  message: string;
  channel: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
};

export default function ContactRoute() {
  const t = useT();
  const money = useMoney();
  const { timezone } = useProfile();
  const { contactId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryId = searchParams.get("entry");
  const contacts = useActionQuery("find-contact", { query: "", limit: 500 });
  const contact = contacts.data?.matches.find((c) => c.id === contactId);
  useSetPageTitle(contact?.name ?? t("tally.nav.people"));
  const balance = useActionQuery("list-balances", { contactId });
  const entries = useActionQuery("list-entries", { contactId, status: "all", limit: 200 });
  const reminders = useActionQuery("list-reminders", { contactId, limit: 20 });
  const [phone, setPhone] = useState("");
  const [toSend, setToSend] = useState<Reminder | null>(null);
  useEffect(() => setPhone(contact?.phone ?? ""), [contact?.phone]);

  const savePhone = useActionMutation("upsert-contact", {
    onSuccess: () => toast.success(t("tally.contact.phoneSaved")),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.contact.saveFailed")),
  });
  const send = useActionMutation("send-reminder", {
    onSuccess: (result) => {
      setToSend(null);
      const url = result.sendUrl;
      if (url) {
        window.open(url, "_blank", "noopener");
        // Popup blockers may stop the automatic open after an async call.
        toast.success(t("tally.contact.reminderSent"), {
          action: {
            label: t("tally.contact.openApp"),
            onClick: () => window.open(url, "_blank", "noopener"),
          },
          duration: 15000,
        });
      } else {
        void navigator.clipboard?.writeText(result.message).catch(() => {});
        toast.success(t("tally.contact.reminderCopied"));
      }
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.contact.sendFailed")),
  });

  const owed = balance.data?.owedToMe[0]?.amount ?? 0;
  const iOwe = balance.data?.iOwe[0]?.amount ?? 0;
  const rows = (entries.data?.entries ?? []) as Entry[];
  const focused = rows.find((e) => e.id === entryId) ?? null;
  const reminderRows = (reminders.data?.reminders ?? []) as Reminder[];

  if (contacts.isPending) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }
  if (!contact) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">{t("tally.contact.notFound")}</p>
        <Link to="/people" className="mt-3 inline-block text-sm underline">
          {t("tally.contact.back")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <Link
        to="/people"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        {t("tally.contact.back")}
      </Link>

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
          {contact.aliases.length ? (
            <p className="text-xs text-muted-foreground">
              {t("tally.contact.aka", { names: contact.aliases.join(", ") })}
            </p>
          ) : null}
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              savePhone.mutate({ id: contact.id, phone: phone.trim() || null });
            }}
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234…"
              inputMode="tel"
              aria-label={t("tally.people.phone")}
              className="h-8"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={phone === (contact.phone ?? "") || savePhone.isPending}
            >
              {t("tally.contact.savePhone")}
            </Button>
          </form>
        </div>
        <div className="space-y-1 text-end">
          {balance.isPending ? (
            <Skeleton className="ms-auto h-8 w-32" />
          ) : (
            <>
              {owed > 0 ? (
                <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {t("tally.contact.owesYou", { amount: money(owed) })}
                </p>
              ) : owed < 0 ? (
                <p className="text-lg font-semibold tabular-nums">
                  {t("tally.contact.hasCredit", { amount: money(-owed) })}
                </p>
              ) : null}
              {iOwe > 0 ? (
                <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {t("tally.contact.youOwe", { amount: money(iOwe) })}
                </p>
              ) : null}
              {owed === 0 && iOwe <= 0 ? (
                <p className="text-sm text-muted-foreground">{t("tally.contact.settled")}</p>
              ) : null}
            </>
          )}
          {owed > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                sendToAgentChat({
                  message: t("tally.contact.draftPrompt", { name: contact.name }),
                  context: JSON.stringify({ contactId: contact.id }),
                  submit: true,
                  openSidebar: true,
                })
              }
            >
              <IconSparkles className="size-4" />
              {t("tally.contact.draftReminder")}
            </Button>
          ) : null}
        </div>
      </section>

      {reminderRows.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("tally.contact.reminders")}</h2>
          {reminderRows.map((r) => (
            <article key={r.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={r.status === "draft" ? "outline" : "secondary"}>
                  {t(`tally.contact.reminderStatus.${r.status}`)}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {money(r.amount)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{r.message}</p>
              {r.status === "draft" ? (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(r.message)
                        .then(() => toast.success(t("tally.contact.copied")))
                        .catch(() => {})
                    }
                  >
                    <IconCopy className="size-4" />
                    {t("tally.contact.copy")}
                  </Button>
                  <Button size="sm" onClick={() => setToSend(r)}>
                    {r.channel === "whatsapp" ? (
                      <IconBrandWhatsapp className="size-4" />
                    ) : (
                      <IconMessage2 className="size-4" />
                    )}
                    {t("tally.contact.approveSend")}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <section aria-label={t("tally.contact.history")} className="rounded-xl border border-border bg-card p-1.5">
        {entries.isPending ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  entry={entry}
                  timezone={timezone}
                  showDate
                  selected={entry.id === entryId}
                  onSelect={(id) => setSearchParams({ entry: id }, { replace: true })}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("tally.contact.noEntries")}
          </p>
        )}
      </section>

      <EntryEditor entry={focused} onClose={() => setSearchParams({}, { replace: true })} />

      <AlertDialog open={Boolean(toSend)} onOpenChange={(open) => !open && setToSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tally.contact.sendTitle", { name: contact.name })}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {toSend?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!contact.phone && toSend?.channel !== "copy" ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("tally.contact.needPhone")}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tally.editor.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={send.isPending || (!contact.phone && toSend?.channel !== "copy")}
              onClick={(event) => {
                event.preventDefault();
                if (toSend) send.mutate({ id: toSend.id });
              }}
            >
              {t("tally.contact.confirmSend")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
