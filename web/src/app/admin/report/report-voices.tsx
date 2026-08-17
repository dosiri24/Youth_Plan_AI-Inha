"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";

import type { AxisName, BriefingQuote, DashboardPerson } from "@/lib/api";
import { getCityType } from "@/lib/city-types";

import { AXIS_ORDER } from "../dashboard-data";
import { ReportDotMap } from "./report-map";
import styles from "./report.module.css";

/* Typing pace follows the reference intro. Scrolling does the rest of the pacing
   now, so there is no scene timer and no carousel controls. */
const TYPE_DELAY_MS = 700;
const CHARS_PER_SEC = 65;

/** Steps in the sequence. Each one costs the reader most of a screen. */
const MAX_STEPS = 5;

/** Above this a quote reads as a paragraph rather than a line over the map. */
const COMFORTABLE = 110;

type Voice = { quote: BriefingQuote; person: DashboardPerson | null };

function subscribe(notify: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);

  return () => query.removeEventListener("change", notify);
}

/** Read as a store rather than in an effect, so no render is spent correcting it. */
export function useStill(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * One quote per district, with the axes rotated across the steps. The rotation is
 * the point: the map recolours by the axis of whatever is being said, so a
 * sequence that stayed on one axis would leave the map frozen.
 */
function buildVoices(
  quotes: BriefingQuote[],
  people: DashboardPerson[],
): Voice[] {
  const byId = new Map(people.map((person) => [person.submission_id, person]));
  const ordered = [...quotes].sort((left, right) =>
    left.quote_id.localeCompare(right.quote_id),
  );
  const districts = new Set<string>();
  const picked: Voice[] = [];

  const take = (want: AxisName | null, preferShort: boolean) =>
    ordered.find(
      (quote) =>
        quote.region !== "" &&
        !districts.has(quote.region) &&
        (want === null || quote.axis === want) &&
        (!preferShort || quote.text.length <= COMFORTABLE),
    ) ?? null;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const want = AXIS_ORDER[step % AXIS_ORDER.length];
    // Falls back through: this axis and short, this axis, any axis and short, any.
    const quote =
      take(want, true) ??
      take(want, false) ??
      take(null, true) ??
      take(null, false);
    if (quote === null) break;
    districts.add(quote.region);
    picked.push({ quote, person: byId.get(quote.submission_id) ?? null });
  }

  return picked;
}

/** The nearest ancestor that actually scrolls; on this screen the body does not. */
function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (
    let at = node?.parentElement ?? null;
    at !== null;
    at = at.parentElement
  ) {
    const flow = getComputedStyle(at).overflowY;
    if (flow === "auto" || flow === "scroll") return at;
  }

  return null;
}

/** Types the quote out after a beat, the way the reference intro did. */
function Typed({
  onDone,
  still,
  text,
}: {
  onDone: () => void;
  still: boolean;
  text: string;
}) {
  const [count, setCount] = useState(() => (still ? text.length : 0));

  useEffect(() => {
    if (still) return;

    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const typing = now - started - TYPE_DELAY_MS;
      const shown =
        typing <= 0
          ? 0
          : Math.min(text.length, Math.floor((typing / 1000) * CHARS_PER_SEC));
      setCount(shown);
      if (shown < text.length) frame = requestAnimationFrame(tick);
      else onDone();
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [onDone, still, text]);

  return (
    <>
      {text.slice(0, count)}
      {!still && count < text.length && <i className={styles.caret} />}
    </>
  );
}

/**
 * The cover sequence. The map is sticky and holds its place while the quotes
 * scroll through it, and each quote recolours the whole map by its own axis —
 * the reference globe stayed put the same way while its narrative moved past.
 */
export function VoiceScrolly({
  onSelect,
  people,
  picked,
  quotes,
  skipTo,
}: {
  onSelect: (submissionId: string | null) => void;
  people: DashboardPerson[];
  picked: string | null;
  quotes: BriefingQuote[];
  /** Where the skip control jumps to, so the sequence is never a toll gate. */
  skipTo: string;
}): ReactElement | null {
  const voices = useMemo(() => buildVoices(quotes, people), [quotes, people]);
  const [index, setIndex] = useState(0);
  const steps = useRef<(HTMLDivElement | null)[]>([]);
  const frame = useRef<HTMLDivElement>(null);
  /* Quotes that have already been typed out once. Scrolling back to one should
     find the sentence whole, not watch it get written again. Held as state, not
     a ref, because the render decides from it. */
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());
  const still = useStill();

  /* Whether the sequence is anywhere near the viewport. The scroll handlers cost
     a layout read on every wheel tick, and this document is twenty screens long;
     off-screen they come off entirely. */
  const [near, setNear] = useState(true);
  const current = voices[index] ?? null;
  /* One trackpad flick covers a whole step, so without this a quote is gone
     before it has been read. */
  const typing =
    !still && current !== null && !written.has(current.quote.quote_id);

  useEffect(() => {
    const box = frame.current;
    if (box === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "100% 0px" },
    );
    observer.observe(box);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nodes = steps.current.filter((node) => node !== null);
    if (nodes.length === 0) return;

    /* A zero-height band across the middle of the viewport: whichever step is
       crossing it is the one being read, so exactly one is ever active. */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const position = nodes.indexOf(entry.target as HTMLDivElement);
          if (position >= 0) setIndex(position);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [voices.length]);

  /* Two rules govern going forward while the sequence holds the screen. A
     sentence still arriving refuses the gesture outright, and any gesture is
     capped at one district — otherwise one flick of a trackpad carries the
     reader past four of them and out the bottom. Going back, the skip control,
     the keyboard and the scrollbar all stay free: this can hold a reader for a
     moment but must never trap one. */
  useEffect(() => {
    const scroller = scrollParent(frame.current);
    const box = frame.current;
    if (scroller === null || box === null || !near) return;

    /* The sequence holds the screen: the map is stuck and a quote is being read.
       Only then can a sentence refuse a gesture. */
    const engaged = () => {
      const rect = box.getBoundingClientRect();
      return rect.top <= 1 && rect.bottom >= window.innerHeight * 0.6;
    };

    /* The nearest step centre still ahead of us. Using the next one ahead rather
       than the next one after the active index also catches the flick that comes
       from above the sequence, which would otherwise clear the whole thing in a
       single gesture. Null once every step is behind, so the last quote never
       blocks the way out. */
    const stopAt = (): number | null => {
      const middle = window.innerHeight / 2;
      for (const step of steps.current) {
        if (step === null) continue;
        const rect = step.getBoundingClientRect();
        const centre = scroller.scrollTop + rect.top + rect.height / 2 - middle;
        if (centre > scroller.scrollTop + 2) return centre;
      }

      return null;
    };

    const forward = (event: Event, delta: number): boolean => {
      if (delta <= 0) return false;
      const rect = box.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
      if (typing && engaged()) {
        event.preventDefault();
        return true;
      }
      const limit = stopAt();
      if (limit === null || scroller.scrollTop + delta <= limit) return false;
      event.preventDefault();
      scroller.scrollTo({ top: limit, behavior: "smooth" });

      return true;
    };

    const onWheel = (event: WheelEvent) => forward(event, event.deltaY);
    let touch = 0;
    const onStart = (event: TouchEvent) => {
      touch = event.touches[0]?.clientY ?? 0;
    };
    const onMove = (event: TouchEvent) =>
      forward(event, touch - (event.touches[0]?.clientY ?? touch));

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });

    /* Whatever happens to the typing, the hold ends: a sentence that never
       reports itself finished must not leave the reader pushing at a dead
       wheel. The cap completes the text and releases at once. */
    const cap =
      current === null || !typing
        ? 0
        : window.setTimeout(
            () =>
              setWritten((done) => new Set(done).add(current.quote.quote_id)),
            TYPE_DELAY_MS +
              (current.quote.text.length / CHARS_PER_SEC) * 1000 +
              2500,
          );

    return () => {
      window.clearTimeout(cap);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
    };
  }, [current, index, near, typing]);

  if (current === null) return null;

  const person = people.find((item) => item.submission_id === picked) ?? null;

  return (
    <div className={styles.scrolly} ref={frame}>
      <div className={styles.stage}>
        {/* First in the DOM, though it is pinned to the foot of the stage. The
            map puts one tab stop on every participant, so the way out has to
            come before them or a keyboard reader meets three dozen dots with no
            means of skipping past. */}
        <a className={styles.skipseq} href={skipTo}>
          바로 요약 보기 ↓
        </a>

        {/* The typed copy is decorative; this is the sentence a screen reader is
            given. It sits outside the keyed layer below so the live region is
            one stable node and each change is announced once. */}
        <p aria-live="polite" className={styles.hidden}>
          {current.quote.region}
          {current.quote.age_band ? ` ${current.quote.age_band}세` : ""}{" "}
          참여자의 발언. {current.quote.text}
        </p>

        {/* The quote lives in the sticky stage, not in the scrolling steps. Tying
            its position to the scroll left it landing wherever the reader
            happened to stop; here the words hold the middle and scrolling only
            decides which words those are. */}
        <div className={styles.stageinner}>
          <ReportDotMap
            axis={current.quote.axis}
            onSelect={onSelect}
            people={people}
            quiet
            selected={picked}
            spotlight={current.quote.submission_id}
          />

          <div className={styles.voicelayer} key={current.quote.quote_id}>
            {/* Hidden one element at a time, not on the layer: the layer also
                holds the link out to the submission, and a focusable node inside
                an aria-hidden subtree is reachable by Tab but invisible to the
                reader who lands on it. */}
            <p aria-hidden className={styles.voicemeta}>
              {current.quote.region}
              {current.person
                ? ` · ${getCityType(current.person.code).nickname}`
                : ""}
              {current.quote.age_band ? ` · ${current.quote.age_band}세` : ""}
            </p>

            <blockquote aria-hidden className={styles.voicetext}>
              “
              {written.has(current.quote.quote_id) ? (
                current.quote.text
              ) : (
                <Typed
                  onDone={() =>
                    setWritten((done) =>
                      new Set(done).add(current.quote.quote_id),
                    )
                  }
                  still={still}
                  text={current.quote.text}
                />
              )}
              ”
            </blockquote>

            <p className={styles.voicefoot}>
              <span className={styles.qid}>{current.quote.quote_id}</span>
              <a
                aria-label={`인용 ${current.quote.quote_id}의 제출본 열기`}
                href={`/admin/submissions/${current.quote.submission_id}`}
                rel="noopener"
                target="_blank"
              >
                제출본 열기
              </a>
            </p>
          </div>
        </div>

        {person && (
          <div className={styles.pickstrip}>
            <b>{getCityType(person.code).nickname}</b>
            <span>
              {person.region} · {person.age}세 · 대화 {person.turns}턴
            </span>
            <button onClick={() => onSelect(null)} type="button">
              닫기
            </button>
          </div>
        )}
      </div>

      {/* Spacers only. They give the sequence its scroll length and tell the
          observer which quote is current; nothing is drawn in them. */}
      <div className={styles.steps}>
        {voices.map((voice, position) => (
          <div
            aria-hidden
            className={styles.step}
            key={voice.quote.quote_id}
            ref={(node) => {
              steps.current[position] = node;
            }}
          />
        ))}
      </div>
    </div>
  );
}
