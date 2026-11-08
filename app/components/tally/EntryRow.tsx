import { useT } from "@agent-native/core/client/i18n";
import {
  IconAlertTriangle,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconBox,
  IconMicrophone,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  type Entry,
  entryDirection,
  formatQty,
  formatTime,
  useMoney,
} from "@/lib/tally";
import { cn } from "@/lib/utils";

export function entryTitle(entry: Entry, t: ReturnType<typeof useT>) {
  const what = entry.item
    ? `${formatQty(entry.qty, entry.item.unit)} ${entry.item.name}`.trim()
    : (entry.description ?? "");
  const who = entry.contact?.name ?? "";
  return t(`tally.entryTitle.${entry.type}`, {
    what: what || t("tally.entry.unspecified"),
    who: who || t("tally.entry.walkIn"),
  });
}

export function EntryRow({
  entry,
  timezone,
  selected,
  onSelect,
  showDate,
}: {
  entry: Entry;
  timezone: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
  showDate?: boolean;
}) {
  const t = useT();
  const money = useMoney();
  const direction = entryDirection(entry.type);
  const Icon =
    direction === "in"
      ? IconArrowDownLeft
      : direction === "out"
        ? IconArrowUpRight
        : IconBox;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(entry.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent",
        entry.status === "void" && "opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          direction === "in" &&
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
          direction === "out" &&
            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
          direction === "neutral" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "truncate text-sm font-medium",
              entry.status === "void" && "line-through",
            )}
          >
            {entryTitle(entry, t)}
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {entry.type === "stock_count"
              ? formatQty(entry.qty, entry.item?.unit ?? null)
              : money(entry.total)}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {showDate ? `${entry.localDate} · ` : ""}
            {formatTime(entry.occurredAt, timezone)}
          </span>
          {entry.owed !== null && entry.owed > 0 ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {entry.type === "sale"
                ? t("tally.entry.owesYou", { amount: money(entry.owed) })
                : t("tally.entry.youOwe", { amount: money(entry.owed) })}
            </span>
          ) : null}
          {entry.source === "mic" ? (
            <IconMicrophone
              className="size-3"
              aria-label={t("tally.entry.fromVoice")}
            />
          ) : null}
          {entry.assumed.map((field) => (
            <Badge key={field} variant="outline" className="h-5 px-1.5 text-[11px]">
              {t("tally.entry.assumed", { field })}
            </Badge>
          ))}
          {entry.status === "draft" ? (
            <Badge
              variant="outline"
              className="h-5 gap-1 border-amber-400 px-1.5 text-[11px] text-amber-800 dark:text-amber-300"
            >
              <IconAlertTriangle className="size-3" />
              {t("tally.entry.needsYou")}
            </Badge>
          ) : null}
          {entry.status === "void" ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
              {t("tally.entry.void")}
            </Badge>
          ) : null}
        </span>
      </span>
    </button>
  );
}
