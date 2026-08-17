"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import styles from "./report.module.css";

/**
 * Whether the band this node sits in has been scrolled to. Charts read it to
 * decide whether their bars are still at zero, so one observer per section
 * drives every number and bar inside it.
 */
const Revealed = createContext(false);

export function useRevealed(): boolean {
  return useContext(Revealed);
}

/** Nth item in a staggered group; the CSS turns it into a delay. */
export function step(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

/**
 * One section of the document. It fades up the first time it is reached and then
 * stays put: replaying on every scroll-back turns a report into a slideshow.
 * Reduced motion is handled in the stylesheet, which shows every block outright
 * rather than leaving the reveal to depend on an observer firing.
 */
export function Band({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      // Firing a little before the section is centred lets the growth read as
      // the reason the section arrived, rather than as a late correction.
      { rootMargin: "-4% 0px -14% 0px", threshold: 0.01 },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [seen]);

  return (
    <Revealed.Provider value={seen}>
      <section
        className={`${styles.section} ${seen ? styles.seen : ""} ${className ?? ""}`}
        id={id}
        ref={ref}
      >
        {children}
      </section>
    </Revealed.Provider>
  );
}

/** A bar's width, held at zero until its band is reached so the growth is visible. */
export function grown(value: number, max: number, revealed: boolean): string {
  return revealed ? `${(value / Math.max(1, max)) * 100}%` : "0%";
}

const COUNT_MS = 900;

/**
 * Counts to a figure once its band is reached. A summary number that is simply
 * printed reads as decoration; one that lands tells the reader it was measured.
 */
export function CountUp({ value }: { value: number }) {
  const revealed = useRevealed();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!revealed) return;

    // Zero duration settles on the first frame, which is what reduced motion asks
    // for without branching the render.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : COUNT_MS;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress =
        duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      // Ease out so the last digits settle instead of snapping.
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [revealed, value]);

  return <>{shown}</>;
}
