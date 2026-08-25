"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import styles from "./dashboard.module.css";

type Props<T extends string | number> = {
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  value: T;
};

/** Segmented switch: one card, two ways to read the same shapes. */
export function Switch<T extends string | number>({
  onChange,
  options,
  value,
}: Props<T>) {
  const knobRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const placed = useRef(false);

  const at = options.findIndex(([key]) => key === value);

  /* The pill moves to the active option, and its width follows too because the
     labels differ in length. */
  useEffect(() => {
    const knob = knobRef.current;
    const target = itemRefs.current[at];
    if (!knob || !target) return;

    // Sliding on the very first placement would make loading look unsettled.
    const instant = !placed.current;
    placed.current = true;
    if (instant) knob.style.transition = "none";
    knob.style.width = `${target.offsetWidth}px`;
    knob.style.transform = `translateX(${target.offsetLeft}px)`;
    if (instant) {
      requestAnimationFrame(() => {
        knob.style.transition = "";
      });
    }
  }, [at]);

  return (
    <span className={styles.sortsw}>
      <i className={styles.knob} ref={knobRef} />
      {options.map(([key, label], index) => (
        <b
          className={key === value ? styles.on : ""}
          key={key}
          onClick={() => onChange(key)}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onChange(key);
          }}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          role="button"
          tabIndex={0}
        >
          {label}
        </b>
      ))}
    </span>
  );
}
