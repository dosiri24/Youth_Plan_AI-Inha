"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { getPoleBadge } from "@/lib/city-axes";
import {
  getLatestAnalysis,
  runAnalysis,
  type AiNoteCard,
  type AnalysisRun,
} from "@/lib/api";

import styles from "./dashboard.module.css";
import {
  AGE_BANDS,
  AXIS_QUESTION,
  SETTLEMENT_CARD_FIELDS,
  axisTitle,
  buildDemandCsv,
  formatDayRange,
  formatStamp,
} from "./dashboard-data";
import { DetailPanel, type Selection } from "./detail-panel";
import { IncheonMapCard, type MapMode } from "./incheon-map";
import { KeywordBubbleCard } from "./keyword-bubbles";
import { CountUp, useReveal, useSlide } from "./motion";
import { Switch } from "./switch";
import { useTip } from "./tip";

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

const MAP_MODES = [
  ["people", "참여자 수"],
  ["places", "언급 수"],
] as const satisfies readonly (readonly [MapMode, string])[];

const SORT_KEYS = [
  [1, "건수순"],
  [2, "언급 인원순"],
] as const;

type LoadStatus = "loading" | "ready" | "empty" | "error";

function NoData({ text }: { text: string }) {
  return <div className={styles.nodata}>{text}</div>;
}

export default function Dashboard() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  /* The chapter the keyword field is narrowed to, held apart from the selection
     rather than read off it. They part company as soon as a bubble is clicked: the
     panel moves on to that keyword while the field it was picked from has to stay
     as it was, or every pick would throw away the narrowing that made the pick
     possible. */
  const [sector, setSector] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [sortKey, setSortKey] = useState<1 | 2>(1);
  const [mapMode, setMapMode] = useState<MapMode>("people");
  const [updating, setUpdating] = useState(false);
  const [noSubmissions, setNoSubmissions] = useState(false);
  const [scale, setScale] = useState<number | null>(null);

  const { tipRef, tip } = useTip();
  const reveal = useReveal(run);
  const slide = useSlide(sortKey);

  useEffect(() => {
    void getLatestAnalysis()
      .then((latest) => {
        setRun(latest);
        setStatus(latest === null ? "empty" : "ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  /* Fixed 16:9, scaled as one piece to fit the window. */
  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          window.innerWidth / STAGE_WIDTH,
          window.innerHeight / STAGE_HEIGHT,
        ),
      );

    fit();
    window.addEventListener("resize", fit);

    return () => window.removeEventListener("resize", fit);
  }, []);

  /**
   * Moves the selection, and moves the keyword field's chapter with it unless the
   * new selection is a keyword.
   *
   * A chapter row, a top-demand row and a cell of the age table all say the same
   * thing about which chapter is being read, so all three narrow the field.
   * Anything that is not about a chapter — a district, an axis, a person, an AI
   * note, or going back to nothing — widens it again, because leaving the field
   * narrowed under a heading that no longer mentions the chapter is how a partial
   * picture gets read as the whole one.
   */
  const select = (next: Selection | null) => {
    setSelection(next);
    if (next?.kind === "keyword") return;

    setSector(
      next?.kind === "sector" || next?.kind === "top" ? next.sector : null,
    );
  };

  const pick = (next: Selection) => ({
    onClick: () => select(next),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select(next);
    },
    role: "button",
    tabIndex: 0,
  });

  const update = async () => {
    if (updating) return;

    setUpdating(true);
    setNoSubmissions(false);
    try {
      const outcome = await runAnalysis();
      if (outcome === "empty") {
        setNoSubmissions(true);
        return;
      }
      const latest = await getLatestAnalysis();
      setRun(latest);
      setStatus(latest === null ? "empty" : "ready");
      select(null);
    } catch {
      setStatus("error");
    } finally {
      setUpdating(false);
    }
  };

  const download = () => {
    const people = run?.people;
    if (!people?.length) return;

    // Excel reads the file as EUC-KR without a byte order mark.
    const blob = new Blob(["\ufeff" + buildDemandCsv(people)], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "유스플랜AI_청년의견_원자료.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const aiChip = (card: AiNoteCard) =>
    run?.ai_notes?.[card] ? (
      <button
        className={styles.aichip}
        onClick={() => select({ kind: "ai", card })}
        type="button"
      >
        AI 해석
      </button>
    ) : null;

  const stamp = updating
    ? "분석을 업데이트하는 중입니다"
    : noSubmissions
      ? "분석할 제출본이 없습니다"
      : status === "loading"
        ? "불러오는 중입니다"
        : status === "error"
          ? "분석 결과를 불러오지 못했습니다. 새로고침해 주세요"
          : status === "empty" || run === null
            ? "아직 분석하지 않았습니다"
            : `${formatStamp(run.executed_at)} 기준`;

  const kpi = run?.kpi;
  const ages = run?.ages;
  const sectors = run?.sectors;
  const cross = run?.cross;
  const people = run?.people;
  const settlement = run?.settlement;
  const places = run?.places;
  const keywords = run?.keywords;

  const summary: [string, ReactNode, string][] = [
    [
      "참여자 수",
      kpi ? <CountUp reveal={reveal} value={kpi.participants} /> : "—",
      kpi ? "명" : "",
    ],
    [
      "수집된 세부 요구",
      kpi ? <CountUp reveal={reveal} value={kpi.demands} /> : "—",
      kpi ? "건" : "",
    ],
    [
      "참여 군·구 수",
      kpi ? (
        <>
          <CountUp reveal={reveal} value={kpi.regions} /> / 11
        </>
      ) : (
        "—"
      ),
      kpi ? "곳" : "",
    ],
    ["활용 계획", "2045 인천도시기본계획", ""],
  ];

  const ageMax = Math.max(1, ...(ages ?? []).map((band) => band.total));

  const sectorRows = [...(sectors ?? [])].sort((left, right) =>
    sortKey === 1 ? right.demands - left.demands : right.people - left.people,
  );
  const sectorMax = Math.max(
    1,
    ...sectorRows.map((row) => (sortKey === 1 ? row.demands : row.people)),
  );

  /* A sector with no demands is left out of `cross` entirely, but the table names the
     same ten chapters as the card above it: a missing row reads as a chapter that does
     not exist rather than one nobody spoke about. */
  const crossRows = sectors ?? [];
  const crossZero = AGE_BANDS.map(() => 0);
  const crossMax = Math.max(
    1,
    ...crossRows.flatMap((row) => cross?.[row.sector] ?? []),
  );

  const topRows = run?.top_demands?.by_sector ?? [];
  const topMax = Math.max(1, ...topRows.map((row) => row.count));

  const fit = scale ?? 1;

  return (
    <div className={styles.root}>
      <div
        className={`${styles.stage} ${aiMode ? styles.aion : ""} ${
          reveal.hold ? styles.hold : ""
        }`}
        style={{
          transform: `translate(${(-STAGE_WIDTH / 2) * fit}px, ${(-STAGE_HEIGHT / 2) * fit}px) scale(${fit})`,
          visibility: scale === null ? "hidden" : "visible",
        }}
      >
        <div className={styles.top}>
          <button
            className={styles.brand}
            onClick={() => window.location.reload()}
            type="button"
          >
            유스플랜AI
          </button>
          <span className={styles.t}>청년 의견 관리 플랫폼</span>
          <span className={styles.d}>{stamp}</span>
          <span className={styles.sp} />
          <label className={styles.ai}>
            <input
              checked={aiMode}
              onChange={(event) => setAiMode(event.target.checked)}
              type="checkbox"
            />
            <span className={styles.sw} />
            AI 분석모드
          </label>
          <Link className={`${styles.btn} ${styles.g}`} href="/admin/report">
            종합 브리핑
          </Link>
          <Link
            className={`${styles.btn} ${styles.g}`}
            href="/admin/submissions"
          >
            제출본 목록
          </Link>
          <Link className={`${styles.btn} ${styles.g}`} href="/admin/activity">
            접속 현황
          </Link>
          <button
            className={`${styles.btn} ${styles.g}`}
            disabled={!people?.length}
            onClick={download}
            type="button"
          >
            원자료 CSV 내려받기
          </button>
          <button
            className={styles.btn}
            disabled={updating}
            onClick={() => void update()}
            type="button"
          >
            {updating ? "분석 중" : "분석 업데이트"}
          </button>
        </div>

        <div className={styles.strip}>
          {summary.map(([label, value, unit]) => (
            <div className={styles.st} key={label}>
              <span className={styles.l}>{label}</span>
              <span className={`${styles.v} ${unit ? "" : styles.txt}`}>
                {value}
                {unit && <small>{unit}</small>}
              </span>
            </div>
          ))}
          <div className={styles.sp} />
          <div className={styles.aicaution}>
            AI가 생성한 해석입니다. 외부에 인용하기 전 수치를 직접 확인하시기
            바랍니다.
          </div>
        </div>

        <div className={styles.grid}>
          <div className={`${styles.col} ${styles.l}`}>
            <div className={styles.card}>
              <h2>
                군·구별 분포
                <Switch
                  onChange={setMapMode}
                  options={MAP_MODES}
                  value={mapMode}
                />
                {aiChip("map")}
              </h2>
              {run?.regions_count ? (
                <IncheonMapCard
                  counts={run.regions_count}
                  mode={mapMode}
                  onSelect={(region) => select({ kind: "region", region })}
                  places={places ?? {}}
                  reveal={reveal}
                  selected={
                    selection?.kind === "region" ? selection.region : null
                  }
                  tip={tip}
                />
              ) : (
                <div className={styles.body}>
                  <NoData text="군·구 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                </div>
              )}
            </div>

            <div className={styles.card}>
              <h2>
                연령 구성{" "}
                <span className={styles.r}>
                  <span>{kpi ? `${kpi.age_min}~${kpi.age_max}세` : ""}</span>{" "}
                  <span className={`${styles.lg} ${styles.m}`}>남</span>
                  <span className={`${styles.lg} ${styles.f}`}>여</span>
                </span>
              </h2>
              <div className={styles.body}>
                {ages ? (
                  ages.map((band, index) => (
                    <div
                      className={styles.agerow}
                      key={band.band}
                      {...tip(
                        `${band.band}세 ${band.total}명 — 남 ${band.male}명 · 여 ${band.female}명` +
                          (band.other ? ` · 기타 ${band.other}명` : ""),
                      )}
                    >
                      <div className={styles.lb}>{band.band}세</div>
                      <div className={styles.track}>
                        <div
                          className={`${styles.sex} ${styles.m}`}
                          style={{
                            width: reveal.grown
                              ? `${(band.male / ageMax) * 100}%`
                              : 0,
                            ...reveal.lag(index * 110),
                          }}
                        >
                          {band.male || ""}
                        </div>
                        <div
                          className={`${styles.sex} ${styles.f}`}
                          style={{
                            width: reveal.grown
                              ? `${(band.female / ageMax) * 100}%`
                              : 0,
                            ...reveal.lag(index * 110),
                          }}
                        >
                          {band.female || ""}
                        </div>
                      </div>
                      <div className={styles.n}>{band.total}명</div>
                    </div>
                  ))
                ) : (
                  <NoData text="연령 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                )}
              </div>
            </div>

            <div className={styles.card}>
              <h2>조사 개요</h2>
              <div className={styles.body}>
                {people?.length ? (
                  [
                    ["조사 성격", "도시기본계획에 대한 청년층 의견 수렴"],
                    ["조사 기간", formatDayRange(people)],
                    ["조사 방법", "유스플랜AI를 활용한 1:1 인터뷰"],
                    [
                      "모집 경로",
                      "인천시청 홈페이지 및 SNS를 통한 QR코드 홍보",
                    ],
                  ].map(([label, value]) => (
                    <div className={styles.mrow} key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))
                ) : (
                  <NoData text="조사 개요는 분석을 업데이트하면 표시됩니다." />
                )}
              </div>
            </div>
          </div>

          <div className={`${styles.col} ${styles.m}`}>
            <div className={styles.card}>
              <h2>
                청년 요구 키워드
                {aiChip("keywords")}
              </h2>
              {keywords?.length ? (
                <KeywordBubbleCard
                  keywords={keywords}
                  onClearFilter={() => setSector(null)}
                  onSelect={(keyword) => select({ kind: "keyword", keyword })}
                  reveal={reveal}
                  sector={sector}
                  selected={
                    selection?.kind === "keyword" ? selection.keyword : null
                  }
                  tip={tip}
                />
              ) : (
                <div className={styles.body}>
                  <NoData text="키워드 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                </div>
              )}
            </div>

            <div className={styles.lead}>
              <div className={styles.card}>
                <h2>
                  계획 부문별 요구 <em>건수 · 언급한 사람</em>
                  <Switch
                    onChange={setSortKey}
                    options={SORT_KEYS}
                    value={sortKey}
                  />
                  {aiChip("topics")}
                </h2>
                <div className={`${styles.body} ${styles.list}`}>
                  {sectorRows.length ? (
                    sectorRows.map((row, index) => (
                      <div
                        className={`${styles.sect} ${
                          selection?.kind === "sector" &&
                          selection.sector === row.sector
                            ? styles.on
                            : ""
                        }`}
                        key={row.sector}
                        ref={slide(row.sector)}
                        {...tip(
                          `${row.sector} — 요구 ${row.demands}건, ${kpi?.participants ?? 0}명 중 ${row.people}명이 언급`,
                        )}
                        {...pick({ kind: "sector", sector: row.sector })}
                      >
                        <div className={styles.lb}>{row.sector}</div>
                        <div className={styles.track}>
                          <div
                            className={styles.fill}
                            style={{
                              width: reveal.grown
                                ? `${((sortKey === 1 ? row.demands : row.people) / sectorMax) * 100}%`
                                : 0,
                              background: "var(--blue)",
                              ...reveal.lag(index * 90),
                            }}
                          />
                        </div>
                        <div className={styles.n}>
                          <b>{sortKey === 1 ? row.demands : row.people}</b>
                          {sortKey === 1
                            ? `건 · ${row.people}명`
                            : `명 · ${row.demands}건`}
                        </div>
                      </div>
                    ))
                  ) : (
                    <NoData text="계획 부문 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                  )}
                </div>
              </div>

              <div className={styles.side}>
                <div className={styles.card}>
                  <h2>
                    최우선 요구 <em>먼저 이뤄지길 바란 것</em>
                  </h2>
                  <div className={`${styles.body} ${styles.list}`}>
                    {topRows.length ? (
                      topRows.map((row, index) => (
                        <div
                          className={`${styles.sect} ${styles.tight} ${
                            selection?.kind === "top" &&
                            selection.sector === row.sector
                              ? styles.on
                              : ""
                          }`}
                          key={row.sector}
                          {...tip(
                            `${row.sector} — ${row.count}명이 이 부문을 먼저 꼽았습니다`,
                          )}
                          {...pick({ kind: "top", sector: row.sector })}
                        >
                          <div className={styles.lb}>{row.sector}</div>
                          <div className={styles.track}>
                            <div
                              className={styles.fill}
                              style={{
                                width: reveal.grown
                                  ? `${(row.count / topMax) * 100}%`
                                  : 0,
                                background: "var(--blue)",
                                ...reveal.lag(index * 90),
                              }}
                            />
                          </div>
                          <div className={styles.n}>
                            <b>{row.count}</b>명
                          </div>
                        </div>
                      ))
                    ) : (
                      <NoData text="아직 최우선 요구를 고른 참여자가 없습니다." />
                    )}
                  </div>
                </div>

                <div className={styles.card}>
                  <h2>
                    정착 의향{" "}
                    <span className={styles.r}>
                      <span className={`${styles.lg} ${styles.m}`}>인천</span>
                      <span className={`${styles.lg} ${styles.f}`}>타지</span>
                    </span>
                  </h2>
                  <div className={styles.body}>
                    {settlement ? (
                      <>
                        {SETTLEMENT_CARD_FIELDS.map(([field, label], index) => {
                          const counts = settlement[field];
                          const answered = settlement.answered[field];
                          return (
                            <div
                              className={styles.stay}
                              key={field}
                              {...tip(
                                answered
                                  ? `${label} — 인천 ${counts.인천}명 · 타지 ${counts.타지}명 (참여 ${settlement.participants}명 중 ${answered}명이 말함)`
                                  : `${label} — 아직 말한 참여자가 없습니다`,
                              )}
                            >
                              <div className={styles.lb}>{label}</div>
                              <div className={styles.track}>
                                <div
                                  className={`${styles.seg} ${styles.l}`}
                                  style={{
                                    width: reveal.grown
                                      ? `${(counts.인천 / (answered || 1)) * 100}%`
                                      : 0,
                                    ...reveal.lag(index * 120),
                                  }}
                                />
                                <div
                                  className={`${styles.seg} ${styles.r}`}
                                  style={{
                                    width: reveal.grown
                                      ? `${(counts.타지 / (answered || 1)) * 100}%`
                                      : 0,
                                    ...reveal.lag(index * 120),
                                  }}
                                />
                              </div>
                              <div className={styles.n}>
                                {answered ? (
                                  <>
                                    <b>{counts.인천}</b>
                                    {` · ${counts.타지}`}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className={styles.base}>
                          참여 {settlement.participants}명 중 말한 사람 ·{" "}
                          {SETTLEMENT_CARD_FIELDS.map(
                            ([field, label]) =>
                              `${label} ${settlement.answered[field]}명`,
                          ).join(" · ")}
                        </div>
                      </>
                    ) : (
                      <NoData text="정착 의향 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.pair}>
              <div className={styles.card}>
                <h2>
                  연령대별 요구 <em>요구 건수</em>
                  {aiChip("cross")}
                </h2>
                <div
                  className={`${styles.body} ${crossRows.length && cross ? styles.hm : ""}`}
                >
                  {crossRows.length && cross ? (
                    <>
                      <div className={styles.hh} />
                      {AGE_BANDS.map((band) => (
                        <div className={styles.hh} key={band}>
                          {band}세
                        </div>
                      ))}
                      {crossRows.map((row, rowIndex) => (
                        <Fragment key={row.sector}>
                          <div className={styles.rl}>{row.sector}</div>
                          {(cross[row.sector] ?? crossZero).map(
                            (value, index) => (
                              <div
                                className={styles.cell}
                                key={AGE_BANDS[index]}
                                style={{
                                  background: !reveal.grown
                                    ? "#fff"
                                    : value === 0
                                      ? "#f2f5f7"
                                      : `rgba(0,94,184,${0.12 + (0.78 * value) / crossMax})`,
                                  color: !reveal.grown
                                    ? "transparent"
                                    : value / crossMax > 0.55
                                      ? "#fff"
                                      : "var(--ink2)",
                                  ...reveal.lag((rowIndex + index) * 56),
                                }}
                                {...tip(
                                  `${AGE_BANDS[index]}세가 말한 ${row.sector} 요구 ${value}건`,
                                )}
                                {...pick({
                                  kind: "sector",
                                  sector: row.sector,
                                })}
                              >
                                {value || ""}
                              </div>
                            ),
                          )}
                        </Fragment>
                      ))}
                    </>
                  ) : (
                    <NoData text="교차 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                  )}
                </div>
              </div>

              <div className={styles.card}>
                <h2>
                  도시가치 4축
                  {aiChip("axes")}
                </h2>
                <div className={`${styles.body} ${styles.axes}`}>
                  {run ? (
                    run.axis_stats.map((stat, index) => {
                      const [left, right] = stat.poles;
                      const total = left.count + right.count || 1;
                      return (
                        <div
                          className={`${styles.ax} ${
                            selection?.kind === "axis" &&
                            selection.axis === stat.axis
                              ? styles.on
                              : ""
                          }`}
                          key={stat.axis}
                          {...tip(
                            `${axisTitle(stat.axis)} — 눌러서 극별 요구 경향과 발언 보기`,
                          )}
                          {...pick({ kind: "axis", axis: stat.axis })}
                        >
                          <div className={styles.h}>
                            <b>{axisTitle(stat.axis)}</b>
                            <span>{AXIS_QUESTION[stat.axis]}</span>
                          </div>
                          <div className={styles.bar}>
                            <div
                              className={`${styles.seg} ${styles.l}`}
                              style={{
                                width: reveal.grown
                                  ? `${(left.count / total) * 100}%`
                                  : 0,
                                ...reveal.lag(index * 140),
                              }}
                            >
                              <span className={styles.cap}>
                                {getPoleBadge(stat.axis, left.letter)}{" "}
                                {left.count}명
                              </span>
                            </div>
                            <div
                              className={`${styles.seg} ${styles.r}`}
                              style={{
                                width: reveal.grown
                                  ? `${(right.count / total) * 100}%`
                                  : 0,
                                ...reveal.lag(index * 140),
                              }}
                            >
                              <span className={styles.cap}>
                                {getPoleBadge(stat.axis, right.letter)}{" "}
                                {right.count}명
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <NoData text="축 집계가 아직 없습니다. 분석을 업데이트하면 표시됩니다." />
                  )}
                </div>
              </div>
            </div>
          </div>

          <DetailPanel
            onClear={() => select(null)}
            onSelectPerson={(submissionId) =>
              select({ kind: "person", submissionId })
            }
            run={run}
            selection={selection}
          />
        </div>
      </div>
      <div className={styles.tip} ref={tipRef} />
    </div>
  );
}
