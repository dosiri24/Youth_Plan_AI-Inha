import { AXIS_INFO, getPoleBadge } from "@/lib/city-axes";
import type { AxisLetter, AxisName, DashboardPerson } from "@/lib/api";

export const AXIS_ORDER: AxisName[] = ["AC", "UN", "OW", "FH"];

/** The dashboard is the only screen that asks each axis as a question. */
export const AXIS_QUESTION: Record<AxisName, string> = {
  AC: "동네와 거리가 얼마나 붐비길 바라는가",
  UN: "집을 나섰을 때 어떤 풍경을 원하는가",
  OW: "도시가 무엇을 먼저 챙기길 바라는가",
  FH: "변화를 어떻게 받아들이는가",
};

/** Each plan section maps to the department that owns it. */
export const SECTIONS: Record<string, string> = {
  일자리: "산업·경제",
  주거: "주택",
  교통: "교통",
  문화: "문화·관광",
  환경: "환경·공원녹지",
  돌봄: "복지",
  안전: "방재·안전",
  교육: "교육",
  상권: "상업·도심",
};

export const AGE_BANDS = ["19~24", "25~29", "30~34", "35~39"];

export const AI_CARD_TITLES = {
  map: "군·구별 참여자 수",
  topics: "계획 부문별 요구",
  axes: "도시가치 4축",
  cross: "연령대별 요구사항",
  types: "내가 바라는 도시유형",
};

/** The four-letter code does not read on its own, so each axis leaning is spelled out. */
export function spellCode(code: string): string {
  return AXIS_ORDER.map((axis, index) =>
    getPoleBadge(axis, code[index] as AxisLetter),
  ).join(" · ");
}

export function axisTitle(axis: AxisName): string {
  return AXIS_INFO[axis].title;
}

/** A blank region means the interview never resolved one of the eleven districts. */
export function regionLabel(region: string): string {
  return region || "(미확인)";
}

const STAMP = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });

export function formatStamp(value: string): string {
  return STAMP.format(new Date(value));
}

export function formatDayRange(people: DashboardPerson[]): string {
  const times = people
    .map((person) => new Date(person.submitted_at).getTime())
    .sort((left, right) => left - right);

  return `${DAY.format(times[0])} ~ ${DAY.format(times[times.length - 1])}`;
}

/** Re-counting these in Excel is the officer's actual job, so the demands must export. */
export function buildDemandCsv(people: DashboardPerson[]): string {
  const quote = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;
  const rows = [
    ["참여자", "거주 군·구", "나이", "계획 부문", "요구", "언급 장소"],
  ];

  people.forEach((person, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    person.demands.forEach((demand) => {
      demand.topics.forEach((topic) => {
        rows.push([
          id,
          regionLabel(person.region),
          String(person.age),
          topic,
          demand.title,
          "",
        ]);
      });
    });
  });

  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
