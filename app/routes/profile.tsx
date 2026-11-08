import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { Link } from "react-router";

import { ProfileForm } from "@/components/tally/ProfileForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/tally";

export function meta() {
  return [{ title: "Business · Tally" }];
}

export default function ProfileRoute() {
  const t = useT();
  const { isPending } = useProfile();
  useSetPageTitle(t("tally.nav.business"));
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        {isPending ? <Skeleton className="h-64 rounded-xl" /> : <ProfileForm />}
      </section>
      <p className="text-sm text-muted-foreground">
        {t("tally.profile.appSettingsHint")}{" "}
        <Link to="/settings" className="underline">
          {t("tally.profile.appSettings")}
        </Link>
      </p>
    </main>
  );
}
