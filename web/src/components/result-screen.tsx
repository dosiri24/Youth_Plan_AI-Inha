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
import { AxisStrengths } from "@/components/axis-strengths";
import { CityTypeCard } from "@/components/city-type-card";
import { ReportOverview } from "@/components/report-overview";
import { ResultLoading } from "@/components/result-loading";
import { RevisionForm, REVISION_FORM_ID } from "@/components/revision-form";
import { ShareActions, type CardAction } from "@/components/share-actions";
import { TypeSummary } from "@/components/type-summary";
import { Button } from "@/components/ui/button";
import {
  enterPrize,
  generateResult,
  reportFailure,
  reviseResult,
  submitResult,
  type PersonalReport,
  type ResultResponse,
  type RevisionSelection,
  type TypeResult,
} from "@/lib/api";
import { getCityType, type CityType } from "@/lib/city-types";
import { PRIZE_DRAW_OPEN } from "@/lib/prize";
import {
  createTypeCard,
  downloadTypeCard,
  shareTypeCard,
} from "@/lib/share-card";
import { useBackGuard } from "@/lib/use-back-guard";

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
function ActionBar({
  children,
  notice,
}: {
  children: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <div className="shrink-0 bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(23,25,26,0.06)]">
      {/* The note rides above the row rather than inside it, so the buttons keep
          their full height whether or not one is shown. */}
      {notice && (
        <div className="mb-2.5 text-center text-[13px] leading-5 text-muted-foreground">
          {notice}
        </div>
      )}
      <div className="flex gap-2.5">{children}</div>
    </div>
  );
}

/** One scroll region above one action bar keeps the bar visible at any scroll offset. */
function ResultStepLayout({
  actions,
  children,
  notice,
}: {
  actions: ReactNode;
  children: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      <ActionBar notice={notice}>{actions}</ActionBar>
    </div>
  );
}

type ResultFailedProps = {
  onRetry: () => void;
  onReturn: () => void;
  sessionId: string;
};

type FailureReportState = "idle" | "sending" | "sent" | "failed";

/** A failed generation leaves the session intact, so asking again is the way out, and
    the transcript that would explain the failure goes only if the participant sends it. */
function ResultFailed({ onRetry, onReturn, sessionId }: ResultFailedProps) {
  const [reportState, setReportState] = useState<FailureReportState>("idle");

  const report = async () => {
    setReportState("sending");
    try {
      await reportFailure(sessionId);
      setReportState("sent");
    } catch {
      setReportState("failed");
    }
  };

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
      {/* Once the log is sent the screen would otherwise be a dead end, so the way
          out takes the same slot rather than adding a third button. */}
      {reportState === "sent" ? (
        <Button
          className="mt-2.5 h-14 w-full rounded-2xl text-[15px] font-bold"
          onClick={onReturn}
          variant="secondary"
        >
          처음 화면으로
        </Button>
      ) : (
        <Button
          className="mt-2.5 h-14 w-full rounded-2xl text-[15px] font-bold"
          disabled={reportState === "sending"}
          onClick={() => void report()}
          variant="secondary"
        >
          {reportState === "sending" ? "보내는 중…" : "오류 기록 보내기"}
        </Button>
      )}
      <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
        {reportState === "sent"
          ? "기록을 보냈어요. 고맙습니다."
          : "무엇이 잘못됐는지 찾을 수 있게 나눈 대화가 함께 전송돼요."}
      </p>
      {reportState === "failed" && (
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          보내지 못했어요. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}
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
        새로고침하거나 화면을 벗어나면 이 화면을 다시 볼 수 없어요.
      </p>
    </div>
  );
}

const SCALE_SCORES = [1, 2, 3, 4, 5];

const SATISFACTION_ID = "satisfaction";
const PRIZE_ENTRY_ID = "prize-entry";

function formatPrizePhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function prizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidPrizePhone(value: string): boolean {
  return /^010\d{8}$/.test(prizePhoneDigits(value));
}

function scrollToPrizeEntry() {
  const field = document.getElementById(PRIZE_ENTRY_ID);
  field?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "center",
  });
  window.setTimeout(() => field?.focus(), 350);
}

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
    <section
      className="space-y-7 rounded-[24px] bg-card p-5"
      id={SATISFACTION_ID}
    >
      <ScaleQuestion
        highLabel="AI가 더 편해요"
        lowLabel="직접이 더 편해요"
        name="satisfaction-ease"
        onChange={onEaseChange}
        question="AI를 통해 인터뷰하는 것이 직접 의견을 제시하는 것보다 편한가요?"
        value={ease}
      />
      <ScaleQuestion
        highLabel="만족해요"
        lowLabel="불만족해요"
        name="satisfaction-accuracy"
        onChange={onAccuracyChange}
        question="AI가 정리한 나의 요구와 유형 테스트에 만족하나요?"
        value={accuracy}
      />
    </section>
  );
}

type PrizeEntryProps = {
  invalid: boolean;
  onChange: (value: string) => void;
  pending: boolean;
  value: string;
};

/** The field shares the review screen, while its value takes a separate storage path. */
function PrizeEntry({ invalid, onChange, pending, value }: PrizeEntryProps) {
  return (
    <section className="rounded-[24px] bg-card p-5">
      <h2 className="text-[15px] font-bold">기프티콘 추첨 응모 (선택)</h2>
      <input
        aria-invalid={invalid}
        aria-label="경품 응모용 휴대전화 번호"
        autoComplete="tel"
        className="mt-4 h-14 w-full rounded-2xl bg-muted px-4 text-base font-semibold outline-none transition placeholder:font-normal focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/50 disabled:cursor-not-allowed"
        disabled={pending}
        id={PRIZE_ENTRY_ID}
        inputMode="tel"
        onChange={(event) => onChange(formatPrizePhone(event.target.value))}
        placeholder="예: 010-1234-5678"
        type="tel"
        value={value}
      />
      <p className="mt-2.5 text-[11px] leading-[1.65] text-muted-foreground">
        *전화번호는 경품 추첨, 안내, 발송을 위해서만 사용 후 폐기하며, 입력하면
        이에 동의하는 것으로 간주됩니다. 또한 인천시에 전달되는 요구와는 별도로
        보관됩니다.
      </p>
    </section>
  );
}

type SubmittedProps = {
  action: CardAction;
  card: File | null;
  onDownload: () => void;
  onPrizeRetry: () => void;
  onShare: () => void;
  prizeRetrying: boolean;
  prizeSaveFailed: boolean;
  type: CityType;
};

/** Submitted results stay entirely in volatile client state for sharing. */
function Submitted({
  action,
  card,
  onDownload,
  onPrizeRetry,
  onShare,
  prizeRetrying,
  prizeSaveFailed,
  type,
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
          도시유형테스트를 친구들과 공유해 보세요.
        </p>
      </header>

      <div className="space-y-5 px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <CityTypeCard card={card} type={type} />
        <ShareActions
          action={action}
          onDownload={onDownload}
          onShare={onShare}
        />
        <TypeSummary type={type} />
        {prizeSaveFailed && (
          <section className="rounded-[20px] bg-card px-4 py-4">
            <p className="text-[13px] leading-5 text-muted-foreground">
              의견은 제출됐지만 기프티콘 응모를 완료하지 못했어요.
            </p>
            <Button
              className="mt-3 h-12 w-full rounded-2xl text-[15px] font-bold"
              disabled={prizeRetrying}
              onClick={onPrizeRetry}
              variant="secondary"
            >
              {prizeRetrying ? "응모하는 중…" : "기프티콘 응모 다시 시도"}
            </Button>
          </section>
        )}
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
  const [prizePhone, setPrizePhone] = useState("");
  const [prizePhoneInvalid, setPrizePhoneInvalid] = useState(false);
  const [prizeSaveFailed, setPrizeSaveFailed] = useState(false);
  const [prizeRetrying, setPrizeRetrying] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [cardAction, setCardAction] = useState<CardAction>(null);
  const [card, setCard] = useState<File | null>(null);
  const [cardSettled, setCardSettled] = useState(false);
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
        // Building here rather than on the reveal keeps the picture ready when the
        // screen appears, so the card slot never opens empty.
        void createTypeCard(
          getCityType(fetched.type_result.code),
          fetched.type_result,
        )
          .then(setCard)
          .catch(() => {
            // A card the browser could not draw leaves the fallback panel; it must not
            // hold the reveal or discard the result (PLAN 9.3, D1).
          })
          .finally(() => setCardSettled(true));
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

    if (
      PRIZE_DRAW_OPEN &&
      prizePhone.length > 0 &&
      !isValidPrizePhone(prizePhone)
    ) {
      setPrizePhoneInvalid(true);
      scrollToPrizeEntry();
      return;
    }

    setSubmitting(true);
    try {
      const submittedId = await submitResult(sessionId, ease, accuracy);
      if (PRIZE_DRAW_OPEN && prizePhone.length > 0) {
        try {
          await enterPrize(submittedId, prizePhoneDigits(prizePhone));
        } catch {
          setPrizeSaveFailed(true);
        }
      }
      setSubmissionId(submittedId);
    } catch {
      onError();
    } finally {
      setSubmitting(false);
    }
  };

  const retryPrizeEntry = async () => {
    if (!submissionId || prizeRetrying || !isValidPrizePhone(prizePhone))
      return;

    setPrizeRetrying(true);
    try {
      await enterPrize(submissionId, prizePhoneDigits(prizePhone));
      setPrizeSaveFailed(false);
    } catch {
      setPrizeSaveFailed(true);
    } finally {
      setPrizeRetrying(false);
    }
  };

  // A build that failed on arrival must still leave the buttons usable, so they draw
  // the card themselves rather than staying disabled for the rest of the session.
  const takeCard = async (typeResult: TypeResult): Promise<File> =>
    card ?? (await createTypeCard(getCityType(typeResult.code), typeResult));

  const share = async () => {
    if (!result || cardAction !== null) return;

    setCardAction("share");
    try {
      await shareTypeCard(
        await takeCard(result.type_result),
        getCityType(result.type_result.code).nickname,
      );
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
      downloadTypeCard(await takeCard(result.type_result));
    } catch {
      // Share/save failure must not discard the result; only this attempt ends (PLAN 9.3, D1).
    } finally {
      setCardAction(null);
    }
  };

  if (generationFailed)
    return (
      <ResultFailed
        onRetry={generate}
        onReturn={onReturn}
        sessionId={sessionId}
      />
    );

  if (!result || !report || !revealed)
    return (
      <ResultLoading
        done={result !== null && cardSettled}
        onDone={() => setRevealed(true)}
      />
    );

  const typeResult = result.type_result;
  const type = getCityType(typeResult.code);

  if (submissionId) {
    return (
      <Submitted
        action={cardAction}
        card={card}
        onDownload={() => void download()}
        onPrizeRetry={() => void retryPrizeEntry()}
        onShare={() => void share()}
        prizeRetrying={prizeRetrying}
        prizeSaveFailed={prizeSaveFailed}
        type={type}
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
            제출 전 요구 검토하기
          </Button>
        }
        notice="다음 화면까지 확인해야 제출돼요"
      >
        <ResultHeader
          title={
            report.self_info.nickname
              ? `${report.self_info.nickname}님의 도시유형`
              : "내 도시유형"
          }
        />
        <div className="space-y-10 px-5 pt-6 pb-8">
          <div className="space-y-4">
            <CityTypeCard card={card} type={type} />
            <ShareActions
              action={cardAction}
              onDownload={() => void download()}
              onShare={() => void share()}
            />
          </div>
          <div className="space-y-4">
            <TypeSummary type={type} />
            <AxisStrengths axes={typeResult.axes} />
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
        notice={
          PRIZE_DRAW_OPEN &&
          !isValidPrizePhone(prizePhone) && (
            <button
              className="rounded-md underline underline-offset-[3px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              onClick={scrollToPrizeEntry}
              type="button"
            >
              전화번호 입력하고 기프티콘 응모하기
            </button>
          )
        }
      >
        <ResultHeader title="제출 전 요구 검토" />
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
            {PRIZE_DRAW_OPEN && (
              <PrizeEntry
                invalid={prizePhoneInvalid}
                onChange={(value) => {
                  setPrizePhone(value);
                  setPrizePhoneInvalid(false);
                }}
                pending={submitting}
                value={prizePhone}
              />
            )}
            <p className="text-center text-[13px] leading-5 text-muted-foreground">
              제출 이후에는 수정할 수 없어요.
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
