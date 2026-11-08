import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { CaptureBar } from "@/components/tally/CaptureBar";
import { EntryEditor } from "@/components/tally/EntryEditor";
import { EntryRow } from "@/components/tally/EntryRow";
import { ProfileForm } from "@/components/tally/ProfileForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, todayKey, useMoney, useProfile, type Entry } from "@/lib/tally";
import { addDays } from "@shared/time";

export function meta() {
  return [{ title: "Today · Tally" }];
}

export default function TodayRoute() {
  const t = useT();
  const money = useMoney();
  const { configured, isPending: profilePending, timezone, profile } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayKey(timezone);
  const date = searchParams.get("date") ?? today;
  const entryId = searchParams.get("entry");
  useSetPageTitle(profile?.businessName || t("tally.nav.today"));

  const params = useMemo(() => ({ from: date, to: date, limit: 300 }), [date]);
  const entries = useActionQuery("list-entries", params, { enabled: configured });
  const summary = useActionQuery(
    "get-summary",
    { from: date, to: date },
    { enabled: configured },
  );
  const focusedQuery = useActionQuery(
    "list-entries",
    { status: "all", limit: 500 },
    { enabled: Boolean(entryId) && configured },
  );
  const rows = (entries.data?.entries ?? []) as Entry[];
  const focused =
    (rows.find((e) => e.id === entryId) ??
      (focusedQuery.data?.entries as Entry[] | undefined)?.find(
        (e) => e.id === entryId,
      )) ||
    null;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: key === "entry" });
  }

  if (profilePending) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("tally.setup.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("tally.setup.body")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <ProfileForm />
        </div>
      </main>
    );
  }

  const totals = summary.data?.totals;
  const openQuestions = summary.data?.openQuestions ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      {date === today ? <CaptureBar /> : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("tally.today.previousDay")}
            onClick={() => setParam("date", addDays(date, -1))}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-28 text-center text-sm font-semibold">
            {date === today ? t("tally.today.today") : formatDay(date)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("tally.today.nextDay")}
            disabled={date >= today}
            onClick={() => {
              const next = addDays(date, 1);
              setParam("date", next >= today ? null : next);
            }}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
        {openQuestions > 0 ? (
          <Link
            to="/needs-you"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
          >
            <IconAlertTriangle className="size-3.5" />
            {t("tally.today.needsYou", { count: openQuestions })}
          </Link>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {(
          [
            ["sales", totals?.sales],
            ["cashIn", totals?.cashIn],
            ["cashOut", totals?.cashOut],
            ["creditGiven", totals?.creditGiven],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="bg-card px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">
              {t(`tally.totals.${key}`)}
            </dt>
            <dd className="text-base font-semibold tabular-nums">
              {summary.isPending ? <Skeleton className="mt-1 h-5 w-20" /> : money(value ?? 0)}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-label={t("tally.today.entries")} className="rounded-xl border border-border bg-card p-1.5">
        {entries.isPending ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  entry={entry}
                  timezone={timezone}
                  selected={entry.id === entryId}
                  onSelect={(id) => setParam("entry", id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {date === today ? t("tally.today.emptyToday") : t("tally.today.emptyDay")}
          </p>
        )}
      </section>

      <EntryEditor entry={focused} onClose={() => setParam("entry", null)} />
    </main>
  );
}
