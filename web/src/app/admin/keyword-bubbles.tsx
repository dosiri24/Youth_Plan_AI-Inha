"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { KeywordStat } from "@/lib/api";

import styles from "./dashboard.module.css";
import { sectorTone } from "./dashboard-data";
import type { Reveal } from "./motion";
import type { TipHandlers } from "./tip";

/* The card now spans the middle column and is about 1046x229 once the heading and
   the footnote have taken their share. Packing is not what caps this: at the
   coverage below the field swallows every keyword the current sample produces.
   Reading is. Radii fall as the count grows, and past forty the smallest circles
   drop under the size their own name needs, so the card turns into a field of
   unlabelled dots. Everything past the cut is exported whole in the CSV. */
const TOP = 40;

/* Share of the field the circles cover. Higher and they touch, lower and the
   card reads as a scatter of dots adrift in white. It is a share rather than a
   size, so the density it sets survived the card growing: forty circles in the
   larger field sit as far apart as twenty did in the smaller one. */
const COVERAGE = 0.44;

const R_MIN = 13;

/* How far past the even share the largest circle may run. The even share is the
   radius every circle would have if they all split the coverage equally, so the
   ceiling now shrinks and grows with the count instead of standing at a fixed
   forty-six pixels. That fixed number was fine at forty circles and wrong the
   moment a sector filter left three: the even share alone is over a hundred
   pixels there, forty-six cut every circle down to a third of the size the
   coverage asked for, and the card came out eight percent covered against the
   forty-four it aims for. At forty circles on this card the ratio lands back on
   about forty-six, so the unfiltered picture is the one it always was. */
const R_SPREAD = 1.6;

/* The largest type on the card, as a share of the largest circle it can hold. It
   was a flat thirteen pixels, which is exactly this share of the old forty-six
   ceiling and reads as a caption stranded in a saucer once a circle passes a
   hundred. */
const LABEL_CAP = 0.283;

/* One turn of the spiral steps this far out, and candidates are tested this far
   apart along it. Both are shorter than the smallest circle, so no gap wide
   enough to hold one is stepped over. */
const TURN_GAP = 7;
const PROBE = 4;
const PROBE_CAP = 40000;

/* Two seconds is the whole intro, and the largest circles have to be up well
   before it ends. */
const POP_STEP = 60;

type Bubble = { stat: KeywordStat; x: number; y: number; r: number };

/** A keyword's name as it will be written: one line, or two when one will not fit. */
type Label = { size: number; lines: string[] };

/* The ceiling travels out with the circles because the type size is pinned to it,
   and only `pack` knows the field the ceiling was derived from. */
type Packed = { bubbles: Bubble[]; ceiling: number };

type Props = {
  keywords: KeywordStat[];
  onClearFilter: () => void;
  onSelect: (keyword: string) => void;
  reveal: Reveal;
  sector: string | null;
  selected: string | null;
  tip: (text: string) => TipHandlers;
};

/**
 * How many participants named this keyword inside one plan chapter.
 *
 * Every read of the per-chapter split goes through here, so the backend renaming
 * the field costs this line and the type beside it. Runs analysed before the split
 * existed have no field to read, and there the representative chapter is the whole
 * answer available: it credits the keyword to one chapter only, which is wrong for
 * a keyword that spans two, but it keeps the card drawing rather than emptying.
 */
function headsIn(stat: KeywordStat, sector: string): number {
  const byChapter = stat.sector_people;
  if (byChapter) return byChapter[sector] ?? 0;

  return stat.sector === sector ? stat.people : 0;
}

/**
 * Places the circles largest first, each at the first point on a spiral running
 * outward from the centre where it clears the ones already down and still fits
 * inside the box.
 *
 * Nothing here is random and nothing settles over time, so the same figures
 * always draw the same picture: an officer has to be able to hold this card
 * against the one they read yesterday. The spiral is stretched by the field's
 * own proportions, or a card four times wider than it is tall would fill a
 * circle in the middle and leave both ends empty.
 */
function pack(stats: KeywordStat[], width: number, height: number): Packed {
  const drawn = stats.slice(0, TOP);
  const heads = drawn.reduce((sum, stat) => sum + stat.people, 0);
  if (heads === 0) return { bubbles: [], ceiling: 0 };

  /* Area carries the count, so the radius follows its square root: an eye reads a
     circle by how much ink it holds, and a radius set straight to the count would
     show six people as thirty-six. */
  const perHead = (COVERAGE * width * height) / (Math.PI * heads);
  const even = Math.sqrt(
    (COVERAGE * width * height) / (Math.PI * drawn.length),
  );
  /* Half the height is the hard stop no count may argue with: a circle taller than
     that hangs out of the card whichever way the spiral turns it. */
  const ceiling = Math.min(R_SPREAD * even, height / 2);
  const radius = (people: number) =>
    Math.min(ceiling, Math.max(R_MIN, Math.sqrt(perHead * people)));

  const aspect = width / height;
  const cx = width / 2;
  const cy = height / 2;
  const coil = TURN_GAP / (2 * Math.PI);
  const placed: Bubble[] = [];

  for (const stat of drawn) {
    const r = radius(stat.people);
    let angle = 0;

    for (let probe = 0; probe < PROBE_CAP; probe += 1) {
      const reach = coil * angle;
      const x = cx + reach * aspect * Math.cos(angle);
      const y = cy + reach * Math.sin(angle);

      if (
        x - r >= 0 &&
        x + r <= width &&
        y - r >= 0 &&
        y + r <= height &&
        placed.every(
          (other) => Math.hypot(other.x - x, other.y - y) >= other.r + r + 1,
        )
      ) {
        placed.push({ stat, x, y, r });
        break;
      }

      /* Stepping by a fixed angle would crawl at the centre and leap whole
         circles once the coil is wide, so the step is the arc length instead. */
      angle += Math.min(0.5, PROBE / Math.max(1, reach * aspect));
      if (reach > width + height) break;
    }
  }

  return { bubbles: placed, ceiling };
}

/**
 * Breaks a keyword that will not fit on one line into two of about equal length.
 *
 * The break is at the middle with the odd syllable going up, which is where a
 * centred two-line title carries its weight. Nothing here reads the word: these are
 * compound nouns of at most eight syllables and the honest morpheme boundary is not
 * something the front end can find, so an even break beats a confidently wrong one.
 */
function split(keyword: string): [string, string] {
  const head = Math.ceil(keyword.length / 2);

  return [keyword.slice(0, head), keyword.slice(head)];
}

/**
 * A keyword only gets its name written across it when the name actually fits, on
 * one line if it can and broken over two if it cannot.
 *
 * Two lines are not a nicety here. While the type is still growing with the circle
 * the one-line test is `n * 0.32r <= 1.85r`, and the radius cancels out of it: the
 * answer is a flat "under six syllables", and no circle is ever big enough to change
 * it. Six only becomes possible once the type has stopped growing at its cap and the
 * radius alone keeps rising, which on the unfiltered card happens a hair under the
 * largest circle the field holds; seven and eight never arrive at all. Keywords run
 * to eight syllables, so those were drawn as bare unlabelled discs. Splitting the
 * word puts half the syllables against the test and brings them all back.
 */
function label(keyword: string, r: number, ceiling: number): Label | null {
  if (r < 17) return null;

  const size = Math.min(ceiling * LABEL_CAP, Math.max(8.5, r * 0.32));

  /* A Hangul syllable advances about one em, and the chord across a circle is 2r,
     so this leaves a sliver of padding at both ends of the longest word that fits. */
  if (keyword.length * size <= r * 1.85) return { size, lines: [keyword] };

  /* A second line is measured against a shorter chord than the diameter. With the
     line height at 1 the pair straddles the centre, so each line runs from the
     centre out to `size` and the width both have to live inside is the chord at
     that height, not at the middle. Same sliver of padding as above. The vertical
     fit comes out of the same figure: a real chord there is what says the two lines
     have not reached past the top and bottom of the circle. */
  const halfChord = Math.sqrt(Math.max(0, r * r - size * size));
  const [head, tail] = split(keyword);
  if (Math.max(head.length, tail.length) * size <= halfChord * 1.85)
    return { size, lines: [head, tail] };

  return null;
}

/**
 * What the young people asked for, one circle per keyword: the area is how many
 * of them said it and the colour is the plan chapter it belongs to.
 *
 * Picking a chapter elsewhere on the board narrows the field to the keywords that
 * chapter's demands produced, sized by the heads it drew there rather than by the
 * heads it drew everywhere.
 */
export function KeywordBubbleCard({
  keywords,
  onClearFilter,
  onSelect,
  reveal,
  sector,
  selected,
  tip,
}: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const observer = new ResizeObserver(() =>
      setSize({ w: field.clientWidth, h: field.clientHeight }),
    );
    observer.observe(field);

    return () => observer.disconnect();
  }, []);

  /* Re-sorted rather than filtered in place: the pack lays circles down largest
     first and takes the top forty off the front, and a keyword's rank across the
     whole board says nothing about its rank inside one chapter. */
  const shown = useMemo(() => {
    if (sector === null) return keywords;

    return keywords
      .map((stat) => ({ ...stat, people: headsIn(stat, sector) }))
      .filter((stat) => stat.people > 0)
      .sort((left, right) => right.people - left.people);
  }, [keywords, sector]);

  /* Forty circles cost the spiral about 120ms to place, which is fine once and
     far too slow to repeat on every click and every step of the intro. */
  const { bubbles, ceiling } = useMemo(
    () => (size ? pack(shown, size.w, size.h) : { bubbles: [], ceiling: 0 }),
    [shown, size],
  );

  return (
    <div className={styles.bubwrap}>
      <div className={styles.bubfield} ref={fieldRef}>
        {/* The card is only mounted when the run has keywords at all, so an empty
            field can only be a chapter nobody's demands produced a keyword for. */}
        {sector && shown.length === 0 && (
          <div className={styles.nodata}>
            {sector} 부문의 요구에서는 키워드가 나오지 않았습니다.
          </div>
        )}
        {bubbles.map(({ stat, x, y, r }, index) => {
          const { fill, ink } = sectorTone(stat.sector);
          const name = label(stat.keyword, r, ceiling);
          /* Narrowed, the head count is the chapter's own, so naming the keyword's
             representative chapter beside it would read as the count's source and
             be the wrong chapter whenever the two differ. */
          const said = sector
            ? `${sector} 부문에서 ${stat.people}명`
            : `${stat.people}명 · ${stat.sector}`;

          return (
            <div
              aria-label={`${stat.keyword} ${said}`}
              className={`${styles.bub} ${
                selected === stat.keyword ? styles.on : ""
              }`}
              key={stat.keyword}
              onClick={() => onSelect(stat.keyword)}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(stat.keyword);
              }}
              role="button"
              style={{
                left: x - r,
                top: y - r,
                width: r * 2,
                height: r * 2,
                background: fill,
                color: ink,
                transform: reveal.grown ? "scale(1)" : "scale(0)",
                ...reveal.lag(index * POP_STEP),
              }}
              tabIndex={0}
              {...tip(`${stat.keyword} — ${said}`)}
            >
              {name !== null && (
                <span className={styles.bl} style={{ fontSize: name.size }}>
                  {/* Keyed by position, not by text: a word whose two halves come
                      out the same would otherwise collide on one key. */}
                  {name.lines.map((line, at) => (
                    <span key={at}>{line}</span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Naming the cut keeps the card from reading as the whole vocabulary, and it
          is the same line that has to say when the field is only one chapter's. The
          heading would be the louder place to say it, but the AI chip already sits
          there and a second thing beside it reads as a second control rather than a
          state. The way back out has to be here too: a field that quietly shows a
          fraction of the keywords with nothing to undo it is a trap. */}
      <div
        className={`${styles.bubmore} ${sector ? styles.narrow : ""}`}
        aria-live="polite"
      >
        {sector
          ? `${sector} 부문 키워드 ${bubbles.length}개`
          : `상위 ${bubbles.length}개 키워드`}
        {sector && (
          <button className={styles.all} onClick={onClearFilter} type="button">
            전체 보기
          </button>
        )}
      </div>
    </div>
  );
}
