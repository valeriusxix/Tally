import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/lib/tally";

const COMMON_CURRENCIES = [
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "TZS",
  "ZAR",
  "XOF",
  "XAF",
  "EGP",
  "MAD",
  "ETB",
  "RWF",
  "INR",
  "PKR",
  "BDT",
  "PHP",
  "IDR",
  "BRL",
  "MXN",
  "USD",
  "EUR",
  "GBP",
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const { profile } = useProfile();
  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const timezones = useMemo(() => {
    const list = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    return list?.length ? list : [browserTz];
  }, [browserTz]);
  const [businessName, setBusinessName] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState(browserTz);
  const [languages, setLanguages] = useState("");
  const [tone, setTone] = useState<"friendly" | "firm" | "formal">("friendly");

  useEffect(() => {
    if (!profile) return;
    setBusinessName(profile.businessName);
    setCurrency(profile.currency);
    setTimezone(profile.timezone);
    setLanguages(profile.languages.join(", "));
    setTone(profile.reminderTone);
  }, [profile]);

  const save = useActionMutation("update-profile", {
    onSuccess: () => {
      toast.success(t("tally.profile.saved"));
      onSaved?.();
    },
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.profile.saveFailed")),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currency) {
      toast.error(t("tally.profile.currencyRequired"));
      return;
    }
    save.mutate({
      businessName: businessName.trim(),
      currency,
      timezone,
      languages: languages
        .split(/[,\s]+/)
        .map((l) => l.trim())
        .filter(Boolean),
      reminderTone: tone,
    });
  }

  const currencyOptions = COMMON_CURRENCIES.includes(currency) || !currency
    ? COMMON_CURRENCIES
    : [currency, ...COMMON_CURRENCIES];

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="profile-name">{t("tally.profile.businessName")}</Label>
        <Input
          id="profile-name"
          value={businessName}
          maxLength={120}
          onChange={(e) => setBusinessName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-currency">{t("tally.profile.currency")}</Label>
        <select
          id="profile-currency"
          className={selectClass}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          required
        >
          <option value="" disabled>
            {t("tally.profile.chooseCurrency")}
          </option>
          {currencyOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {profile && currency !== profile.currency ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("tally.profile.currencyWarning")}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-timezone">{t("tally.profile.timezone")}</Label>
        <select
          id="profile-timezone"
          className={selectClass}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-languages">{t("tally.profile.languages")}</Label>
        <Input
          id="profile-languages"
          value={languages}
          placeholder="en, pcm, yo"
          onChange={(e) => setLanguages(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-tone">{t("tally.profile.tone")}</Label>
        <select
          id="profile-tone"
          className={selectClass}
          value={tone}
          onChange={(e) => setTone(e.target.value as typeof tone)}
        >
          <option value="friendly">{t("tally.profile.toneFriendly")}</option>
          <option value="firm">{t("tally.profile.toneFirm")}</option>
          <option value="formal">{t("tally.profile.toneFormal")}</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={save.isPending}>
          {profile ? t("tally.profile.save") : t("tally.profile.start")}
        </Button>
      </div>
    </form>
  );
}
