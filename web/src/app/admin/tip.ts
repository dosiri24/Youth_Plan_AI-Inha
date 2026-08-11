"use client";

import { useCallback, useRef, type MouseEvent } from "react";

import styles from "./dashboard.module.css";

export type TipHandlers = {
  onMouseMove: (event: MouseEvent) => void;
  onMouseLeave: () => void;
};

/**
 * The hover label follows the pointer, so it is written straight to the node.
 * Routing every mouse move through state would re-render the whole stage.
 */
export function useTip() {
  const tipRef = useRef<HTMLDivElement>(null);

  const tip = useCallback(
    (text: string): TipHandlers => ({
      onMouseMove: (event: MouseEvent) => {
        const node = tipRef.current;
        if (!node) return;

        node.textContent = text;
        node.style.left = `${event.clientX + 14}px`;
        node.style.top = `${event.clientY - 32}px`;
        node.classList.add(styles.on);
      },
      onMouseLeave: () => tipRef.current?.classList.remove(styles.on),
    }),
    [],
  );

  return { tipRef, tip };
}
