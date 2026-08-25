"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import mapData from "@/data/incheon_map.json";
import styles from "./dashboard.module.css";
import type { Reveal } from "./motion";
import type { TipHandlers } from "./tip";

type District = { name: string; d: string; x: number; y: number };

type IncheonMap = {
  vw: number;
  vh: number;
  d: District[];
  inset: { w: number; h: number; d: string };
};

const MAP = mapData as IncheonMap;

/** Which of the two measures the shapes currently carry. */
export type MapMode = "people" | "places";

/* Two measures on the same shapes would read as one if they shared the ramp, so
   each takes one of the board's two colours and only one is on screen at a time.
   `deep` is where a ramp turns dark enough to carry white text, and the shadow the
   text needs there; the teal never gets that dark, so it keeps dark text throughout. */
const TONE: Record<
  MapMode,
  {
    measure: string;
    unit: string;
    top: [number, number, number];
    deep: { at: number; halo: string } | null;
  }
> = {
  people: {
    measure: "참여자",
    unit: "명",
    top: [0, 94, 184],
    deep: { at: 0.55, halo: "rgba(0,50,100,.55)" },
  },
  places: {
    measure: "요구에 언급",
    unit: "건",
    top: [0, 178, 169],
    deep: null,
  },
};

/** Only the narrow coastal district needs its label nudged. */
const NUDGE: Record<string, [number, number]> = { 제물포구: [-16, -6] };

/** Sized to clear the south of Yeonsu-gu (x 168) and Yeongjong-gu (y 387). */
const ONJIN_BOX = { w: 142, h: 130 };

const CLIP_ID = "incheon-map-clip";

type Props = {
  counts: Record<string, number>;
  mode: MapMode;
  onSelect: (region: string, count: number) => void;
  /** Districts a demand named, which is a different thing from who took part. */
  places: Record<string, number>;
  reveal: Reveal;
  selected: string | null;
  tip: (text: string) => TipHandlers;
};

/** Gap between districts as the colour washes in, busiest first. */
const INK_STEP = 80;

/**
 * Incheon drawn from the simplified July 2026 district boundaries. The frame is
 * cropped to keep the mainland large, and Ongjin-gun, which falls outside it,
 * gets its own box at the lower left.
 */
export function IncheonMapCard({
  counts,
  mode,
  onSelect,
  places,
  reveal,
  selected,
  tip,
}: Props) {
  const seaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const sea = seaRef.current;
    if (!sea) return;

    const observer = new ResizeObserver(() =>
      setSize({ w: sea.clientWidth, h: sea.clientHeight }),
    );
    observer.observe(sea);

    return () => observer.disconnect();
  }, []);

  const tone = TONE[mode];
  const values = mode === "people" ? counts : places;
  const value = (region: string) => values[region] ?? 0;

  // One ramp from white to the measure's colour, with zero at the palest end.
  const top = Math.max(0, ...Object.values(values));
  const max = top || 1;
  const peak = `rgb(${tone.top.join(",")})`;
  const fill = (n: number) =>
    `rgb(${tone.top
      .map((channel) => Math.round(255 - (255 - channel) * (n / max)))
      .join(",")})`;
  const deep = (n: number) => tone.deep !== null && n / max > tone.deep.at;
  const ink = (n: number) => (deep(n) ? "#fff" : "#3d4448");
  const halo = (n: number) =>
    tone.deep && deep(n) ? tone.deep.halo : "rgba(255,255,255,.85)";

  /* Picking one district pushes the rest back rather than boxing the winner in:
     the outline can then follow the real boundary instead of a bounding box. */
  const faded = (region: string) => selected !== null && selected !== region;
  const picked = MAP.d.find((district) => district.name === selected) ?? null;

  const order = [...MAP.d.map((district) => district.name), "옹진군"].sort(
    (left, right) => value(right) - value(left),
  );
  const inkLag = (region: string) =>
    reveal.lag(order.indexOf(region) * INK_STEP);

  /* The measure not on the shapes is still worth a glance, so hovering gives
     both without either crowding the map. */
  const label = (region: string) => {
    const n = counts[region] ?? 0;
    const mentions = places[region] ?? 0;
    const who = n ? `${region} ${n}명` : `${region} 참여자 없음`;
    return mentions ? `${who} · 요구에 언급 ${mentions}건` : who;
  };

  const clickable = (region: string) => ({
    ...tip(label(region)),
    onClick: () => onSelect(region, counts[region] ?? 0),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSelect(region, counts[region] ?? 0);
    },
    role: "button",
    tabIndex: 0,
  });

  /* The map fills the box with no slack. Slack cuts Ganghwa-gun off inside the
     box and the cut edge stays visible. The scale is left alone and only the
     spare axis of the viewBox is stretched. */
  const scale = size ? Math.min(size.w / MAP.vw, size.h / MAP.vh) : 0;
  const viewWidth = size ? size.w / scale : MAP.vw;
  const viewHeight = size ? size.h / scale : MAP.vh;
  const onjinValue = value("옹진군");

  return (
    <div className={styles.mapwrap}>
      <div className={styles.sea} ref={seaRef}>
        {size && (
          <>
            <svg
              preserveAspectRatio="xMidYMid meet"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            >
              <defs>
                <clipPath id={CLIP_ID}>
                  <rect height={viewHeight} width={viewWidth} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${CLIP_ID})`}>
                {MAP.d.map((district) => {
                  const n = value(district.name);
                  return (
                    <path
                      aria-label={`${district.name} ${n}${tone.unit}`}
                      className={`${styles.dist} ${
                        faded(district.name) ? styles.back : ""
                      }`}
                      d={district.d}
                      fill={reveal.grown ? fill(n) : "#fff"}
                      key={district.name}
                      stroke="#fff"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                      style={inkLag(district.name)}
                      {...clickable(district.name)}
                    />
                  );
                })}
                {MAP.d.map((district) => {
                  const n = value(district.name);
                  const [dx, dy] = NUDGE[district.name] ?? [0, 0];
                  return (
                    <g
                      className={styles.dtext}
                      key={district.name}
                      style={{
                        opacity: reveal.grown
                          ? faded(district.name)
                            ? 0.35
                            : 1
                          : 0,
                        ...inkLag(district.name),
                      }}
                    >
                      <text
                        className={styles.dlab}
                        style={{ fill: ink(n), stroke: halo(n) }}
                        textAnchor="middle"
                        x={district.x + dx}
                        y={district.y + dy}
                      >
                        {district.name}
                      </text>
                      <text
                        className={styles.dnum}
                        style={{ fill: ink(n), stroke: halo(n) }}
                        textAnchor="middle"
                        x={district.x + dx}
                        y={district.y + dy + 17}
                      >
                        {n}
                        {tone.unit}
                      </text>
                    </g>
                  );
                })}
                {picked && (
                  <g className={styles.pick} key={picked.name}>
                    <path d={picked.d} pathLength={1} />
                    <path d={picked.d} pathLength={1} />
                  </g>
                )}
              </g>
            </svg>
            <div
              className={`${styles.onjin} ${styles.dist} ${
                faded("옹진군") ? styles.back : ""
              } ${selected === "옹진군" ? styles.on : ""}`}
              style={{
                width: ONJIN_BOX.w * scale,
                height: ONJIN_BOX.h * scale,
                ...inkLag("옹진군"),
              }}
              {...clickable("옹진군")}
            >
              <svg
                preserveAspectRatio="xMidYMid meet"
                viewBox={`0 0 ${MAP.inset.w} ${MAP.inset.h}`}
              >
                <path
                  d={MAP.inset.d}
                  fill={reveal.grown ? fill(onjinValue) : "#fff"}
                  stroke="#16181a"
                  strokeWidth="0.6"
                />
              </svg>
              <b style={{ opacity: reveal.grown ? 1 : 0 }}>
                옹진군
                <span>
                  {onjinValue}
                  {tone.unit}
                </span>
              </b>
            </div>
          </>
        )}
      </div>
      <div className={styles.scale}>
        <span>
          {tone.measure} 0{tone.unit}
        </span>
        <i style={{ background: `linear-gradient(90deg,#fff,${peak})` }} />
        <span>
          {top}
          {tone.unit}
        </span>
      </div>
    </div>
  );
}
