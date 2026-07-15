import type { AxisLetter, AxisName } from "@/lib/api";

type Pole = {
  letter: AxisLetter;
  label: string;
};

type AxisInfo = {
  title: string;
  left: Pole;
  right: Pole;
};

export const AXIS_INFO: Record<AxisName, AxisInfo> = {
  EI: {
    title: "에너지의 방향",
    left: { letter: "E", label: "개방·교류·활력" },
    right: { letter: "I", label: "정주·정온·내밀" },
  },
  SN: {
    title: "시선의 대상",
    left: { letter: "S", label: "현실·실용·기존 자원" },
    right: { letter: "N", label: "미래·혁신·첨단" },
  },
  TF: {
    title: "우선하는 가치",
    left: { letter: "T", label: "효율·기능·경쟁력" },
    right: { letter: "F", label: "관계·돌봄·정서" },
  },
  JP: {
    title: "도시의 운영 방식",
    left: { letter: "J", label: "계획·정돈" },
    right: { letter: "P", label: "유연·혼합·자생" },
  },
};

/** A shared label keeps every result section aligned with the fixed axis poles. */
export function getPoleLabel(axis: AxisName, letter: AxisLetter): string {
  const info = AXIS_INFO[axis];
  return info.left.letter === letter ? info.left.label : info.right.label;
}
