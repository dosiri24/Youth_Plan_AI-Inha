import type { InterviewEvent, SessionState } from "@/lib/api";

type RevealOptions = {
  onFirstDelta: () => void;
  onText: (text: string) => void;
  signal: AbortSignal;
};

/** Shortens only the pause so every displayed character still came from the stream. */
function cadence(backlog: number): number {
  if (backlog > 100) return 12;
  if (backlog > 40) return 18;
  return 26;
}

/** Makes cancellation immediate while a character is waiting to appear. */
function pause(duration: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, duration);

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

/** Separate consumption prevents bursty transport timing from becoming visible. */
export async function revealStream(
  events: AsyncIterable<InterviewEvent>,
  { onFirstDelta, onText, signal }: RevealOptions,
): Promise<SessionState> {
  const queue: string[] = [];
  let visible = "";
  let state: SessionState | null = null;
  let finished = false;
  let failed: unknown;
  let firstDelta = true;
  let wake: (() => void) | null = null;

  const notify = () => {
    wake?.();
    wake = null;
  };

  const consume = (async () => {
    try {
      for await (const event of events) {
        if (event.type === "delta") {
          if (firstDelta) {
            firstDelta = false;
            onFirstDelta();
          }
          queue.push(...Array.from(event.text));
          notify();
        } else {
          state = event.state;
        }
      }
    } catch (error) {
      failed = error;
    } finally {
      finished = true;
      notify();
    }
  })();

  let revealFailure: unknown;

  try {
    while (!finished || queue.length > 0) {
      if (failed) break;

      const next = queue.shift();
      if (next === undefined) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }

      visible += next;
      onText(visible);
      await pause(cadence(queue.length), signal);
    }
  } catch (error) {
    revealFailure = error;
  }

  await consume;

  if (revealFailure) throw revealFailure;
  if (failed) throw failed;
  if (!state) throw new Error("SSE stream has no terminal state");

  return state;
}
