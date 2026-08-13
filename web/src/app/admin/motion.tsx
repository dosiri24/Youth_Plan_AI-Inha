"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import styles from "./dashboard.module.css";

/* Two seconds: long enough to follow a bar with the eye, short enough that an
   officer opening the board to read a number is not kept waiting. */
const REVEAL_MS = 2000;
const COUNT_MS = 1800;

type Phase = "hidden" | "play" | "done";

export type Reveal = {
  /** False for the single frame the charts sit at zero. */
  grown: boolean;
  /** True while the intro runs; stagger delays apply only then. */
  playing: boolean;
  /** True on the zero frame, where transitions must be off. */
  hold: boolean;
  /** Per-element stagger and the intro's slower pace, read as `var(--d)` and `var(--dur)`. */
  lag: (ms: number) => CSSProperties | undefined;
};

/** True when the viewer asked for less motion, in which case the intro is skipped. */
function stillPreferred() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Drives the chart intro, replaying whenever the run changes: first load, a
 * data update, and coming back to the board from another page.
 */
export function useReveal(run: unknown): Reveal {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [shown, setShown] = useState(run);

  /* Resetting in an effect would let one frame of the finished charts reach the
     screen before they drop back to zero. */
  if (shown !== run) {
    setShown(run);
    setPhase(stillPreferred() ? "done" : "hidden");
  }

  useEffect(() => {
    if (run === null || stillPreferred()) return;

    /* The zero frame has to be painted before the grown values are set, and one
       frame is not enough: the callback still runs ahead of that paint. */
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("play"));
    });
    const timer = window.setTimeout(() => setPhase("done"), REVEAL_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [run]);

  return {
    grown: phase !== "hidden",
    playing: phase === "play",
    hold: phase === "hidden",
    lag: (ms) =>
      phase === "play"
        ? ({ "--d": `${ms}ms`, "--dur": "1s" } as CSSProperties)
        : undefined,
  };
}

/** Counts a summary figure up from zero, keeping the re-renders to itself. */
export function CountUp({ reveal, value }: { reveal: Reveal; value: number }) {
  const [shown, setShown] = useState(0);
  const { hold, playing } = reveal;

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [playing, value]);

  /* The figure the server returned is laid out unseen and the counting number is
     painted over it, so the box is exactly as wide as the final value from the
     first frame. Reserving by digit count instead would still leave the summary
     strip's dividers to the mercy of how wide each glyph happens to be. */
  return (
    <span className={styles.count}>
      <span aria-hidden>{value}</span>
      <b>{hold ? 0 : playing ? shown : value}</b>
    </span>
  );
}

/**
 * Slides re-sorted rows from their old places to their new ones, so a change of
 * ranking reads as movement instead of the list snapping to a new order.
 */
export function useSlide(order: unknown) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const last = useRef(order);

  /* Measured on every render, not just when the order changes: a row that moved
     for any other reason would otherwise leave a stale position behind and slide
     from the wrong place on the next sort. */
  useLayoutEffect(() => {
    const slide = last.current !== order;
    last.current = order;

    const moved: [HTMLElement, number][] = [];
    nodes.current.forEach((node, id) => {
      const top = node.offsetTop;
      const was = tops.current.get(id);
      tops.current.set(id, top);
      if (slide && was !== undefined && was !== top)
        moved.push([node, was - top]);
    });
    if (moved.length === 0) return;

    for (const [node, shift] of moved) {
      node.style.transition = "none";
      node.style.transform = `translateY(${shift}px)`;
    }
    const frame = requestAnimationFrame(() => {
      for (const [node] of moved) {
        node.style.transition = "";
        node.style.transform = "";
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  return (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}
