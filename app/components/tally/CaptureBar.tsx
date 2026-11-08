import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { writeClientAppState } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useLiveTranscription } from "@agent-native/core/client/transcription/use-live-transcription";
import {
  IconMicrophone,
  IconPlayerStopFilled,
  IconSend,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TAB_ID } from "@/lib/tab-id";
import { todayKey, useProfile } from "@/lib/tally";
import { cn } from "@/lib/utils";

// Speech recognition needs one locale; these cover common owner languages.
// Notes can still mix languages: the agent reads whatever is transcribed,
// and typing always works.
const SPEECH_LOCALES: Record<string, string> = {
  en: "en-NG",
  pcm: "en-NG",
  yo: "yo-NG",
  ha: "ha-NG",
  ig: "ig-NG",
  sw: "sw-KE",
  fr: "fr-FR",
  pt: "pt-BR",
  es: "es-ES",
  ar: "ar-SA",
  hi: "hi-IN",
  am: "am-ET",
  zu: "zu-ZA",
  tw: "ak-GH",
};

const LOCALE_STORAGE_KEY = "tally.speechLocale";

function storedLocale() {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CaptureBar() {
  const t = useT();
  const { profile, timezone } = useProfile();
  const localeOptions = useMemo(() => {
    const fromProfile = (profile?.languages ?? []).map(
      (lang) => SPEECH_LOCALES[lang] ?? lang,
    );
    const browser =
      typeof navigator !== "undefined" ? [navigator.language] : [];
    return [...new Set([...fromProfile, ...browser, "en-US"])];
  }, [profile?.languages]);
  const [locale, setLocale] = useState<string>(
    () => storedLocale() ?? localeOptions[0] ?? "en-US",
  );
  useEffect(() => {
    if (!localeOptions.includes(locale) && !storedLocale())
      setLocale(localeOptions[0] ?? "en-US");
  }, [localeOptions, locale]);

  const speech = useLiveTranscription({ lang: locale });
  const [text, setText] = useState("");
  const [source, setSource] = useState<"mic" | "chat">("chat");

  const live = speech.isActive
    ? [speech.transcript, speech.interimText].filter(Boolean).join(" ")
    : "";

  async function toggleMic() {
    if (speech.isActive) {
      const said = (await speech.stopAndWait()).trim();
      if (said) {
        setText((prev) => (prev ? `${prev} ${said}` : said));
        setSource("mic");
      }
      return;
    }
    speech.start();
  }

  function send() {
    const note = text.trim();
    if (!note) return;
    void writeClientAppState(
      "capture",
      { source, at: new Date().toISOString() },
      { requestSource: TAB_ID },
    ).catch(() => {});
    sendToAgentChat({
      message: note,
      context: JSON.stringify({
        capture: { source },
        today: todayKey(timezone),
        timezone,
        instruction:
          "This is a bookkeeping note. Read the voice-capture skill, record it, verify, and confirm in one line per entry.",
      }),
      contextLabel: t("tally.capture.contextLabel"),
      submit: true,
      openSidebar: true,
    });
    setText("");
    setSource("chat");
  }

  return (
    <section
      aria-label={t("tally.capture.label")}
      className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => void toggleMic()}
          disabled={!speech.supported}
          aria-pressed={speech.isActive}
          aria-label={
            speech.isActive ? t("tally.capture.stop") : t("tally.capture.speak")
          }
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:size-16",
            speech.isActive
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {speech.isActive ? (
            <IconPlayerStopFilled className="size-6" />
          ) : (
            <IconMicrophone className="size-7" strokeWidth={1.8} />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          {speech.isActive ? (
            <p
              aria-live="polite"
              className="min-h-14 rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
            >
              {live || (
                <span className="text-muted-foreground">
                  {t("tally.capture.listening")}
                </span>
              )}
            </p>
          ) : (
            <Textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (!event.target.value) setSource("chat");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={t("tally.capture.placeholder")}
              aria-label={t("tally.capture.placeholder")}
              className="min-h-14 resize-none"
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("tally.capture.speechLanguage")}
              <select
                value={locale}
                onChange={(event) => {
                  setLocale(event.target.value);
                  try {
                    localStorage.setItem(LOCALE_STORAGE_KEY, event.target.value);
                  } catch {}
                }}
                disabled={speech.isActive}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                {localeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {!speech.supported ? (
              <span className="text-xs text-muted-foreground">
                {t("tally.capture.unsupported")}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={!text.trim() || speech.isActive}
            >
              <IconSend className="size-4" />
              {t("tally.capture.send")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
