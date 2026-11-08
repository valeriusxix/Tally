import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoney } from "@/lib/tally";
import { cn } from "@/lib/utils";

type BalanceRow = {
  contactId: string;
  name: string;
  amount: number;
  oldestDebtAgeDays: number | null;
};

function BalanceList({
  title,
  total,
  rows,
  tone,
}: {
  title: string;
  total: number;
  rows: BalanceRow[];
  tone: "in" | "out";
}) {
  const t = useT();
  const money = useMoney();
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            tone === "in"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400",
          )}
        >
          {money(total)}
        </span>
      </header>
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.contactId}>
              <Link
                to={`/people/${encodeURIComponent(row.contactId)}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  {row.amount < 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t("tally.people.credit")}
                    </span>
                  ) : row.oldestDebtAgeDays !== null ? (
                    <span
                      className={cn(
                        "text-xs",
                        row.oldestDebtAgeDays > 30
                          ? "font-medium text-red-700 dark:text-red-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("tally.people.oldest", { count: row.oldestDebtAgeDays })}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(Math.abs(row.amount))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t("tally.people.nobody")}
        </p>
      )}
    </section>
  );
}

export default function PeopleIndexRoute() {
  const t = useT();
  useSetPageTitle(t("tally.nav.people"));
  const balances = useActionQuery("list-balances", {});
  const contacts = useActionQuery("find-contact", { query: "", limit: 500 });
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const create = useActionMutation("upsert-contact", {
    onSuccess: () => {
      setName("");
      setPhone("");
      toast.success(t("tally.people.added"));
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.people.addFailed")),
  });

  const list = (contacts.data?.matches ?? []).filter((c) =>
    c.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      {balances.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <BalanceList
            title={t("tally.people.owedToMe")}
            total={balances.data?.totalOwedToMe ?? 0}
            rows={balances.data?.owedToMe ?? []}
            tone="in"
          />
          <BalanceList
            title={t("tally.people.iOwe")}
            total={balances.data?.totalIOwe ?? 0}
            rows={balances.data?.iOwe ?? []}
            tone="out"
          />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("tally.people.everyone")}</h2>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("tally.people.search")}
            aria-label={t("tally.people.search")}
            className="h-8 w-48"
          />
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            create.mutate({
              name: name.trim(),
              ...(phone.trim() ? { phone: phone.trim() } : {}),
            });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("tally.people.name")}
            aria-label={t("tally.people.name")}
            className="h-9 min-w-40 flex-1"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("tally.people.phone")}
            aria-label={t("tally.people.phone")}
            inputMode="tel"
            className="h-9 w-44"
          />
          <Button type="submit" size="sm" className="h-9" disabled={!name.trim() || create.isPending}>
            <IconPlus className="size-4" />
            {t("tally.people.add")}
          </Button>
        </form>
        {contacts.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : list.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/people/${encodeURIComponent(c.id)}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent"
                >
                  <span className="min-w-0 truncate text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.phone ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("tally.people.empty")}
          </p>
        )}
      </section>
    </main>
  );
}
