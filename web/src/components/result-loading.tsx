"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const STAGES = [
  "대화를 처음부터 다시 읽고 있어요",
  "중요한 이야기를 골라내고 있어요",
  "도시 유형 네 글자를 계산하고 있어요",
  "왜 그 글자가 나왔는지 정리하고 있어요",
  "인천에 바라는 변화를 모으고 있어요",
  "보고서를 마지막으로 다듬고 있어요",
];

const STAGE_MS = 4500;

const DONE_STAGE = "다 만들었어요";

/** While waiting the bar must not claim completion, so it only eases toward this ceiling. */
const PROGRESS_CEILING = "92%";

type ResultLoadingProps = {
  done: boolean;
};

/** The wait needs motion and news, because thirty seconds of one static line feels broken. */
export function ResultLoading({ done }: ResultLoadingProps) {
  const [stage, setStage] = useState(0);
  const [filling, setFilling] = useState(false);

  // The last stage holds instead of looping: restarting the story would be a lie.
  useEffect(() => {
    if (done || stage === STAGES.length - 1) return;

    const timer = window.setTimeout(() => setStage(stage + 1), STAGE_MS);
    return () => window.clearTimeout(timer);
  }, [done, stage]);

  // Painting the start width first is what lets the width transition actually run.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFilling(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      aria-busy="true"
      className="flex flex-1 flex-col bg-card px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <p className="text-[13px] font-bold text-primary">유스플랜AI 결과</p>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative flex size-24 items-center justify-center">
          <span
            aria-hidden="true"
            className="loading-halo absolute size-24 rounded-full bg-primary/12"
          />
          <span className="relative flex size-16 items-center justify-center rounded-[24px] bg-secondary text-primary">
            <Sparkles aria-hidden="true" className="size-7" />
          </span>
        </div>

        <h1 className="mt-8 text-[26px] leading-9 font-bold tracking-[-0.03em]">
          당신의 인천을
          <br />한 장씩 정리하고 있어요
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-muted-foreground">
          모두 만드는 데 30초쯤 걸려요.
          <br />이 화면을 벗어나지 말고 기다려 주세요.
        </p>
      </div>

      <div className="shrink-0">
        <p
          aria-live="polite"
          className="text-center text-[15px] font-bold text-foreground"
        >
          <span
            key={done ? DONE_STAGE : stage}
            className="loading-stage inline-block"
          >
            {done ? DONE_STAGE : STAGES[stage]}
          </span>
        </p>
        <div
          aria-label="결과를 만들고 있어요"
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="loading-progress h-full rounded-full bg-linear-to-r from-primary via-incheon-green to-primary"
            style={{ width: done ? "100%" : filling ? PROGRESS_CEILING : "4%" }}
          />
        </div>
        <p className="mt-3 text-center text-[13px] leading-5 text-muted-foreground">
          {done
            ? "결과 화면으로 넘어갈게요."
            : "다 만들어지면 결과 화면으로 바로 넘어가요."}
        </p>
      </div>
    </section>
  );
}
