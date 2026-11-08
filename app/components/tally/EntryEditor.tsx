import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { type Entry, ENTRY_TYPES, type EntryType, useProfile } from "@/lib/tally";
import { minorToMajorString, parseMajorToMinor } from "@shared/money";

type Form = {
  type: EntryType;
  contactId: string;
  itemId: string;
  qty: string;
  unitPrice: string;
  total: string;
  paid: string;
  description: string;
  date: string;
};

function toForm(entry: Entry, currency: string): Form {
  const m = (v: number | null) => (v === null ? "" : minorToMajorString(v, currency));
  return {
    type: entry.type,
    contactId: entry.contact?.id ?? "",
    itemId: entry.item?.id ?? "",
    qty: entry.qty === null ? "" : String(entry.qty),
    unitPrice: m(entry.unitPrice),
    total: m(entry.total),
    paid: m(entry.paid),
    description: entry.description ?? "",
    date: entry.localDate,
  };
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

export function EntryEditor({
  entry,
  onClose,
}: {
  entry: Entry | null;
  onClose: () => void;
}) {
  const t = useT();
  const { currency } = useProfile();
  const [form, setForm] = useState<Form | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const contacts = useActionQuery(
    "find-contact",
    { query: "", limit: 500 },
    { enabled: Boolean(entry) },
  );
  const items = useActionQuery(
    "find-item",
    { query: "", limit: 200 },
    { enabled: Boolean(entry) },
  );

  useEffect(() => {
    setForm(entry ? toForm(entry, currency) : null);
  }, [entry, currency]);

  const save = useActionMutation("update-entry", {
    onSuccess: () => {
      toast.success(t("tally.editor.saved"));
      onClose();
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.editor.saveFailed")),
  });
  const voidEntry = useActionMutation("void-entry", {
    onSuccess: () => {
      toast.success(t("tally.editor.voided"));
      setVoidOpen(false);
      onClose();
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.editor.saveFailed")),
  });

  if (!entry || !form) {
    return (
      <Sheet open={false} onOpenChange={() => onClose()}>
        <SheetContent side="right" />
      </Sheet>
    );
  }
  const original = toForm(entry, currency);
  const set = (key: keyof Form) => (value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !entry) return;
    const patch: Record<string, unknown> = { id: entry.id };
    const money = (key: "unitPrice" | "total" | "paid") => {
      if (form[key] === original[key]) return true;
      if (form[key].trim() === "") {
        patch[key] = null;
        return true;
      }
      const minor = parseMajorToMinor(form[key], currency);
      if (minor === null) {
        toast.error(t("tally.editor.invalidAmount"));
        return false;
      }
      patch[key] = minor;
      return true;
    };
    if (!money("unitPrice") || !money("total") || !money("paid")) return;
    if (form.type !== original.type) patch.type = form.type;
    if (form.contactId !== original.contactId)
      patch.contactId = form.contactId || null;
    if (form.itemId !== original.itemId) patch.itemId = form.itemId || null;
    if (form.qty !== original.qty) {
      const qty = form.qty.trim() === "" ? null : Number(form.qty);
      if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
        toast.error(t("tally.editor.invalidQty"));
        return;
      }
      patch.qty = qty;
    }
    if (form.description !== original.description)
      patch.description = form.description || null;
    if (form.date !== original.date) patch.occurredAt = form.date;
    if (Object.keys(patch).length === 1) {
      onClose();
      return;
    }
    save.mutate(patch as never);
  }

  const showMoney = form.type !== "stock_count";
  const showItem = ["sale", "purchase", "stock_count"].includes(form.type);
  const showPaid = form.type === "sale" || form.type === "purchase";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle>{t("tally.editor.title")}</SheetTitle>
        <SheetDescription className="text-xs">
          {entry.rawText
            ? t("tally.editor.heard", { text: entry.rawText })
            : t("tally.editor.noTranscript")}
        </SheetDescription>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry-type">{t("tally.editor.type")}</Label>
              <select
                id="entry-type"
                className={selectClass}
                value={form.type}
                onChange={(e) => set("type")(e.target.value)}
              >
                {ENTRY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`tally.types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">{t("tally.editor.date")}</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date")(e.target.value)}
              />
            </div>
          </div>
          {form.type !== "stock_count" ? (
            <div className="space-y-1.5">
              <Label htmlFor="entry-contact">{t("tally.editor.contact")}</Label>
              <select
                id="entry-contact"
                className={selectClass}
                value={form.contactId}
                onChange={(e) => set("contactId")(e.target.value)}
              >
                <option value="">{t("tally.editor.none")}</option>
                {contacts.data?.matches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {showItem ? (
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="entry-item">{t("tally.editor.item")}</Label>
                <select
                  id="entry-item"
                  className={selectClass}
                  value={form.itemId}
                  onChange={(e) => set("itemId")(e.target.value)}
                >
                  <option value="">{t("tally.editor.none")}</option>
                  {items.data?.matches.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-qty">{t("tally.editor.qty")}</Label>
                <Input
                  id="entry-qty"
                  inputMode="decimal"
                  value={form.qty}
                  onChange={(e) => set("qty")(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          {showMoney ? (
            <div className="grid grid-cols-2 gap-3">
              {showItem ? (
                <div className="space-y-1.5">
                  <Label htmlFor="entry-unit-price">
                    {t("tally.editor.unitPrice", { currency })}
                  </Label>
                  <Input
                    id="entry-unit-price"
                    inputMode="decimal"
                    value={form.unitPrice}
                    onChange={(e) => set("unitPrice")(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="entry-total">
                  {t("tally.editor.total", { currency })}
                </Label>
                <Input
                  id="entry-total"
                  inputMode="decimal"
                  value={form.total}
                  onChange={(e) => set("total")(e.target.value)}
                />
              </div>
              {showPaid ? (
                <div className="space-y-1.5">
                  <Label htmlFor="entry-paid">
                    {t("tally.editor.paid", { currency })}
                  </Label>
                  <Input
                    id="entry-paid"
                    inputMode="decimal"
                    value={form.paid}
                    onChange={(e) => set("paid")(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="entry-note">{t("tally.editor.note")}</Label>
            <Input
              id="entry-note"
              value={form.description}
              maxLength={500}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>
          {entry.voidReason ? (
            <p className="text-xs text-muted-foreground">
              {t("tally.editor.voidReason", { reason: entry.voidReason })}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-2">
            {entry.status !== "void" ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => setVoidOpen(true)}
              >
                {t("tally.editor.void")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t("tally.editor.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={save.isPending || entry.status === "void"}
              >
                {t("tally.editor.save")}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tally.editor.voidTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tally.editor.voidDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder={t("tally.editor.voidReasonPlaceholder")}
            aria-label={t("tally.editor.voidReasonPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tally.editor.keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!voidReason.trim() || voidEntry.isPending}
              onClick={(event) => {
                event.preventDefault();
                voidEntry.mutate({ id: entry.id, reason: voidReason.trim() });
              }}
            >
              {t("tally.editor.confirmVoid")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
