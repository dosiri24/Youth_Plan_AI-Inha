"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AXIS_INFO, getPoleLabel } from "@/lib/city-axes";
import type { PersonalReport, RevisionSelection } from "@/lib/api";

type RevisionFormProps = {
  report: PersonalReport;
  revising: boolean;
  onRevise: (selections: RevisionSelection[], comment: string) => Promise<void>;
};

/** Stable keys identify exact sentences across four-axis regeneration. */
function selectionKey(selection: RevisionSelection): string {
  return `${selection.axis}:${selection.demand_id}:${selection.sentence_index}`;
}

/** Revision stays focused on selecting sentences and explaining the desired change. */
export function RevisionForm({
  report,
  revising,
  onRevise,
}: RevisionFormProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [comment, setComment] = useState("");
  const canRevise =
    selectedKeys.size > 0 && comment.trim().length > 0 && !revising;

  const toggle = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRevise) return;

    const selections = report.axis_demands.flatMap((axisDemand) =>
      axisDemand.demands.flatMap((demand) =>
        demand.description
          .map((_, sentenceIndex) => ({
            axis: axisDemand.axis,
            demand_id: demand.id,
            sentence_index: sentenceIndex,
          }))
          .filter((selection) => selectedKeys.has(selectionKey(selection))),
      ),
    );

    await onRevise(selections, comment.trim());
  };

  return (
    <section aria-labelledby="revision-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-primary">요구 수정</p>
          <h2
            id="revision-title"
            className="mt-2 text-[24px] font-bold tracking-[-0.03em]"
          >
            다르게 느껴지는 문장을 골라주세요
          </h2>
        </div>
        {report.meta.revision_count > 0 && (
          <span className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary">
            {report.meta.revision_count}번 반영
          </span>
        )}
      </div>
      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
        하나 이상의 문장을 고르고 의견을 남기면 네 축의 요구를 모두 다시 정리해
        드려요.
      </p>

      {report.meta.revision_count >= 15 && (
        <p className="mt-5 rounded-[20px] bg-[color-mix(in_srgb,var(--color-incheon-green)_10%,white)] px-4 py-3.5 text-[13px] leading-5 text-incheon-gray">
          충분히 여러 번 다듬었어요. 이제 제출해도 좋아요. 원한다면 계속 수정할
          수 있어요.
        </p>
      )}

      {revising && (
        <div
          aria-live="polite"
          className="mt-5 flex items-center gap-3 rounded-[20px] bg-secondary px-4 py-4 text-primary"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          <div>
            <p className="text-[14px] font-bold">
              요구 보고서를 다시 정리하고 있어요
            </p>
            <p className="mt-1 text-[12px] leading-5">
              선택한 의견을 반영해 네 축 전체를 새로 작성해요.
            </p>
          </div>
        </div>
      )}

      <form className="mt-6" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={revising}>
          <legend className="sr-only">수정할 요구 문장 선택</legend>
          <div
            className={`space-y-5 transition-opacity ${revising ? "opacity-45" : ""}`}
          >
            {report.axis_demands.map((axisDemand) => (
              <article
                key={axisDemand.axis}
                className="rounded-[24px] bg-card p-5"
              >
                <p className="text-[12px] font-bold text-muted-foreground">
                  {AXIS_INFO[axisDemand.axis].title}
                </p>
                <h3 className="mt-1.5 text-[18px] font-bold">
                  {axisDemand.letter} ·{" "}
                  {getPoleLabel(axisDemand.axis, axisDemand.letter)}
                </h3>

                <div className="mt-5 space-y-5">
                  {axisDemand.demands.map((demand) => (
                    <div key={demand.id}>
                      <h4 className="text-[16px] font-bold">{demand.title}</h4>
                      <div className="mt-3 space-y-2.5">
                        {demand.description.map((sentence, sentenceIndex) => {
                          const selection = {
                            axis: axisDemand.axis,
                            demand_id: demand.id,
                            sentence_index: sentenceIndex,
                          };
                          const key = selectionKey(selection);
                          const checked = selectedKeys.has(key);

                          return (
                            <label
                              key={key}
                              className={`flex cursor-pointer items-start gap-3 rounded-[18px] px-3.5 py-3 transition ${
                                checked
                                  ? "bg-secondary ring-1 ring-primary/20"
                                  : "bg-muted"
                              }`}
                            >
                              <input
                                checked={checked}
                                className="mt-1 size-4 shrink-0 accent-incheon-blue"
                                onChange={() => toggle(key)}
                                type="checkbox"
                              />
                              <span className="text-[14px] leading-6">
                                {sentence}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] bg-card p-5">
            <div className="flex items-center gap-2">
              <MessageSquareText
                aria-hidden="true"
                className="size-5 text-primary"
              />
              <label
                className="text-[16px] font-bold"
                htmlFor="revision-comment"
              >
                어떻게 바꾸면 좋을까요?
              </label>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              문장을 직접 고치는 대신, 빠진 내용이나 다른 생각을 알려주세요.
            </p>
            <textarea
              id="revision-comment"
              className="mt-4 min-h-28 w-full resize-none rounded-[18px] bg-muted px-4 py-3 text-[15px] leading-6 outline-none transition focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed"
              onChange={(event) => setComment(event.target.value)}
              placeholder="예: 조용한 환경도 좋지만, 청년들이 자연스럽게 만날 공간이 더 중요해요."
              value={comment}
            />
            <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
              선택한 문장 {selectedKeys.size}개
            </p>
            <Button
              className="mt-4 h-14 w-full rounded-2xl text-[15px] font-bold"
              disabled={!canRevise}
              type="submit"
            >
              {revising && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              )}
              {revising
                ? "네 축을 다시 정리하고 있어요"
                : "의견 반영하고 돌아가기"}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
