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

/** Only the narrow coastal district needs its label nudged. */
const NUDGE: Record<string, [number, number]> = { 제물포구: [-16, -6] };

/** Sized to clear the south of Yeonsu-gu (x 168) and Yeongjong-gu (y 387). */
const ONJIN_BOX = { w: 142, h: 130 };

const CLIP_ID = "incheon-map-clip";

type Props = {
  counts: Record<string, number>;
  onSelect: (region: string, count: number) => void;
  reveal: Reveal;
  selected: string | null;
  tip: (text: string) => TipHandlers;
};

/** Gap between districts as the colour washes in, busiest first. */
const INK_STEP = 80;

/** Breathing room between the district outline and the highlight box. */
const HIGHLIGHT_PAD = 4;

/**
 * Incheon drawn from the simplified July 2026 district boundaries. The frame is
 * cropped to keep the mainland large, and Ongjin-gun, which falls outside it,
 * gets its own box at the lower left.
 */
export function IncheonMapCard({
  counts,
  onSelect,
  reveal,
  selected,
  tip,
}: Props) {
  const seaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    const sea = seaRef.current;
    if (!sea) return;

    const observer = new ResizeObserver(() =>
      setSize({ w: sea.clientWidth, h: sea.clientHeight }),
    );
    observer.observe(sea);

    return () => observer.disconnect();
  }, []);

  /* The highlight is measured from the selected shape and drawn as the last
     element of the map, because anything painted after it would cover it. */
  useEffect(() => {
    const path = selected === null ? null : pathRefs.current[selected];
    setBox(path ? path.getBBox() : null);
  }, [selected, size]);

  // One ramp from white to Incheon Blue, with zero participants at the palest end.
  const top = Math.max(0, ...Object.values(counts));
  const max = top || 1;
  const fill = (n: number) =>
    `rgb(${Math.round(255 - 255 * (n / max))},${Math.round(
      255 - 161 * (n / max),
    )},${Math.round(255 - 71 * (n / max))})`;
  const ink = (n: number) => (n / max > 0.55 ? "#fff" : "#3d4448");
  const halo = (n: number) =>
    n / max > 0.55 ? "rgba(0,50,100,.55)" : "rgba(255,255,255,.85)";

  const order = [...MAP.d.map((district) => district.name), "옹진군"].sort(
    (left, right) => (counts[right] ?? 0) - (counts[left] ?? 0),
  );
  const inkLag = (region: string) =>
    reveal.lag(order.indexOf(region) * INK_STEP);

  const clickable = (region: string, n: number) => ({
    ...tip(n ? `${region} ${n}명` : `${region} 참여자 없음`),
    onClick: () => onSelect(region, n),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSelect(region, n);
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
  const onjinCount = counts["옹진군"] ?? 0;

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
                  const n = counts[district.name] ?? 0;
                  return (
                    <path
                      aria-label={`${district.name} ${n}명`}
                      className={styles.dist}
                      d={district.d}
                      fill={reveal.grown ? fill(n) : "#fff"}
                      key={district.name}
                      ref={(node) => {
                        pathRefs.current[district.name] = node;
                      }}
                      stroke="#fff"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                      style={inkLag(district.name)}
                      {...clickable(district.name, n)}
                    />
                  );
                })}
                {MAP.d.map((district) => {
                  const n = counts[district.name] ?? 0;
                  const [dx, dy] = NUDGE[district.name] ?? [0, 0];
                  return (
                    <g
                      className={styles.dtext}
                      key={district.name}
                      style={{
                        opacity: reveal.grown ? 1 : 0,
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
                        {n}명
                      </text>
                    </g>
                  );
                })}
                {box && (
                  <rect
                    className={styles.pick}
                    height={box.height + HIGHLIGHT_PAD * 2}
                    width={box.width + HIGHLIGHT_PAD * 2}
                    x={box.x - HIGHLIGHT_PAD}
                    y={box.y - HIGHLIGHT_PAD}
                  />
                )}
              </g>
            </svg>
            <div
              className={`${styles.onjin} ${styles.dist} ${
                selected === "옹진군" ? styles.on : ""
              }`}
              style={{
                width: ONJIN_BOX.w * scale,
                height: ONJIN_BOX.h * scale,
                ...inkLag("옹진군"),
              }}
              {...clickable("옹진군", onjinCount)}
            >
              <svg
                preserveAspectRatio="xMidYMid meet"
                viewBox={`0 0 ${MAP.inset.w} ${MAP.inset.h}`}
              >
                <path
                  d={MAP.inset.d}
                  fill={reveal.grown ? fill(onjinCount) : "#fff"}
                  stroke="#16181a"
                  strokeWidth="0.6"
                />
              </svg>
              <b style={{ opacity: reveal.grown ? 1 : 0 }}>
                옹진군<span>{onjinCount}명</span>
              </b>
            </div>
          </>
        )}
      </div>
      <div className={styles.scale}>
        <span>0명</span>
        <i
          style={{ background: "linear-gradient(90deg,#fff,rgb(0,94,184))" }}
        />
        <span>{top}명</span>
      </div>
    </div>
  );
}
