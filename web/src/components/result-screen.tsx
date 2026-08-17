"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, LoaderCircle, LockKeyhole } from "lucide-react";

import { AxisReasons } from "@/components/axis-reasons";
import { CityTypeCard } from "@/components/city-type-card";
import { ReportOverview } from "@/components/report-overview";
import { ResultLoading } from "@/components/result-loading";
import { RevisionForm, REVISION_FORM_ID } from "@/components/revision-form";
import { ShareActions, type CardAction } from "@/components/share-actions";
import { Button } from "@/components/ui/button";
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
import { downloadTypeCard, shareTypeCard } from "@/lib/share-card";
import { useBackGuard } from "@/lib/use-back-guard";

type ResultScreenProps = {
  sessionId: string;
  onError: () => void;
  onReturn: () => void;
};

type ResultStep = "type" | "report" | "revise";

type ResultHeaderProps = {
  description: string;
  title: string;
};

/** A consistent header makes each result step feel like one focused screen. */
function ResultHeader({ description, title }: ResultHeaderProps) {
  return (
    <header className="bg-card px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5">
      <h1 className="text-[27px] font-bold tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
        {description}
      </p>
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

/** Volatile results need one concise warning after the participant submits. */
function ResultNotice() {
  return (
    <div className="flex gap-3 rounded-[20px] bg-card px-4 py-4">
      <LockKeyhole
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-incheon-gray"
      />
      <p className="text-[13px] leading-5 text-muted-foreground">
        이 결과는 지금 화면에만 남아 있어요. 새로고침하거나 다시 접속하면 결과를
        다시 볼 수 없어요.
      </p>
    </div>
  );
}

type SubmittedProps = {
  action: CardAction;
  cardRef: RefObject<HTMLDivElement | null>;
  nickname: string;
  typeResult: TypeResult;
  onDownload: () => void;
  onShare: () => void;
};

/** Submitted results stay entirely in volatile client state for sharing. */
function Submitted({
  action,
  cardRef,
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
        <CityTypeCard
          ref={cardRef}
          nickname={nickname}
          typeResult={typeResult}
        />
        <ShareActions
          action={action}
          onDownload={onDownload}
          onShare={onShare}
        />
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
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [cardAction, setCardAction] = useState<CardAction>(null);
  const startedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void generateResult(sessionId)
      .then((fetched) => {
        setResult(fetched);
        setReport(fetched.report);
      })
      .catch(() => onError());
  }, [onError, sessionId]);

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
      setSubmissionId(await submitResult(sessionId));
    } catch {
      onError();
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    const card = cardRef.current;
    if (!card || !result || cardAction !== null) return;

    setCardAction("share");
    try {
      await shareTypeCard(card, getCityType(result.type_result.code).nickname);
    } catch {
      // Share/save failure must not discard the result; only this attempt ends (PLAN 9.3, D1).
    } finally {
      setCardAction(null);
    }
  };

  const download = async () => {
    const card = cardRef.current;
    if (!card || !result || cardAction !== null) return;

    setCardAction("download");
    try {
      await downloadTypeCard(
        card,
        getCityType(result.type_result.code).nickname,
      );
    } catch {
      // Share/save failure must not discard the result; only this attempt ends (PLAN 9.3, D1).
    } finally {
      setCardAction(null);
    }
  };

  if (!result || !report || !revealed)
    return (
      <ResultLoading done={result !== null} onDone={() => setRevealed(true)} />
    );

  const typeResult = result.type_result;

  if (submissionId) {
    return (
      <Submitted
        action={cardAction}
        cardRef={cardRef}
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
          description="대화를 바탕으로 판정한 결과예요."
          title="내 유형 확인"
        />
        <div className="space-y-10 px-5 pt-6 pb-8">
          <div className="space-y-4">
            <CityTypeCard
              ref={cardRef}
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
        <ResultHeader
          description="내 이야기가 잘 정리됐는지 확인해 주세요."
          title="내 이야기와 요구 확인"
        />
        <div className="space-y-12 px-5 pt-6 pb-8">
          <ReportOverview report={report} />

          <div className="space-y-4">
            <section className="rounded-[24px] bg-card p-5 text-center">
              <h2 className="text-[18px] font-bold">
                수정하거나 의견을 더하고 싶나요?
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
                다르게 느껴지는 요구 문장을 골라 생각을 덧붙일 수 있어요.
              </p>
              <Button
                className="mt-4 h-13 w-full rounded-2xl text-[15px] font-bold"
                onClick={() => setStep("revise")}
                variant="secondary"
              >
                요구 수정하기
              </Button>
            </section>
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
            {revising ? "다시 정리하고 있어요" : "의견 반영하고 돌아가기"}
          </Button>
        </>
      }
    >
      <ResultHeader
        description="고른 문장과 의견으로 네 축의 요구를 다시 정리해요."
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
