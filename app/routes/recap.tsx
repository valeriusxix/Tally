import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconSparkles } from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatQty, todayKey, useMoney, useProfile } from "@/lib/tally";
import { cn } from "@/lib/utils";
import { addDays } from "@shared/time";

export function meta() {
  return [{ title: "Recap · Tally" }];
}

export default function RecapRoute() {
  const t = useT();
  const money = useMoney();
  const { timezone } = useProfile();
  useSetPageTitle(t("tally.nav.recap"));
  const today = todayKey(timezone);
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from") ?? addDays(today, -6);
  const to = searchParams.get("to") ?? today;
  const { data, isPending } = useActionQuery("get-summary", { from, to });

  const presets = [
    { key: "today", from: today, to: today },
    { key: "week", from: addDays(today, -6), to: today },
    { key: "month", from: `${today.slice(0, 8)}01`, to: today },
    { key: "thirty", from: addDays(today, -29), to: today },
  ] as const;

  const totals = data?.totals;
  const days = data?.days ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.sales));
  const profit =
    (totals?.sales ?? 0) - (totals?.purchases ?? 0) - (totals?.expenses ?? 0);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.from === from && p.to === to ? "default" : "outline"}
            onClick={() => setSearchParams({ from: p.from, to: p.to })}
          >
            {t(`tally.recap.${p.key}`)}
          </Button>
        ))}
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            max={to}
            aria-label={t("tally.recap.from")}
            onChange={(e) => e.target.value && setSearchParams({ from: e.target.value, to })}
            className="h-8 w-36"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={to}
            min={from}
            aria-label={t("tally.recap.to")}
            onChange={(e) => e.target.value && setSearchParams({ from, to: e.target.value })}
            className="h-8 w-36"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="ms-auto"
          onClick={() =>
            sendToAgentChat({
              message: t("tally.recap.askPrompt", { from, to }),
              context: JSON.stringify({ period: { from, to } }),
              submit: true,
              openSidebar: true,
            })
          }
        >
          <IconSparkles className="size-4" />
          {t("tally.recap.ask")}
        </Button>
      </div>

      {isPending || !totals ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["sales", totals.sales],
                ["purchases", totals.purchases],
                ["expenses", totals.expenses],
                ["cashIn", totals.cashIn],
                ["cashOut", totals.cashOut],
                ["creditGiven", totals.creditGiven],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="bg-card px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{t(`tally.totals.${key}`)}</dt>
                <dd className="text-base font-semibold tabular-nums">{money(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {t("tally.recap.roughMargin", { amount: money(profit) })}
          </p>

          {days.length > 1 ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("tally.recap.salesByDay")}</h2>
              <div className="flex h-36 items-end gap-1" role="img" aria-label={t("tally.recap.salesByDay")}>
                {days.map((d) => (
                  <div key={d.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div
                      title={`${formatDay(d.date)}: ${money(d.sales)}`}
                      className="rounded-t bg-emerald-600/80 transition-colors group-hover:bg-emerald-600 dark:bg-emerald-500/70"
                      style={{ height: `${Math.max(d.sales ? 3 : 0, (d.sales / maxDay) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{formatDay(days[0]?.date ?? from)}</span>
                <span>{formatDay(days[days.length - 1]?.date ?? to)}</span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                {t("tally.recap.topItems")}
              </h2>
              <ul className="divide-y divide-border">
                {data.topItems.length ? (
                  data.topItems.map((i) => (
                    <li key={i.itemId} className="flex justify-between gap-2 px-4 py-2 text-sm">
                      <Link to={`/stock/${encodeURIComponent(i.itemId)}`} className="truncate hover:underline">
                        {i.name} <span className="text-muted-foreground">· {formatQty(i.qty, i.unit)}</span>
                      </Link>
                      <span className="tabular-nums">{money(i.total)}</span>
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-4 text-sm text-muted-foreground">{t("tally.recap.none")}</li>
                )}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                {t("tally.recap.topExpenses")}
              </h2>
              <ul className="divide-y divide-border">
                {data.topExpenses.length ? (
                  data.topExpenses.map((e) => (
                    <li key={e.description} className="flex justify-between gap-2 px-4 py-2 text-sm">
                      <span className="truncate first-letter:uppercase">{e.description}</span>
                      <span className="tabular-nums">{money(e.total)}</span>
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-4 text-sm text-muted-foreground">{t("tally.recap.none")}</li>
                )}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                {t("tally.recap.topDebtors")}
              </h2>
              <ul className="divide-y divide-border">
                {data.topDebtors.length ? (
                  data.topDebtors.map((d) => (
                    <li key={d.contactId} className="flex justify-between gap-2 px-4 py-2 text-sm">
                      <Link to={`/people/${encodeURIComponent(d.contactId)}`} className="truncate hover:underline">
                        {d.name}
                      </Link>
                      <span className={cn("tabular-nums text-emerald-700 dark:text-emerald-400")}>
                        {money(d.amount)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-4 text-sm text-muted-foreground">{t("tally.recap.none")}</li>
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
