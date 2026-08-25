import { AXIS_INFO, getPoleBadge } from "@/lib/city-axes";
import type {
  AxisLetter,
  AxisName,
  DashboardPerson,
  SettlementField,
} from "@/lib/api";

export const AXIS_ORDER: AxisName[] = ["AC", "UN", "OW", "FH"];

/** The dashboard is the only screen that asks each axis as a question. */
export const AXIS_QUESTION: Record<AxisName, string> = {
  AC: "동네와 거리가 얼마나 붐비길 바라는가",
  UN: "집을 나섰을 때 어떤 풍경을 원하는가",
  OW: "도시가 무엇을 먼저 챙기길 바라는가",
  FH: "변화를 어떻게 받아들이는가",
};

/** A sub-sector qualifies its chapter on screen; every count is by chapter alone. */
export function sectorLabel(sector: string, subsector: string): string {
  return subsector ? `${sector} · ${subsector}` : sector;
}

export const AGE_BANDS = ["19~24", "25~29", "30~34", "35~39"];

/** The three things a participant may say they will keep doing in Incheon. */
export const SETTLEMENT_FIELDS: [SettlementField, string][] = [
  ["residence", "거주"],
  ["work", "근무"],
  ["leisure", "여가"],
];

/* Only the closing question asks about living here, so leisure is answered too
   rarely to earn a bar; it still exports and still shows on a submission that
   mentioned it. */
export const SETTLEMENT_CARD_FIELDS = SETTLEMENT_FIELDS.filter(
  ([field]) => field !== "leisure",
);

export const AI_CARD_TITLES = {
  map: "군·구별 참여자 수",
  topics: "계획 부문별 요구",
  axes: "도시가치 4축",
  cross: "연령대별 요구사항",
  keywords: "청년 요구 키워드",
};

/** The ten chapters of the 2040 plan, in the order the backend's vocabulary lists them. */
const SECTOR_ORDER = [
  "토지이용계획",
  "기반시설",
  "도심 및 주거환경",
  "환경의 보전과 관리",
  "경관 및 미관",
  "공원 및 녹지",
  "방재 및 안전",
  "경제 및 산업",
  "복지 및 교육",
  "문화 및 관광",
];

/* Ten chapters need ten fills and 2.4 allows only Incheon Blue and Incheon Green,
   so the ramp between the two is cut into five and each step is used twice: once
   solid, once washed toward white. Chapters five apart in the list then differ by
   lightness, which separates far more readily than another slice of a ramp whose
   two ends are already this close. */
const BLUE = [0, 94, 184];
const GREEN = [0, 178, 169];
const HUE_STEPS = 5;
const WASH = 0.45;

export type SectorTone = { fill: string; ink: string };

/** A chapter with no colour of its own falls back to the board's muted grey. */
const PLAIN: SectorTone = { fill: "#54585a", ink: "#fff" };

function tone(index: number): SectorTone {
  const step = (index % HUE_STEPS) / (HUE_STEPS - 1);
  const washed = index >= HUE_STEPS;
  const channels = BLUE.map((from, channel) => {
    const mixed = from + (GREEN[channel] - from) * step;
    return Math.round(washed ? mixed + (255 - mixed) * WASH : mixed);
  });

  return {
    fill: `rgb(${channels.join(",")})`,
    ink: washed ? "#16181a" : "#fff",
  };
}

const SECTOR_TONES: Record<string, SectorTone> = Object.fromEntries(
  SECTOR_ORDER.map((sector, index) => [sector, tone(index)]),
);

/** The fill a keyword bubble wears, which is the colour of the chapter it landed in. */
export function sectorTone(sector: string): SectorTone {
  return SECTOR_TONES[sector] ?? PLAIN;
}

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

/** The column order is the contract officers paste into their own sheets. */
const CSV_COLUMNS = [
  "참여자",
  "거주 군·구",
  "거주지 원문",
  "행정동",
  "나이",
  "부문",
  "요구",
  "키워드",
  "언급 장소 원문",
  "언급 장소 군·구",
  "최우선 여부",
  "정착 의향(거주)",
  "정착 의향(근무)",
  "정착 의향(여가)",
];

/** Places are joined rather than split into rows, so the two columns stay aligned.
    A demand's keywords ride in one cell for the same reason: splitting them would
    multiply the rows and every count taken off the sheet would come out too high. */
const PLACE_JOIN = " · ";

/**
 * Re-counting these in Excel is the officer's actual job, so the demands must export.
 * Extra demands arrive in the same list as the axis ones and get a row on the same
 * terms; a submission with no blinded copy yet has no demands and so no rows.
 */
export function buildDemandCsv(people: DashboardPerson[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [CSV_COLUMNS];

  people.forEach((person, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    person.demands.forEach((demand) => {
      rows.push([
        id,
        regionLabel(person.region),
        person.raw_region,
        person.dong,
        String(person.age),
        sectorLabel(demand.sector, demand.subsector),
        demand.title,
        demand.keywords.join(PLACE_JOIN),
        demand.places.map((place) => place.text).join(PLACE_JOIN),
        demand.places.map((place) => place.district).join(PLACE_JOIN),
        demand.top ? "최우선" : "",
        ...SETTLEMENT_FIELDS.map(([field]) => person.settlement[field] ?? ""),
      ]);
    });
  });

  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
