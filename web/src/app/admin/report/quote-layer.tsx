"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import type { AxisName, BriefingQuote } from "@/lib/api";
import { AXIS_INFO, getPoleBadge } from "@/lib/city-axes";
import styles from "./quote-layer.module.css";
import tokens from "./tokens.module.css";

type Mode = "axis" | "topic" | "region" | "age";

const MODES: { value: Mode; label: string }[] = [
  { value: "axis", label: "도시가치 축" },
  { value: "topic", label: "계획 부문" },
  { value: "region", label: "군·구" },
  { value: "age", label: "연령대" },
];

const UNKNOWN = "(미확인)";

/* Contract orders, so a browsing officer meets the groups in the same sequence
   every time. Districts have none: they are ordered by how many quotes they hold. */
const ORDER: Record<Mode, string[]> = {
  axis: ["AC", "UN", "OW", "FH"],
  topic: [
    "일자리",
    "주거",
    "교통",
    "문화",
    "환경",
    "돌봄",
    "안전",
    "교육",
    "상권",
  ],
  region: [],
  age: ["19~24", "25~29", "30~34", "35~39"],
};

const UNRANKED = 1e4;

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

type Group = { key: string; label: string; items: BriefingQuote[] };

/** A quote can carry several topics, so grouping by section returns keys, not one. */
function keysOf(quote: BriefingQuote, mode: Mode): string[] {
  if (mode === "axis") return [quote.axis];
  if (mode === "topic")
    return quote.topics.length > 0 ? quote.topics : [UNKNOWN];
  if (mode === "region") return [quote.region || UNKNOWN];
  return [quote.age_band || UNKNOWN];
}

function labelOf(key: string, mode: Mode): string {
  if (key === UNKNOWN) return UNKNOWN;
  if (mode === "axis") return AXIS_INFO[key as AxisName].title;
  if (mode === "age") return `${key}세`;
  return key;
}

function rankOf(key: string, mode: Mode): number {
  if (key === UNKNOWN) return UNRANKED + 1;
  const index = ORDER[mode].indexOf(key);
  return index < 0 ? UNRANKED : index;
}

function group(quotes: BriefingQuote[], mode: Mode): Group[] {
  const bins = new Map<string, BriefingQuote[]>();
  for (const quote of quotes) {
    for (const key of keysOf(quote, mode)) {
      const bin = bins.get(key);
      if (bin) bin.push(quote);
      else bins.set(key, [quote]);
    }
  }

  return [...bins.entries()]
    .map(([key, items]) => ({ key, label: labelOf(key, mode), items }))
    .sort(
      (left, right) =>
        rankOf(left.key, mode) - rankOf(right.key, mode) ||
        right.items.length - left.items.length ||
        left.key.localeCompare(right.key),
    );
}

/**
 * The full de-identified quote set, browsable by axis, plan sector, district or age.
 * Rendered only while open, which is how the reference's eager fetch is avoided.
 */
export function QuoteLayer({
  quotes,
  onClose,
}: {
  quotes: BriefingQuote[];
  onClose: () => void;
}): ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("axis");
  const [term, setTerm] = useState("");
  const titleId = useId();
  const modeId = useId();
  const searchId = useId();

  useEffect(() => {
    panel.current?.focus();

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const found = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle === "") return quotes;
    return quotes.filter(
      (quote) =>
        quote.text.toLowerCase().includes(needle) ||
        quote.demand_title.toLowerCase().includes(needle),
    );
  }, [quotes, term]);

  const groups = useMemo(() => group(found, mode), [found, mode]);

  /* The layer owns the trap; returning focus to the trigger is the caller's, which
     only knows what opened it. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const nodes = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className={`${tokens.tokens} ${styles.layer}`}
      onKeyDown={onKeyDown}
      ref={panel}
      role="dialog"
      tabIndex={-1}
    >
      <div className={styles.head}>
        <div className={styles.headtext}>
          <h2 className={styles.title} id={titleId}>
            청년들의 목소리
          </h2>
          <p className={styles.sub}>
            제출본에서 비식별 처리한 발화 전수입니다. 인용 번호로 제출본까지
            추적할 수 있습니다.
          </p>
        </div>
        <button className={styles.close} onClick={onClose} type="button">
          닫기
        </button>
      </div>

      <div className={styles.controls}>
        <fieldset className={styles.modes}>
          <legend className={styles.hidden}>분류 기준</legend>
          {MODES.map((option) => (
            <label className={styles.mode} key={option.value}>
              <input
                checked={mode === option.value}
                className={styles.hidden}
                name={modeId}
                onChange={() => setMode(option.value)}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        <div className={styles.search}>
          <label className={styles.hidden} htmlFor={searchId}>
            발화와 요구 제목 검색
          </label>
          <input
            className={styles.input}
            id={searchId}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="발화나 요구 제목 검색"
            type="search"
            value={term}
          />
        </div>

        <p aria-live="polite" className={styles.count}>
          인용 {found.length}건
        </p>
      </div>

      <div className={styles.body}>
        {quotes.length === 0 ? (
          <p className={styles.empty}>표시할 비식별 인용이 없습니다.</p>
        ) : found.length === 0 ? (
          <p className={styles.empty}>
            검색 결과가 없습니다. 검색어를 바꾸거나 지워 보세요.
          </p>
        ) : (
          groups.map((section) => (
            <section className={styles.section} key={section.key}>
              <h3 className={styles.grouphead}>
                {section.label}
                <span>{section.items.length}건</span>
              </h3>
              <div className={styles.cards}>
                {section.items.map((quote) => (
                  <a
                    className={styles.card}
                    href={`/admin/submissions/${quote.submission_id}`}
                    key={quote.quote_id}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <p className={styles.text}>{quote.text}</p>
                    <p className={styles.demand}>{quote.demand_title}</p>
                    <div className={styles.meta}>
                      <span className={styles.axis}>
                        {AXIS_INFO[quote.axis].title}
                      </span>
                      <span className={styles.badge}>
                        {getPoleBadge(quote.axis, quote.letter)}
                      </span>
                      <span>{quote.region || UNKNOWN}</span>
                      <span>
                        {quote.age_band ? `${quote.age_band}세` : UNKNOWN}
                      </span>
                      <span className={styles.qid}>{quote.quote_id}</span>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
