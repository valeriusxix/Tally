import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { EntryEditor } from "@/components/tally/EntryEditor";
import { EntryRow } from "@/components/tally/EntryRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { type Entry, formatQty, useProfile } from "@/lib/tally";
import { minorToMajorString, parseMajorToMinor } from "@shared/money";

export default function ItemRoute() {
  const t = useT();
  const { currency, timezone } = useProfile();
  const { itemId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryId = searchParams.get("entry");
  const items = useActionQuery("find-item", { query: "", limit: 200 });
  const item = items.data?.matches.find((i) => i.id === itemId);
  useSetPageTitle(item?.name ?? t("tally.nav.stock"));
  const entries = useActionQuery("list-entries", { itemId, status: "all", limit: 200 });
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [count, setCount] = useState("");
  useEffect(() => {
    if (!item) return;
    setUnit(item.unit ?? "");
    setPrice(item.defaultPrice === null ? "" : minorToMajorString(item.defaultPrice, currency));
  }, [item, currency]);

  const update = useActionMutation("upsert-item", {
    onSuccess: () => toast.success(t("tally.stock.saved")),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.stock.saveFailed")),
  });
  const recount = useActionMutation("log-entry", {
    onSuccess: () => {
      setCount("");
      toast.success(t("tally.stock.counted"));
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.stock.saveFailed")),
  });

  const rows = (entries.data?.entries ?? []) as Entry[];
  const focused = rows.find((e) => e.id === entryId) ?? null;

  if (items.isPending) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }
  if (!item) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">{t("tally.stock.notFound")}</p>
        <Link to="/stock" className="mt-3 inline-block text-sm underline">
          {t("tally.stock.back")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <Link
        to="/stock"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        {t("tally.stock.back")}
      </Link>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{item.name}</h1>
            {item.aliases.length ? (
              <p className="text-xs text-muted-foreground">
                {t("tally.contact.aka", { names: item.aliases.join(", ") })}
              </p>
            ) : null}
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            {item.stock === null ? t("tally.stock.notTracked") : formatQty(item.stock, item.unit)}
          </p>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            let defaultPrice: number | null = null;
            if (price.trim()) {
              const minor = parseMajorToMinor(price, currency);
              if (minor === null) {
                toast.error(t("tally.editor.invalidAmount"));
                return;
              }
              defaultPrice = minor;
            }
            update.mutate({ id: item.id, unit: unit.trim() || null, defaultPrice });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="item-unit">{t("tally.stock.unit")}</Label>
            <Input id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-price">{t("tally.stock.price", { currency })}</Label>
            <Input
              id="item-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={update.isPending}>
            {t("tally.stock.save")}
          </Button>
        </form>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={item.trackStock}
            onCheckedChange={(checked) => update.mutate({ id: item.id, trackStock: checked })}
          />
          {t("tally.stock.trackStock")}
        </label>
        {item.trackStock ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const qty = Number(count);
              if (!count.trim() || !Number.isFinite(qty) || qty < 0) {
                toast.error(t("tally.editor.invalidQty"));
                return;
              }
              recount.mutate({ type: "stock_count", itemId: item.id, qty, source: "ui" });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="item-count">{t("tally.stock.countLabel")}</Label>
              <Input
                id="item-count"
                inputMode="decimal"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-36"
              />
            </div>
            <Button type="submit" disabled={recount.isPending}>
              {t("tally.stock.recount")}
            </Button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-1.5">
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
    </main>
  );
}
