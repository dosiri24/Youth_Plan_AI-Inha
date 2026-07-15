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
    left: { letter: "E", label: "북적이고 열린 도시" },
    right: { letter: "I", label: "조용하고 아늑한 도시" },
  },
  SN: {
    title: "시선의 대상",
    left: { letter: "S", label: "지금 있는 것을 살리는" },
    right: { letter: "N", label: "새로운 것에 도전하는" },
  },
  TF: {
    title: "우선하는 가치",
    left: { letter: "T", label: "효율적으로 굴러가는" },
    right: { letter: "F", label: "서로 챙기고 보듬는" },
  },
  JP: {
    title: "도시의 운영 방식",
    left: { letter: "J", label: "계획대로 정돈된" },
    right: { letter: "P", label: "자유롭게 섞이는" },
  },
};

/** A shared label keeps every result section aligned with the fixed axis poles. */
export function getPoleLabel(axis: AxisName, letter: AxisLetter): string {
  const info = AXIS_INFO[axis];
  return info.left.letter === letter ? info.left.label : info.right.label;
}
