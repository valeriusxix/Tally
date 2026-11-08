import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconCircleCheck, IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { EntryEditor } from "@/components/tally/EntryEditor";
import { EntryRow } from "@/components/tally/EntryRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type Entry, useProfile } from "@/lib/tally";

export function meta() {
  return [{ title: "Needs You · Tally" }];
}

type Question = {
  id: string;
  question: string;
  field: string | null;
  choices: { label: string; patch?: Record<string, unknown> }[];
  createdAt: string;
  entry: Entry | null;
};

function QuestionCard({
  question,
  timezone,
  onEdit,
}: {
  question: Question;
  timezone: string;
  onEdit: (entry: Entry) => void;
}) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const resolve = useActionMutation("resolve-question", {
    onSuccess: () => toast.success(t("tally.needsYou.committed")),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.needsYou.failed")),
  });
  const discard = useActionMutation("void-entry", {
    onSuccess: () => toast.success(t("tally.needsYou.discarded")),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("tally.needsYou.failed")),
  });

  function askAgent() {
    const text = answer.trim();
    if (!text) return;
    sendToAgentChat({
      message: text,
      context: JSON.stringify({
        answeringQuestion: question.id,
        question: question.question,
        draftEntryId: question.entry?.id,
        instruction:
          "The owner is answering this Needs You question. Read the needs-you skill, then call resolve-question with the fields this answer gives.",
      }),
      contextLabel: t("tally.needsYou.contextLabel"),
      submit: true,
      openSidebar: true,
    });
    setAnswer("");
  }

  return (
    <article className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-base font-medium">{question.question}</p>
      {question.entry?.rawText ? (
        <p className="text-sm text-muted-foreground">
          “{question.entry.rawText}”
        </p>
      ) : null}
      {question.entry ? (
        <div className="rounded-xl bg-muted/60 p-1">
          <EntryRow
            entry={question.entry}
            timezone={timezone}
            onSelect={() => question.entry && onEdit(question.entry)}
          />
        </div>
      ) : null}
      {question.choices.length ? (
        <div className="flex flex-wrap gap-2">
          {question.choices.map((choice, index) => (
            <Button
              key={`${choice.label}-${index}`}
              variant="outline"
              size="sm"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({
                  questionId: question.id,
                  answer: choice.label,
                  choiceIndex: index,
                })
              }
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          askAgent();
        }}
      >
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t("tally.needsYou.answerPlaceholder")}
          aria-label={t("tally.needsYou.answerPlaceholder")}
        />
        <Button type="submit" size="icon" disabled={!answer.trim()} aria-label={t("tally.needsYou.sendAnswer")}>
          <IconSend className="size-4" />
        </Button>
      </form>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={discard.isPending || !question.entry}
          onClick={() =>
            question.entry &&
            discard.mutate({
              id: question.entry.id,
              reason: t("tally.needsYou.discardReason"),
            })
          }
        >
          {t("tally.needsYou.discard")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={resolve.isPending}
          onClick={() =>
            resolve.mutate({
              questionId: question.id,
              answer: t("tally.needsYou.editedAnswer"),
            })
          }
        >
          <IconCircleCheck className="size-4" />
          {t("tally.needsYou.commitAsIs")}
        </Button>
      </div>
    </article>
  );
}

export default function NeedsYouRoute() {
  const t = useT();
  const { timezone } = useProfile();
  useSetPageTitle(t("tally.nav.needsYou"));
  const { data, isPending } = useActionQuery("list-questions", { limit: 100 });
  const [editing, setEditing] = useState<Entry | null>(null);
  const questions = (data?.questions ?? []) as Question[];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      {isPending ? (
        Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))
      ) : questions.length ? (
        questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            timezone={timezone}
            onEdit={setEditing}
          />
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <IconCircleCheck className="size-8 text-emerald-600" />
          <p className="text-sm text-muted-foreground">{t("tally.needsYou.empty")}</p>
        </div>
      )}
      <EntryEditor entry={editing} onClose={() => setEditing(null)} />
    </main>
  );
}
