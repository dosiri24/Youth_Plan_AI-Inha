"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, LoaderCircle, LockKeyhole } from "lucide-react";

import { AxisReasons } from "@/components/axis-reasons";
import { CityTypeCard } from "@/components/city-type-card";
import { ReportOverview } from "@/components/report-overview";
import { ResultLoading } from "@/components/result-loading";
import { RevisionForm, REVISION_FORM_ID } from "@/components/revision-form";
import { ShareActions, type CardAction } from "@/components/share-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  generateResult,
  reviseResult,
  submitResult,
  type PersonalReport,
  type ResultResponse,
  type RevisionSelection,
  type TypeResult,
} from "@/lib/api";
import { getCityType } from "@/lib/city-types";
import { PRIZE_DRAW_OPEN, PRIZE_FORM_URL } from "@/lib/prize";
import { downloadTypeCard, shareTypeCard } from "@/lib/share-card";
import { useBackGuard } from "@/lib/use-back-guard";
import { cn } from "@/lib/utils";

type ResultScreenProps = {
  sessionId: string;
  onError: () => void;
  onReturn: () => void;
};

type ResultStep = "type" | "report" | "revise";

type ResultHeaderProps = {
  description?: string;
  title: string;
};

/** A consistent header makes each result step feel like one focused screen. */
function ResultHeader({ description, title }: ResultHeaderProps) {
  return (
    <header className="bg-card px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5">
      <h1 className="text-[27px] font-bold tracking-[-0.03em]">{title}</h1>
      {description && (
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}

/** Going forward and going back belong at the thumb, not at the top corner (PLAN 2.4). */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 gap-2.5 bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(23,25,26,0.06)]">
      {children}
    </div>
  );
}

/** One scroll region above one action bar keeps the bar visible at any scroll offset. */
function ResultStepLayout({
  actions,
  children,
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      <ActionBar>{actions}</ActionBar>
    </div>
  );
}

type ResultFailedProps = {
  onRetry: () => void;
  onReturn: () => void;
};

/** A failed generation leaves the session intact, so asking again is the way out. */
function ResultFailed({ onRetry, onReturn }: ResultFailedProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center bg-card px-6 text-center">
      <h1 className="text-[26px] leading-9 font-bold tracking-[-0.03em]">
        결과를 만들지 못했어요
      </h1>
      <p className="mt-4 text-[15px] leading-6 text-muted-foreground">
        나눈 이야기는 그대로 있어요. 한 번 더 해 볼까요?
      </p>
      <Button
        className="mt-9 h-14 w-full rounded-2xl text-base font-bold"
        onClick={onRetry}
      >
        다시 시도
      </Button>
      <Button
        className="mt-2.5 h-14 w-full rounded-2xl text-[15px] font-bold"
        onClick={onReturn}
        variant="secondary"
      >
        처음 화면으로
      </Button>
    </section>
  );
}

/** Volatile results need one concise warning after the participant submits. */
function ResultNotice() {
  return (
    <div className="flex gap-3 rounded-[20px] bg-card px-4 py-4">
      <LockKeyhole
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-incheon-gray"
      />
      <p className="text-[13px] leading-5 text-muted-foreground">
        이 결과는 지금 화면에만 남아 있어요. 새로고침하거나 화면을 벗어나면 다시
        볼 수 없어요.
      </p>
    </div>
  );
}

const SCALE_SCORES = [1, 2, 3, 4, 5];

type ScaleQuestionProps = {
  highLabel: string;
  lowLabel: string;
  name: string;
  onChange: (score: number) => void;
  question: string;
  value: number | null;
};

/** Native radios keep the scale reachable by keyboard and screen reader (PLAN 2.4). */
function ScaleQuestion({
  highLabel,
  lowLabel,
  name,
  onChange,
  question,
  value,
}: ScaleQuestionProps) {
  return (
    <fieldset>
      <legend className="text-[15px] leading-6 font-bold">{question}</legend>
      {/* The row owns the painted height so the labels below can reach past it
          without the cells growing back to meet them. */}
      <div className="mt-3.5 flex h-9 gap-2">
        {SCALE_SCORES.map((score) => (
          // Positioned so the sr-only radio is clipped by the scroll area; without an
          // anchor it lands on the document and drags the whole page down on tap. The
          // negative margin buys a finger-sized target from a cell this short.
          <label
            className="relative -my-1.5 flex flex-1 cursor-pointer py-1.5"
            key={score}
          >
            <input
              checked={value === score}
              className="peer sr-only"
              name={name}
              onChange={() => onChange(score)}
              type="radio"
              value={score}
            />
            <span className="flex flex-1 items-center justify-center rounded-[12px] bg-muted text-[15px] font-semibold text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:font-bold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
              {score}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between text-[12px] text-muted-foreground">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </fieldset>
  );
}

type SatisfactionProps = {
  accuracy: number | null;
  ease: number | null;
  onAccuracyChange: (score: number) => void;
  onEaseChange: (score: number) => void;
};

/** Answering stays optional: submission must never wait on these two questions. */
function Satisfaction({
  accuracy,
  ease,
  onAccuracyChange,
  onEaseChange,
}: SatisfactionProps) {
  return (
    <section className="space-y-7 rounded-[24px] bg-card p-5">
      <ScaleQuestion
        highLabel="편했어요"
        lowLabel="불편했어요"
        name="satisfaction-ease"
        onChange={onEaseChange}
        question="이렇게 대화로 의견을 내는 방식이 편했나요?"
        value={ease}
      />
      <ScaleQuestion
        highLabel="잘 담겼어요"
        lowLabel="아니에요"
        name="satisfaction-accuracy"
        onChange={onAccuracyChange}
        question="정리된 결과가 내 생각을 잘 담고 있나요?"
        value={accuracy}
      />
    </section>
  );
}

/** The draw runs on a separate form so contact details never enter the submission. */
function PrizeEntry() {
  return (
    <section className="rounded-[20px] bg-card px-4 py-4">
      <h2 className="text-[15px] font-bold">
        스타벅스 쿠폰 추첨에 응모할 수 있어요
      </h2>
      <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
        제출을 마치고 응모한 분들 중 10명을 무작위로 뽑아 스타벅스 쿠폰을
        드려요. 수집이 끝나는 9월 말에 응모할 때 남긴 연락처로 따로 알려 드려요.
      </p>
      <a
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "mt-4 h-13 w-full rounded-2xl text-[15px] font-bold",
        )}
        href={PRIZE_FORM_URL}
        rel="noreferrer"
        target="_blank"
      >
        추첨 응모하러 가기
      </a>
    </section>
  );
}

type SubmittedProps = {
  action: CardAction;
  nickname: string;
  typeResult: TypeResult;
  onDownload: () => void;
  onShare: () => void;
};

/** Submitted results stay entirely in volatile client state for sharing. */
function Submitted({
  action,
  nickname,
  onDownload,
  onShare,
  typeResult,
}: SubmittedProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
      <header className="bg-card px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-incheon-green text-white">
          <Check aria-hidden="true" className="size-6" strokeWidth={2.5} />
        </div>
        <h1 className="mt-5 text-[27px] font-bold tracking-[-0.03em]">
          내 목소리가 제출됐어요
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
          도시유형 카드를 공유하거나 이미지로 간직해 보세요.
        </p>
      </header>

      <div className="space-y-5 px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <CityTypeCard nickname={nickname} typeResult={typeResult} />
        <ShareActions
          action={action}
          onDownload={onDownload}
          onShare={onShare}
        />
        {PRIZE_DRAW_OPEN && <PrizeEntry />}
        <ResultNotice />
      </div>
    </div>
  );
}

/** The controller retains one fetched result while its three views change. */
export function ResultScreen({
  sessionId,
  onError,
  onReturn,
}: ResultScreenProps) {
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [report, setReport] = useState<PersonalReport | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState<ResultStep>("type");
  const [revising, setRevising] = useState(false);
  const [reviseReady, setReviseReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ease, setEase] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [cardAction, setCardAction] = useState<CardAction>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const generatingRef = useRef(false);

  // The ref guards the mount from firing twice and the failure screen from firing
  // a second request, which is the same guarantee, so one flag carries both.
  const generate = useCallback(() => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerationFailed(false);

    void generateResult(sessionId)
      .then((fetched) => {
        setResult(fetched);
        setReport(fetched.report);
      })
      .catch(() => setGenerationFailed(true))
      .finally(() => {
        generatingRef.current = false;
      });
  }, [sessionId]);

  useEffect(() => {
    generate();
  }, [generate]);

  // The first step has no earlier step, and a submitted session no longer exists.
  useBackGuard(() => {
    if (submissionId) onReturn();
    else if (step === "revise" && !revising) setStep("report");
    else if (step === "report" && !submitting) setStep("type");
  });

  const revise = async (selections: RevisionSelection[], comment: string) => {
    if (revising) return;

    setRevising(true);
    try {
      setReport(await reviseResult(sessionId, selections, comment));
      setStep("report");
    } catch {
      onError();
    } finally {
      setRevising(false);
    }
  };

  const submit = async () => {
    if (submitting || revising) return;

    setSubmitting(true);
    try {
      setSubmissionId(await submitResult(sessionId, ease, accuracy));
    } catch {
      onError();
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    if (!result || cardAction !== null) return;

    setCardAction("share");
    try {
      await shareTypeCard(getCityType(result.type_result.code));
    } catch {
      // Share/save failure must not discard the result; only this attempt ends (PLAN 9.3, D1).
    } finally {
      setCardAction(null);
    }
  };

  const download = async () => {
    if (!result || cardAction !== null) return;

    setCardAction("download");
    try {
      await downloadTypeCard(getCityType(result.type_result.code));
    } catch {
      // Share/save failure must not discard the result; only this attempt ends (PLAN 9.3, D1).
    } finally {
      setCardAction(null);
    }
  };

  if (generationFailed)
    return <ResultFailed onRetry={generate} onReturn={onReturn} />;

  if (!result || !report || !revealed)
    return (
      <ResultLoading done={result !== null} onDone={() => setRevealed(true)} />
    );

  const typeResult = result.type_result;

  if (submissionId) {
    return (
      <Submitted
        action={cardAction}
        nickname={report.self_info.nickname}
        onDownload={() => void download()}
        onShare={() => void share()}
        typeResult={typeResult}
      />
    );
  }

  if (step === "type") {
    return (
      <ResultStepLayout
        key={step}
        actions={
          <Button
            className="h-14 flex-1 rounded-2xl text-[16px] font-bold"
            disabled={cardAction !== null}
            onClick={() => setStep("report")}
          >
            내 이야기와 요구 확인하기
          </Button>
        }
      >
        <ResultHeader
          description="대화를 바탕으로 정리한 내 도시유형이에요."
          title="내 도시유형"
        />
        <div className="space-y-10 px-5 pt-6 pb-8">
          <div className="space-y-4">
            <CityTypeCard
              nickname={report.self_info.nickname}
              typeResult={typeResult}
            />
            <ShareActions
              action={cardAction}
              onDownload={() => void download()}
              onShare={() => void share()}
            />
          </div>
          <AxisReasons reasons={report.axis_reasons} />
        </div>
      </ResultStepLayout>
    );
  }

  if (step === "report") {
    return (
      <ResultStepLayout
        key={step}
        actions={
          <>
            <Button
              className="h-14 flex-1 rounded-2xl text-[15px] font-bold"
              disabled={submitting}
              onClick={() => setStep("type")}
              variant="secondary"
            >
              이전
            </Button>
            <Button
              className="h-14 flex-[2] rounded-2xl text-[16px] font-bold"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              )}
              {submitting ? "제출하고 있어요" : "제출하기"}
            </Button>
          </>
        }
      >
        <ResultHeader title="내 이야기와 요구 확인" />
        <div className="space-y-12 px-5 pt-6 pb-8">
          <ReportOverview report={report} />

          {/* The questions come after the revision offer so the second one is
              answered about the wording actually being submitted, and stay above
              the closing note so that note still sits next to the button. */}
          <div className="space-y-4">
            <section className="rounded-[24px] bg-card p-5 text-center">
              <h2 className="text-[18px] font-bold">
                수정하거나 의견을 더하고 싶나요?
              </h2>
              <Button
                className="mt-4 h-13 w-full rounded-2xl text-[15px] font-bold"
                onClick={() => setStep("revise")}
                variant="secondary"
              >
                요구 수정하기
              </Button>
            </section>
            <Satisfaction
              accuracy={accuracy}
              ease={ease}
              onAccuracyChange={setAccuracy}
              onEaseChange={setEase}
            />
            <p className="text-center text-[13px] leading-5 text-muted-foreground">
              제출하면 이 보고서는 확정되고 더 이상 수정할 수 없어요.
            </p>
          </div>
        </div>
      </ResultStepLayout>
    );
  }

  return (
    <ResultStepLayout
      key={step}
      actions={
        <>
          <Button
            className="h-14 flex-1 rounded-2xl text-[15px] font-bold"
            disabled={revising}
            onClick={() => setStep("report")}
            variant="secondary"
          >
            이전
          </Button>
          <Button
            className="h-14 flex-[2] rounded-2xl text-[15px] font-bold"
            disabled={!reviseReady}
            form={REVISION_FORM_ID}
            type="submit"
          >
            {revising && (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin"
              />
            )}
            {revising ? "다시 정리하고 있어요" : "수정 반영하기"}
          </Button>
        </>
      }
    >
      <ResultHeader
        description="다르게 느껴지는 문장을 고르고 의견을 남겨 주세요."
        title="요구 수정"
      />
      <div className="px-5 pt-6 pb-8">
        <RevisionForm
          onReadyChange={setReviseReady}
          onRevise={revise}
          report={report}
          revising={revising}
        />
      </div>
    </ResultStepLayout>
  );
}
