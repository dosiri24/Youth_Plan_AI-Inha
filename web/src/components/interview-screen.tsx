"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from "react";
import { ArrowUp, ChevronDown, Code2, Pencil, Square } from "lucide-react";

import {
  DevFixtureDialog,
  type DevStage,
} from "@/components/dev-fixture-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AccessDenied,
  readAccessCode,
  saveAccessCode,
} from "@/lib/access-code";
import {
  deleteSession,
  listDevFixtures,
  loadDevFixture,
  sendMessage,
  startInterview,
  undoTurn,
  type DevFixture,
} from "@/lib/api";
import { revealStream } from "@/lib/typewriter";
import { useBackGuard } from "@/lib/use-back-guard";

/** Momentum scrolling rarely lands on an exact bottom, so "at the bottom" needs slack. */
const BOTTOM_SLACK = 48;

type BaseProps = {
  sessionId: string;
  onComplete: () => void;
  onError: () => void;
  onReturn: () => void;
};

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

type StreamRequest =
  { type: "start" } | { type: "message"; text: string; userId: number };
type InterviewStatus = "active" | "ended" | "aborted";

/** The one turn a participant may take back, held so both bubbles can disappear together. */
type Turn = {
  userId: number;
  assistantId: number;
  text: string;
};

/** Memoized so a typewriter update only re-renders the bubble whose text changes. */
const MessageRow = memo(function MessageRow({
  role,
  text,
  showThinking,
  onEdit,
}: {
  role: Message["role"];
  text: string;
  showThinking: boolean;
  onEdit?: () => void;
}) {
  return (
    <article
      className={
        role === "user"
          ? "flex flex-col items-end"
          : "flex flex-col items-start"
      }
    >
      <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted-foreground">
        {role === "user" ? "나" : "바다"}
      </p>
      <div
        className={
          role === "user"
            ? "max-w-[84%] rounded-[20px] rounded-tr-md bg-primary px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap text-primary-foreground"
            : "max-w-[88%] rounded-[20px] rounded-tl-md bg-card px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap text-foreground"
        }
      >
        {text}
        {showThinking && (
          <span
            aria-label="바다가 답변을 생각하고 있어요"
            className="flex h-6 items-center gap-1.5 px-0.5"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-incheon-gray/45" />
            <span className="size-1.5 animate-pulse rounded-full bg-incheon-gray/45 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-incheon-gray/45 [animation-delay:300ms]" />
          </span>
        )}
      </div>
      {onEdit && (
        <Button
          className="mt-2 h-8 rounded-xl bg-secondary px-3 text-[12px] font-bold text-primary hover:bg-secondary/70 hover:text-primary"
          onClick={onEdit}
          variant="ghost"
        >
          <Pencil aria-hidden="true" className="size-3.5" />이 답변 고치기
        </Button>
      )}
    </article>
  );
});

/** Client state must disappear when the participant leaves this screen. */
export function InterviewScreen({
  sessionId,
  onComplete,
  onError,
  onReturn,
}: BaseProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [thinking, setThinking] = useState(true);
  const [status, setStatus] = useState<InterviewStatus>("active");
  const [progress, setProgress] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [devStage, setDevStage] = useState<DevStage>("closed");
  const [devFixtures, setDevFixtures] = useState<DevFixture[] | null>(null);
  const [loadingFixture, setLoadingFixture] = useState<string | null>(null);
  const [codePending, setCodePending] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sequenceRef = useRef(0);
  const startedRef = useRef(false);
  const streamRef = useRef<AbortController | null>(null);
  const quittingRef = useRef(false);
  const revertingRef = useRef(false);

  const play = useCallback(
    async (request: StreamRequest) => {
      const assistantId = ++sequenceRef.current;
      const controller = new AbortController();
      streamRef.current = controller;
      revertingRef.current = false;
      if (request.type === "message") {
        setTurn({ assistantId, text: request.text, userId: request.userId });
      }
      setMessages((current) => [
        ...current,
        { id: assistantId, role: "assistant", text: "" },
      ]);
      setStreaming(true);
      setThinking(true);

      const events =
        request.type === "start"
          ? startInterview(sessionId, controller.signal)
          : sendMessage(sessionId, request.text, controller.signal);

      try {
        const end = await revealStream(events, {
          signal: controller.signal,
          onFirstDelta: () => setThinking(false),
          onText: (text) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, text } : message,
              ),
            );
          },
        });

        setThinking(false);
        if (quittingRef.current) return;

        setStreaming(false);
        setProgress(end.progress);
        if (end.state !== "continue") setStatus(end.state);
      } catch {
        // Quitting and reverting both abort on purpose, so neither is a failure.
        if (revertingRef.current) revertingRef.current = false;
        else if (!quittingRef.current) onError();
      } finally {
        if (streamRef.current === controller) streamRef.current = null;
      }
    },
    [onError, sessionId],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void play({ type: "start" });
  }, [play]);

  // Every typewriter character re-renders, so following the bottom must be the
  // participant's choice rather than something the transcript takes from them.
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !following) return;

    transcript.scrollTop = transcript.scrollHeight;
  }, [following, messages, status, thinking]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    setFollowing(scrollHeight - scrollTop - clientHeight <= BOTTOM_SLACK);
  };

  // Focus can only land once the revert re-enables the composer in the same commit.
  useEffect(() => {
    if (focusTick === 0) return;

    inputRef.current?.focus();
  }, [focusTick]);

  // Safari ignores field-sizing, so the box is measured here instead of by the browser.
  useEffect(() => {
    const box = inputRef.current;
    if (box === null) return;

    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [input]);

  /** Taking a turn back means the participant gets their own words back, ready to edit. */
  const revert = useCallback((reverted: Turn) => {
    setMessages((current) =>
      current.filter(
        (message) =>
          message.id !== reverted.userId && message.id !== reverted.assistantId,
      ),
    );
    setInput(reverted.text);
    setTurn(null);
    setStreaming(false);
    setThinking(false);
    setFollowing(true);
    setFocusTick((tick) => tick + 1);
  }, []);

  // React reuses this node for the send button, so the click would land on a
  // submit type by the time the browser runs its default action and resend the turn.
  const stopStream = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!turn || !streaming) return;

      // The backend stores a turn only after its stream closes, so a cut turn never existed.
      revertingRef.current = true;
      streamRef.current?.abort();
      revert(turn);
    },
    [revert, streaming, turn],
  );

  const editLastTurn = useCallback(async () => {
    if (!turn || streaming || undoing) return;

    setUndoing(true);
    try {
      await undoTurn(sessionId);
      revert(turn);
    } catch {
      onError();
    } finally {
      setUndoing(false);
    }
  }, [onError, revert, sessionId, streaming, turn, undoing]);

  const closeQuit = useCallback(() => {
    if (!quittingRef.current) setQuitOpen(false);
  }, []);

  // A finished interview has nowhere to go back to, so leaving is the only exit left.
  useBackGuard(() => {
    if (quitOpen) closeQuit();
    else if (status === "active") setQuitOpen(true);
  });

  const confirmQuit = useCallback(async () => {
    if (quittingRef.current) return;

    quittingRef.current = true;
    setQuitting(true);
    streamRef.current?.abort();

    try {
      await deleteSession(sessionId);
      onReturn();
    } catch {
      onError();
    }
  }, [onError, onReturn, sessionId]);

  // The fixture list is the code check: a 403 here means the code was wrong.
  const requestFixtures = useCallback(async () => {
    setCodePending(true);
    try {
      setDevFixtures(await listDevFixtures());
      setCodeMessage(null);
      setDevStage("fixtures");
    } catch (error) {
      if (!(error instanceof AccessDenied)) {
        onError();
        return;
      }
      setCodeMessage("코드가 맞지 않아요. 다시 입력해 주세요.");
      setDevStage("code");
    } finally {
      setCodePending(false);
    }
  }, [onError]);

  const openDevMode = useCallback(() => {
    if (streaming || quitting) return;

    if (devFixtures !== null) {
      setDevStage("fixtures");
      return;
    }

    if (readAccessCode() === null) {
      setDevStage("code");
      return;
    }

    setDevStage("fixtures");
    void requestFixtures();
  }, [devFixtures, quitting, requestFixtures, streaming]);

  const submitCode = useCallback(
    (code: string) => {
      saveAccessCode(code);
      setCodeMessage(null);
      void requestFixtures();
    },
    [requestFixtures],
  );

  const loadFixture = useCallback(
    async (name: string) => {
      if (loadingFixture !== null || streaming || quitting) return;

      setLoadingFixture(name);
      try {
        const transcript = await loadDevFixture(sessionId, name);
        setMessages(
          transcript.map((message, index) => ({
            id: index + 1,
            role: message.role,
            text: message.text,
          })),
        );
        sequenceRef.current = transcript.length;
        // The backend ends the session on load, and these messages were never streamed.
        setStatus("ended");
        setTurn(null);
        setFollowing(true);
        setDevStage("closed");
      } catch {
        onError();
      } finally {
        setLoadingFixture(null);
      }
    },
    [loadingFixture, onError, quitting, sessionId, streaming],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (
      !text ||
      streaming ||
      status !== "active" ||
      quitting ||
      undoing ||
      loadingFixture !== null
    )
      return;

    const userId = ++sequenceRef.current;
    setMessages((current) => [...current, { id: userId, role: "user", text }]);
    setInput("");
    setFollowing(true);
    void play({ type: "message", text, userId });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  // A finished interview is fully explored, so its bar must not stop short of the end.
  const shownProgress = status === "ended" ? 100 : progress;
  const editable =
    status === "active" && !streaming && !quitting && loadingFixture === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 bg-card px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-primary">유스플랜AI</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${status === "aborted" ? "bg-incheon-gray" : "bg-incheon-green"}`}
              />
              <p className="text-[15px] font-bold">
                {status === "active" ? "바다와 인터뷰 중" : "인터뷰 종료"}
              </p>
            </div>
          </div>
          {status === "active" && (
            <div className="flex items-center gap-1">
              <Button
                aria-label="개발자 모드 열기"
                className="size-8 rounded-xl text-muted-foreground/70"
                disabled={streaming || quitting}
                onClick={openDevMode}
                size="icon"
                variant="ghost"
              >
                <Code2 aria-hidden="true" className="size-4" />
              </Button>
              <Button
                className="h-9 rounded-xl px-3 text-[13px] font-semibold text-muted-foreground"
                disabled={quitting}
                onClick={() => setQuitOpen(true)}
                variant="ghost"
              >
                인터뷰 그만두기
              </Button>
            </div>
          )}
        </div>

        {status !== "aborted" && (
          <div className="mt-3.5 flex items-center gap-3">
            <div
              aria-label="인터뷰 진행률"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={shownProgress}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${shownProgress}%` }}
              />
            </div>
            <span className="text-[12px] font-bold text-primary tabular-nums">
              {shownProgress}%
            </span>
          </div>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={transcriptRef}
          // Live announcements wait because typewriter updates restart screen-reader speech.
          aria-live={streaming ? "off" : "polite"}
          aria-busy={streaming}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
          onScroll={handleScroll}
          role="log"
        >
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                onEdit={
                  editable && message.id === turn?.userId
                    ? () => void editLastTurn()
                    : undefined
                }
                role={message.role}
                text={message.text}
                showThinking={
                  message.role === "assistant" && !message.text && thinking
                }
              />
            ))}

            {status === "aborted" && (
              <section className="rounded-[24px] bg-card p-5">
                <h2 className="text-[21px] font-bold tracking-[-0.02em]">
                  인터뷰가 종료됐어요
                </h2>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                  이번 대화는 저장되지 않았어요.
                </p>
                <Button
                  className="mt-5 h-13 w-full rounded-2xl text-[15px] font-bold"
                  onClick={onReturn}
                >
                  처음 화면으로 돌아가기
                </Button>
              </section>
            )}

            {status === "ended" && (
              <section className="rounded-[24px] bg-card p-5">
                <p className="text-[13px] font-bold text-incheon-green">
                  인터뷰 완료
                </p>
                <h2 className="mt-2 text-[21px] font-bold tracking-[-0.02em]">
                  이야기를 모두 나눴어요
                </h2>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                  바다의 마지막 인사를 읽었다면 결과를 확인하러 가세요.
                </p>
                <Button
                  className="mt-5 h-14 w-full rounded-2xl text-[16px] font-bold"
                  onClick={onComplete}
                >
                  대화 종료하기
                </Button>
              </section>
            )}
          </div>
        </div>

        {!following && (
          <Button
            className="absolute bottom-4 left-1/2 h-9 -translate-x-1/2 rounded-full bg-card px-3.5 text-[13px] font-semibold text-foreground shadow-[0_6px_20px_rgba(23,25,26,0.16)] hover:bg-card"
            onClick={() => setFollowing(true)}
            variant="ghost"
          >
            <ChevronDown aria-hidden="true" className="size-4" />맨 아래로
          </Button>
        )}
      </div>

      {status !== "aborted" && (
        <form
          className="shrink-0 bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={submit}
        >
          <div className="flex items-end gap-2 rounded-[20px] bg-muted p-2 pl-4 focus-within:ring-2 focus-within:ring-primary/20">
            <label className="sr-only" htmlFor="interview-message">
              답변 입력
            </label>
            <textarea
              id="interview-message"
              ref={inputRef}
              className="max-h-56 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
              disabled={
                status !== "active" ||
                streaming ||
                quitting ||
                undoing ||
                loadingFixture !== null
              }
              enterKeyHint="send"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                status === "ended"
                  ? "인터뷰가 종료됐어요"
                  : streaming
                    ? "바다의 답변을 기다리고 있어요"
                    : "답변을 입력해 주세요"
              }
              rows={1}
              value={input}
            />
            {streaming && turn ? (
              <Button
                aria-label="답변 생성 중단하기"
                className="size-11 rounded-2xl bg-incheon-gray text-white hover:bg-incheon-gray/90"
                onClick={stopStream}
                size="icon"
                type="button"
              >
                <Square
                  aria-hidden="true"
                  className="size-4 fill-current"
                  strokeWidth={2.5}
                />
              </Button>
            ) : (
              <Button
                aria-label="답변 보내기"
                className="size-11 rounded-2xl"
                disabled={
                  !input.trim() ||
                  status !== "active" ||
                  streaming ||
                  quitting ||
                  undoing ||
                  loadingFixture !== null
                }
                size="icon"
                type="submit"
              >
                <ArrowUp
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={2.5}
                />
              </Button>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        onClose={closeQuit}
        onConfirm={() => void confirmQuit()}
        open={quitOpen}
        pending={quitting}
      />
      <DevFixtureDialog
        codeMessage={codeMessage}
        codePending={codePending}
        fixtures={devFixtures ?? []}
        listing={devFixtures === null}
        loadingName={loadingFixture}
        onClose={() => {
          setDevStage("closed");
          setCodeMessage(null);
        }}
        onSelect={(name) => void loadFixture(name)}
        onSubmitCode={submitCode}
        stage={devStage}
      />
    </div>
  );
}
