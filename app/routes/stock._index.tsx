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
import { formatQty, useMoney, useProfile } from "@/lib/tally";
import { cn } from "@/lib/utils";
import { parseMajorToMinor } from "@shared/money";

export default function StockIndexRoute() {
  const t = useT();
  const money = useMoney();
  const { currency } = useProfile();
  useSetPageTitle(t("tally.nav.stock"));
  const items = useActionQuery("find-item", { query: "", limit: 200 });
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const create = useActionMutation("upsert-item", {
    onSuccess: () => {
      setName("");
      setUnit("");
      setPrice("");
      toast.success(t("tally.stock.added"));
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.stock.addFailed")),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    let defaultPrice: number | undefined;
    if (price.trim()) {
      const minor = parseMajorToMinor(price, currency);
      if (minor === null) {
        toast.error(t("tally.editor.invalidAmount"));
        return;
      }
      defaultPrice = minor;
    }
    create.mutate({
      name: name.trim(),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(defaultPrice !== undefined ? { defaultPrice } : {}),
    });
  }

  const rows = items.data?.matches ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("tally.stock.itemName")}
          aria-label={t("tally.stock.itemName")}
          className="h-9 min-w-40 flex-1"
        />
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder={t("tally.stock.unit")}
          aria-label={t("tally.stock.unit")}
          className="h-9 w-28"
        />
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t("tally.stock.price", { currency })}
          aria-label={t("tally.stock.price", { currency })}
          inputMode="decimal"
          className="h-9 w-36"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!name.trim() || create.isPending}>
          <IconPlus className="size-4" />
          {t("tally.stock.add")}
        </Button>
      </form>

      {items.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((item) => (
            <li key={item.id}>
              <Link
                to={`/stock/${encodeURIComponent(item.id)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.defaultPrice !== null
                      ? t("tally.stock.each", {
                          price: money(item.defaultPrice),
                          unit: item.unit ?? t("tally.stock.unitFallback"),
                        })
                      : t("tally.stock.noPrice")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    item.stock !== null && item.stock < 0 && "text-red-700 dark:text-red-400",
                  )}
                >
                  {item.stock === null
                    ? t("tally.stock.notTracked")
                    : formatQty(item.stock, item.unit)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("tally.stock.empty")}
        </p>
      )}
    </main>
  );
}
