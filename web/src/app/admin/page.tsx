"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { getPoleBadge } from "@/lib/city-axes";
import { getCityType } from "@/lib/city-types";
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
  SECTIONS,
  axisTitle,
  buildDemandCsv,
  formatDayRange,
  formatStamp,
  spellCode,
} from "./dashboard-data";
import { DetailPanel, type Selection } from "./detail-panel";
import { IncheonMapCard } from "./incheon-map";
import { CountUp, useReveal, useSlide } from "./motion";
import { useTip } from "./tip";

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

type LoadStatus = "loading" | "ready" | "empty" | "error";

function NoData({ text }: { text: string }) {
  return <div className={styles.nodata}>{text}</div>;
}

export default function Dashboard() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [sortKey, setSortKey] = useState<1 | 2>(1);
  const [updating, setUpdating] = useState(false);
  const [noSubmissions, setNoSubmissions] = useState(false);
  const [scale, setScale] = useState<number | null>(null);

  const knobRef = useRef<HTMLElement>(null);
  const sortRefs = useRef<(HTMLElement | null)[]>([]);
  const knobPlaced = useRef(false);

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

  /* The pill moves to the active option, and its width follows too because the
     two labels differ in length. */
  useEffect(() => {
    const knob = knobRef.current;
    const target = sortRefs.current[sortKey - 1];
    if (!knob || !target) return;

    // Sliding on the very first placement would make loading look unsettled.
    const instant = !knobPlaced.current;
    knobPlaced.current = true;
    if (instant) knob.style.transition = "none";
    knob.style.width = `${target.offsetWidth}px`;
    knob.style.transform = `translateX(${target.offsetLeft}px)`;
    if (instant) {
      requestAnimationFrame(() => {
        knob.style.transition = "";
      });
    }
  }, [sortKey]);

  const pick = (next: Selection) => ({
    onClick: () => setSelection(next),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSelection(next);
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
      setSelection(null);
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
        onClick={() => setSelection({ kind: "ai", card })}
        type="button"
      >
        AI 해석
      </button>
    ) : null;

  const stamp = updating
    ? "자료를 다시 계산하는 중입니다"
    : noSubmissions
      ? "분석할 제출본이 없습니다"
      : status === "loading"
        ? "불러오는 중입니다"
        : status === "error"
          ? "자료를 불러오지 못했습니다"
          : status === "empty" || run === null
            ? "아직 분석을 실행하지 않았습니다"
            : `${formatStamp(run.executed_at)} 기준`;

  const kpi = run?.kpi;
  const ages = run?.ages;
  const topics = run?.topics;
  const cross = run?.cross;
  const people = run?.people;

  const summary: [string, ReactNode, string][] = [
    [
      "참여자수",
      kpi ? <CountUp reveal={reveal} value={kpi.participants} /> : "—",
      kpi ? "명" : "",
    ],
    [
      "수집된 세부 요구",
      kpi ? <CountUp reveal={reveal} value={kpi.demands} /> : "—",
      kpi ? "건" : "",
    ],
    [
      "참여 자치구수",
      kpi ? (
        <>
          <CountUp reveal={reveal} value={kpi.regions} /> / 11
        </>
      ) : (
        "—"
      ),
      kpi ? "곳" : "",
    ],
    ["참여 목적", "2040 인천도시기본계획", ""],
  ];

  const ageMax = Math.max(1, ...(ages ?? []).map((band) => band.total));

  const topicRows = [...(topics ?? [])].sort((left, right) =>
    sortKey === 1 ? right.demands - left.demands : right.people - left.people,
  );
  const topicMax = Math.max(
    1,
    ...topicRows.map((row) => (sortKey === 1 ? row.demands : row.people)),
  );

  const crossMax = Math.max(
    1,
    ...(topics ?? []).flatMap((row) => cross?.[row.topic] ?? []),
  );

  const typeRows = run
    ? Object.entries(run.type_distribution).sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
    : [];
  const typeMax = Math.max(1, ...typeRows.map(([, count]) => count));

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
          <span className={styles.brand}>유스플랜AI</span>
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
          <button
            className={`${styles.btn} ${styles.g}`}
            disabled={!people?.length}
            onClick={download}
            type="button"
          >
            원자료 내려받기
          </button>
          <button
            className={styles.btn}
            disabled={updating}
            onClick={() => void update()}
            type="button"
          >
            {updating ? "업데이트 중" : "자료 업데이트"}
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
                자치구별 참여자수
                {aiChip("map")}
              </h2>
              {run?.regions_count ? (
                <IncheonMapCard
                  counts={run.regions_count}
                  onSelect={(region) =>
                    setSelection({ kind: "region", region })
                  }
                  reveal={reveal}
                  selected={
                    selection?.kind === "region" ? selection.region : null
                  }
                  tip={tip}
                />
              ) : (
                <div className={styles.body}>
                  <NoData text="자치구 집계가 아직 없습니다." />
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
                  <NoData text="연령 집계가 아직 없습니다." />
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
                  <NoData text="조사 개요는 분석을 실행하면 채워집니다." />
                )}
              </div>
            </div>
          </div>

          <div className={`${styles.col} ${styles.m}`}>
            <div className={styles.card}>
              <h2>
                계획 부문별 요구 <em>건수 · 언급한 사람</em>
                <span className={styles.sortsw}>
                  <i className={styles.knob} ref={knobRef} />
                  {([1, 2] as const).map((key, index) => (
                    <b
                      className={sortKey === key ? styles.on : ""}
                      key={key}
                      onClick={() => setSortKey(key)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSortKey(key);
                      }}
                      ref={(node) => {
                        sortRefs.current[index] = node;
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {key === 1 ? "건수순" : "사람수순"}
                    </b>
                  ))}
                </span>
                {aiChip("topics")}
              </h2>
              <div className={styles.body}>
                {topicRows.length ? (
                  topicRows.map((row, index) => (
                    <div
                      className={`${styles.sect} ${
                        selection?.kind === "topic" &&
                        selection.topic === row.topic
                          ? styles.on
                          : ""
                      }`}
                      key={row.topic}
                      ref={slide(row.topic)}
                      {...tip(
                        `${row.topic} (${SECTIONS[row.topic]}) — 요구 ${row.demands}건, ${kpi?.participants ?? 0}명 중 ${row.people}명이 언급`,
                      )}
                      {...pick({ kind: "topic", topic: row.topic })}
                    >
                      <div className={styles.lb}>{row.topic}</div>
                      <div className={styles.track}>
                        <div
                          className={styles.fill}
                          style={{
                            width: reveal.grown
                              ? `${((sortKey === 1 ? row.demands : row.people) / topicMax) * 100}%`
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
                  <NoData text="계획 부문 집계가 아직 없습니다." />
                )}
              </div>
            </div>

            <div className={styles.card}>
              <h2>
                도시가치 4축
                {aiChip("axes")}
              </h2>
              <div className={styles.body}>
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
                  <NoData text="축 집계가 아직 없습니다." />
                )}
              </div>
            </div>

            <div className={styles.pair}>
              <div className={styles.card}>
                <h2>
                  연령대별 요구사항 <em>요구 건수</em>
                  {aiChip("cross")}
                </h2>
                <div
                  className={`${styles.body} ${topics && cross ? styles.hm : ""}`}
                >
                  {topics && cross ? (
                    <>
                      <div className={styles.hh} />
                      {AGE_BANDS.map((band) => (
                        <div className={styles.hh} key={band}>
                          {band}세
                        </div>
                      ))}
                      {topics.map((row, rowIndex) => (
                        <Fragment key={row.topic}>
                          <div className={styles.rl}>{row.topic}</div>
                          {(cross[row.topic] ?? []).map((value, index) => (
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
                                `${AGE_BANDS[index]}세가 말한 ${row.topic} 요구 ${value}건`,
                              )}
                              {...pick({ kind: "topic", topic: row.topic })}
                            >
                              {value || ""}
                            </div>
                          ))}
                        </Fragment>
                      ))}
                    </>
                  ) : (
                    <NoData text="교차 집계가 아직 없습니다." />
                  )}
                </div>
              </div>

              <div className={styles.card}>
                <h2>
                  내가 바라는 도시유형 <em>4축 조합 · 인원</em>
                  {aiChip("types")}
                </h2>
                <div className={`${styles.body} ${styles.types}`}>
                  {typeRows.length ? (
                    typeRows.map(([code, count], index) => (
                      <div
                        className={`${styles.ty} ${
                          selection?.kind === "type" && selection.code === code
                            ? styles.on
                            : ""
                        }`}
                        key={code}
                        {...tip(
                          `${getCityType(code).nickname} — ${spellCode(code)}`,
                        )}
                        {...pick({ kind: "type", code })}
                      >
                        <code>{code}</code>
                        <div className={styles.nm}>
                          {getCityType(code).nickname}
                        </div>
                        <div className={styles.ax4}>{spellCode(code)}</div>
                        <div className={styles.track}>
                          <div
                            className={styles.fill}
                            style={{
                              width: reveal.grown
                                ? `${(count / typeMax) * 100}%`
                                : 0,
                              background: "var(--blue)",
                              /* The list is as long as the sample, so the
                                 stagger stops before the intro runs out. */
                              ...reveal.lag(Math.min(index, 10) * 90),
                            }}
                          />
                        </div>
                        <div className={styles.n}>{count}명</div>
                      </div>
                    ))
                  ) : (
                    <NoData text="유형 집계가 아직 없습니다." />
                  )}
                </div>
              </div>
            </div>
          </div>

          <DetailPanel
            onClear={() => setSelection(null)}
            onSelectPerson={(submissionId) =>
              setSelection({ kind: "person", submissionId })
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
