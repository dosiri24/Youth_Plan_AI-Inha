import type { AxisLetter, AxisName } from "@/lib/api";

/** Display ceiling for axes whose opposite pole was never observed (RETYPE 5). */
const SINGLE_POLE_DISPLAY_MAX = 95;

type Pole = {
  letter: AxisLetter;
  label: string;
  badge: string;
};

type AxisInfo = {
  title: string;
  left: Pole;
  right: Pole;
};

export const AXIS_INFO: Record<AxisName, AxisInfo> = {
  AC: {
    title: "생활 리듬",
    left: { letter: "A", label: "활기찬 도시", badge: "활기" },
    right: { letter: "C", label: "여유로운 도시", badge: "여유" },
  },
  UN: {
    title: "선호 공간",
    left: { letter: "U", label: "도시적인 공간", badge: "도시" },
    right: { letter: "N", label: "자연과 가까운 공간", badge: "자연" },
  },
  OW: {
    title: "우선 가치",
    left: { letter: "O", label: "기회가 많은 도시", badge: "기회" },
    right: { letter: "W", label: "서로 돌보는 도시", badge: "포용" },
  },
  FH: {
    title: "발전 가치",
    left: { letter: "F", label: "새로움을 여는 도시", badge: "새로움" },
    right: { letter: "H", label: "이야기를 이어가는 도시", badge: "이야기" },
  },
};

/** A shared label keeps every result section aligned with the fixed axis poles. */
export function getPoleLabel(axis: AxisName, letter: AxisLetter): string {
  const info = AXIS_INFO[axis];
  return info.left.letter === letter ? info.left.label : info.right.label;
}

/** Short badges replace the hidden four-letter code as the card's identifier. */
export function getPoleBadge(axis: AxisName, letter: AxisLetter): string {
  const info = AXIS_INFO[axis];
  return info.left.letter === letter ? info.left.badge : info.right.badge;
}

/**
 * Strength is `winner ÷ axis total × 100`, so it reaches exactly 100 only when the
 * opposite pole scored zero. That makes it an exact single-pole test even in the
 * participant payload, which carries no per-pole `scores`.
 */
export function isSinglePole(strength: number): boolean {
  return strength === 100;
}

/** Stored strength stays 51~100; only what participants and admins read is capped. */
export function getDisplayStrength(strength: number): number {
  return isSinglePole(strength) ? SINGLE_POLE_DISPLAY_MAX : strength;
}
