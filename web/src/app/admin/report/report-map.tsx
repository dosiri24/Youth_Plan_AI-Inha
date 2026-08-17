"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import mapData from "@/data/incheon_map.json";
import type { AxisName, DashboardPerson } from "@/lib/api";
import { AXIS_INFO } from "@/lib/city-axes";
import { getCityType } from "@/lib/city-types";
import { AXIS_ORDER } from "../dashboard-data";
import styles from "./report-map.module.css";
import tokens from "./tokens.module.css";

type District = { name: string; d: string; x: number; y: number };

type IncheonMap = {
  vw: number;
  vh: number;
  d: District[];
  inset: { w: number; h: number; d: string };
};

const MAP = mapData as IncheonMap;

/** The inset shape carries no name in the data, the way the dashboard reads it too. */
const INSET_NAME = "옹진군";

/** Sized to clear the south of Yeonsu-gu (x 168) and Yeongjong-gu (y 387). */
const INSET_BOX = { w: 142, h: 130 };

/** Only the narrow coastal district needs its label nudged. */
const NUDGE: Record<string, [number, number]> = { 제물포구: [-16, -6] };

/**
 * Attempts per dot before it falls back to the district's label anchor. Mainland
 * shapes fill 41~69% of their bounding box and are done in a handful of tries;
 * Ongjin's islands fill 0.7% of theirs, which is what sets this budget.
 */
const TRIES = 400;

/** Minimum distance between two dots, in map units. */
const MIN_GAP = 13;

/** Share of the budget over which the spacing requirement decays to nothing. */
const CROWD_OUT = 0.25;

/** Window the entrance delays are drawn from, after the reference bubble map. */
const SPREAD_MS = 900;

/** Above this share of the map height the tooltip flips below the dot instead. */
const TIP_FLIP = 14;

/* The inset is letterboxed inside its box, so its own coordinates have to be
   folded into the mainland frame before a dot can be placed by percentage. */
const INSET_SCALE = Math.min(
  INSET_BOX.w / MAP.inset.w,
  INSET_BOX.h / MAP.inset.h,
);
const INSET_OX = (INSET_BOX.w - MAP.inset.w * INSET_SCALE) / 2;
const INSET_OY =
  MAP.vh - INSET_BOX.h + (INSET_BOX.h - MAP.inset.h * INSET_SCALE) / 2;

/** Where a dot lands when no candidate inside the shape passed the checks. */
const ANCHOR: Record<string, [number, number]> = {
  ...Object.fromEntries(
    MAP.d.map((district) => [district.name, [district.x, district.y]]),
  ),
  [INSET_NAME]: [
    INSET_OX + (MAP.inset.w * INSET_SCALE) / 2,
    INSET_OY + (MAP.inset.h * INSET_SCALE) / 2,
  ],
};

type Dot = {
  person: DashboardPerson;
  /** Percent of the map box, so one layer positions mainland and inset dots alike. */
  left: number;
  top: number;
  delay: number;
};

/** FNV-1a over the submission id, so the same participant always seeds the same. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Mulberry32: a seeded generator, because Math.random would move dots on reload. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crowded(
  placed: [number, number][],
  x: number,
  y: number,
  gap: number,
): boolean {
  return placed.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < gap ** 2);
}

/**
 * Draws one point inside the district shape, in mainland map units. Candidates come
 * from the shape's bounding box and are kept only when they fall in the fill.
 */
function place(
  path: SVGPathElement,
  region: string,
  random: () => number,
  placed: [number, number][],
): [number, number] {
  const inset = region === INSET_NAME;
  const box = path.getBBox();

  for (let index = 0; index < TRIES; index += 1) {
    const x = box.x + random() * box.width;
    const y = box.y + random() * box.height;
    if (!path.isPointInFill({ x, y })) continue;

    const sx = inset ? INSET_OX + x * INSET_SCALE : x;
    const sy = inset ? INSET_OY + y * INSET_SCALE : y;
    /* Spacing is a preference, not a rule: it decays as the budget runs out, so a
       shape too small to seat its dots apart still seats them rather than piling
       them all on the fallback anchor. */
    const gap = MIN_GAP * Math.max(0, 1 - index / (TRIES * CROWD_OUT));
    if (crowded(placed, sx, sy, gap)) continue;

    return [sx, sy];
  }

  const [ax, ay] = ANCHOR[region];
  return [ax + (random() * 2 - 1) * MIN_GAP, ay + (random() * 2 - 1) * MIN_GAP];
}

/** Lays out every placeable participant against the measured district shapes. */
function build(
  people: DashboardPerson[],
  probes: Record<string, SVGPathElement | null>,
): Dot[] {
  const placed: [number, number][] = [];
  const dots: Dot[] = [];

  /* Chronological order is what keeps existing dots put. Spacing makes a dot
     depend on the ones before it, so a later submission must be placed later. */
  const ordered = [...people].sort(
    (left, right) =>
      left.submitted_at.localeCompare(right.submitted_at) ||
      left.submission_id.localeCompare(right.submission_id),
  );

  for (const person of ordered) {
    const path = probes[person.region];
    if (!path) continue;

    const random = mulberry32(hash(person.submission_id));
    /* Drawn before any placement attempt, so the delay depends on the seed alone
       and not on how many candidates that shape happened to reject. */
    const delay = Math.floor(random() * SPREAD_MS);
    const [x, y] = place(path, person.region, random, placed);
    placed.push([x, y]);
    dots.push({
      person,
      left: (x / MAP.vw) * 100,
      top: (y / MAP.vh) * 100,
      delay,
    });
  }

  return dots;
}

/**
 * The cover map: one dot is exactly one participant, placed inside their district
 * from a seed so the picture is stable between runs and only grows.
 */
export function ReportDotMap({
  axis,
  onSelect,
  people,
  quiet = false,
  selected,
  spotlight,
}: {
  /** Colours every dot by that axis's two poles, or leaves them uniform. */
  axis: AxisName | null;
  onSelect: (submissionId: string | null) => void;
  people: DashboardPerson[];
  /** Holds back every district but the one being quoted, so text reads over it. */
  quiet?: boolean;
  selected: string | null;
  /** The participant whose quote is being read beside the map, if any. */
  spotlight: string | null;
}): ReactElement {
  const probes = useRef<Record<string, SVGPathElement | null>>({});
  const [dots, setDots] = useState<Dot[]>([]);
  const [still, setStill] = useState(true);
  const [hover, setHover] = useState<Dot | null>(null);
  const titleId = useId();
  const descId = useId();

  /* Measured a frame after the commit, so the probe shapes are laid out before
     they are asked about a point, and so the dots arrive in one batch. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDots(build(people, probes.current));
      setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    });

    return () => cancelAnimationFrame(frame);
  }, [people]);

  const known = new Set([
    ...MAP.d.map((district) => district.name),
    INSET_NAME,
  ]);
  const shown = people.filter((person) => known.has(person.region)).length;
  const missing = people.length - shown;

  const litRegion =
    people.find((person) => person.submission_id === spotlight)?.region ?? null;

  /* The four-letter code carries one letter per axis in a fixed order, so the
     pole a participant landed on is a lookup, not another request. */
  const slot = axis === null ? -1 : AXIS_ORDER.indexOf(axis);
  const info = axis === null ? null : AXIS_INFO[axis];
  const poleOf = (person: DashboardPerson) =>
    slot < 0 ? null : (person.code[slot] ?? null);
  const tint = (person: DashboardPerson) => {
    const pole = poleOf(person);
    if (pole === null || info === null) return "";
    return pole === info.left.letter ? styles.poleA : styles.poleB;
  };

  const label = (person: DashboardPerson) =>
    `${getCityType(person.code).nickname}, ${person.age}세, ${person.region}`;

  const tip = (dot: Dot): CSSProperties =>
    ({
      left: `${dot.left}%`,
      top: `${dot.top}%`,
      "--tx": dot.left < 20 ? "-12%" : dot.left > 80 ? "-88%" : "-50%",
      "--ty": dot.top < TIP_FLIP ? "14px" : "calc(-100% - 14px)",
    }) as CSSProperties;

  return (
    <figure
      className={`${tokens.tokens} ${styles.wrap} ${quiet ? styles.quiet : ""}`}
    >
      {/* Kept in the document but out of sight: isPointInFill and getBBox both
          need the shape rendered, and these copies are only ever measured. */}
      <svg aria-hidden className={styles.probe}>
        {MAP.d.map((district) => (
          <path
            d={district.d}
            key={district.name}
            ref={(node) => {
              probes.current[district.name] = node;
            }}
          />
        ))}
        <path
          d={MAP.inset.d}
          ref={(node) => {
            probes.current[INSET_NAME] = node;
          }}
        />
      </svg>

      <div
        className={styles.sea}
        style={{ "--map-ratio": MAP.vh / MAP.vw } as CSSProperties}
      >
        <svg
          aria-labelledby={`${titleId} ${descId}`}
          className={styles.map}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`0 0 ${MAP.vw} ${MAP.vh}`}
        >
          <title id={titleId}>자치구별 참여자 분포</title>
          <desc id={descId}>
            점 하나가 참여자 한 명입니다. 참여자 {people.length}명 가운데{" "}
            {shown}명을 자치구 도형 안에 표시했습니다.
          </desc>
          {MAP.d.map((district) => (
            <path
              className={`${styles.land} ${
                district.name === litRegion ? styles.litland : ""
              }`}
              d={district.d}
              key={district.name}
            />
          ))}
          {MAP.d.map((district) => {
            const [dx, dy] = NUDGE[district.name] ?? [0, 0];
            return (
              <text
                className={styles.name}
                key={district.name}
                textAnchor="middle"
                x={district.x + dx}
                y={district.y + dy}
              >
                {district.name}
              </text>
            );
          })}
        </svg>

        <div
          className={styles.inset}
          style={{
            width: `${(INSET_BOX.w / MAP.vw) * 100}%`,
            height: `${(INSET_BOX.h / MAP.vh) * 100}%`,
          }}
        >
          <svg
            aria-hidden
            preserveAspectRatio="xMidYMid meet"
            viewBox={`0 0 ${MAP.inset.w} ${MAP.inset.h}`}
          >
            <path
              className={`${styles.land} ${
                litRegion === INSET_NAME ? styles.litland : ""
              }`}
              d={MAP.inset.d}
            />
          </svg>
          <span className={styles.insetName}>{INSET_NAME}</span>
        </div>

        <div className={styles.layer}>
          {dots.map((dot) => {
            const picked = dot.person.submission_id === selected;
            const lit = dot.person.submission_id === spotlight;
            const near = litRegion !== null && dot.person.region === litRegion;
            return (
              <button
                aria-label={label(dot.person)}
                aria-pressed={picked}
                className={`${styles.dot} ${tint(dot.person)} ${
                  near ? styles.near : ""
                } ${picked ? styles.picked : ""} ${lit ? styles.lit : ""} ${
                  still ? "" : styles.play
                }`}
                key={dot.person.submission_id}
                onBlur={() => setHover(null)}
                onClick={() =>
                  onSelect(picked ? null : dot.person.submission_id)
                }
                onFocus={() => setHover(dot)}
                onMouseEnter={() => setHover(dot)}
                onMouseLeave={() => setHover(null)}
                style={
                  {
                    left: `${dot.left}%`,
                    top: `${dot.top}%`,
                    "--d": `${dot.delay}ms`,
                  } as CSSProperties
                }
                type="button"
              />
            );
          })}
        </div>

        {hover && (
          <div aria-hidden className={styles.tip} style={tip(hover)}>
            <b>{getCityType(hover.person.code).nickname}</b>
            <span>
              {hover.person.age}세 · {hover.person.region}
            </span>
          </div>
        )}
      </div>

      {/* What the colours mean right now. It changes with the quote, so it has to
          be stated every time rather than fixed in the caption. */}
      {info !== null && (
        <div className={styles.legend}>
          <span className={styles.legendaxis}>{info.title}</span>
          {[info.left, info.right].map((pole, index) => (
            <span className={styles.key} key={pole.letter}>
              <i className={index === 0 ? styles.keyA : styles.keyB} />
              {pole.badge}{" "}
              {people.filter((person) => poleOf(person) === pole.letter).length}
              명
            </span>
          ))}
          {/* These counts split all {people.length} participants, which means an
              axis with no evidence has been counted at its default pole. The
              axis section counts only the ones with evidence and so reports
              smaller figures for the same poles; without this the two read as a
              contradiction. */}
          <span className={styles.legendnote}>
            기본 극 포함 · 참여자 {people.length}명 전원
          </span>
        </div>
      )}

      {/* Placing an unresolved district would be inventing a location, so those
          participants are named in a caption instead of drawn. */}
      {missing > 0 && (
        <figcaption className={styles.caption}>
          자치구 미확인 {missing}명은 지도에 표시하지 않았습니다.
        </figcaption>
      )}
    </figure>
  );
}
