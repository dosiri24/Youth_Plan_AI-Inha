"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { getLatestAnalysis, type AnalysisRun } from "@/lib/api";

import { buildDemandCsv, formatDayRange, formatStamp } from "../dashboard-data";
import { Band, CountUp } from "./report-motion";
import { QuoteLayer } from "./quote-layer";
import { VoiceScrolly } from "./report-voices";
import styles from "./report.module.css";
import {
  AxisSection,
  CrossSection,
  FindingsSection,
  Head,
  ImplicationSection,
  MethodSection,
  QuoteText,
  Rich,
  TensionSection,
  TopicSection,
  TypeSection,
} from "./sections";
import tokens from "./tokens.module.css";

type LoadStatus = "loading" | "ready" | "empty" | "error";

export default function Report() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [layerOpen, setLayerOpen] = useState(false);

  const layerButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void getLatestAnalysis()
      .then((latest) => {
        setRun(latest);
        setStatus(latest === null ? "empty" : "ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status !== "ready" || run === null) {
    return (
      <div className={`${tokens.tokens} ${styles.root}`}>
        <div className={styles.hold}>
          <p>
            {status === "loading"
              ? "브리핑을 불러오는 중입니다."
              : status === "error"
                ? "브리핑을 불러오지 못했습니다."
                : "아직 분석을 실행하지 않았습니다. 대시보드에서 자료 업데이트를 누르면 이 문서가 만들어집니다."}
          </p>
          <Link
            className={`${styles.button} ${styles.buttonghost}`}
            href="/admin"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const briefing = run.briefing;
  const people = run.people ?? [];
  const quotes = run.quotes ?? [];
  const kpi = run.kpi;
  const participants = kpi?.participants ?? people.length;

  const download = () => {
    if (people.length === 0) return;

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

  /* Closing the layer must put the reader back where they left the document. */
  const closeLayer = () => {
    setLayerOpen(false);
    layerButton.current?.focus();
  };

  const figures: [string, ReactNode][] = [
    [
      "참여자",
      <>
        <CountUp value={kpi?.participants ?? people.length} />명
      </>,
    ],
    [
      "수집된 요구",
      kpi ? (
        <>
          <CountUp value={kpi.demands} />건
        </>
      ) : (
        "—"
      ),
    ],
    [
      "참여 자치구",
      kpi ? (
        <>
          <CountUp value={kpi.regions} /> / 11곳
        </>
      ) : (
        "—"
      ),
    ],
    ["조사 기간", people.length ? formatDayRange(people) : "—"],
  ];

  return (
    <div className={`${tokens.tokens} ${styles.root}`}>
      <a className={styles.skip} href="#report-body">
        본문으로 건너뛰기
      </a>

      {/* The skip link has to move focus, not only the scroll position. */}
      <main id="report-body" tabIndex={-1}>
        {!briefing && (
          <div className={styles.wide}>
            <p className={styles.notice}>
              이번 실행은 AI 서술을 생성하지 못했습니다. 수치와 고정 설명만
              보여줍니다. 대시보드에서 자료 업데이트를 다시 실행하면 서술이
              채워집니다.
            </p>
          </div>
        )}

        <Band>
          <div className={styles.read}>
            <p className={styles.eyebrow}>유스플랜AI 종합 브리핑</p>
            <h1>청년이 바라는 2040년 인천</h1>
            <p className={styles.sub}>
              2040 인천도시기본계획을 위한 청년 의견 수렴 결과
            </p>
            <p className={styles.stamp}>
              {formatStamp(run.executed_at)} 기준 분석
            </p>
          </div>

          <div className={styles.wide}>
            <dl className={styles.figures}>
              {figures.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The sequence carries no heading of its own. One placed above it sat a
              screen and a half from the map it named, because the map is sticky
              and centres itself in the viewport; and it was the only unnumbered
              h2 in the document. The map's own title, legend and caption say what
              it is. */}

          {people.length ? (
            <>
              <VoiceScrolly
                onSelect={setPicked}
                people={people}
                picked={picked}
                quotes={quotes}
                skipTo="#briefing-findings"
              />
              <div className={styles.wide}>
                <p className={styles.caption}>
                  점 하나는 참여자 한 명입니다. 자치구 안의 점 위치는 제출본
                  ID로 정해지므로 자료를 업데이트해도 기존 점은 움직이지
                  않습니다. 이 지도는 참여가 어디에 몰렸는지만 보여주며 자치구
                  사이의 요구 성향을 비교하지 않습니다.
                </p>
                <p className={styles.caption}>
                  점 색은 지금 인용된 발언의 축으로 참여자 {participants}명
                  전원을 다시 나눈 것이고, 증거가 없는 축은 기본 극에 넣어
                  셉니다. 04절 &lsquo;어떤 도시를 바라나&rsquo;는 그 축에 증거가
                  있는 참여자만 세므로 같은 극이라도 인원이 더 적습니다. 두
                  숫자가 다른 것은 세는 대상이 다르기 때문입니다.
                </p>
              </div>
            </>
          ) : (
            <div className={styles.wide}>
              <p className={styles.missing}>
                참여자 목록이 아직 없어 지도를 그릴 수 없습니다.
              </p>
            </div>
          )}

          <div className={styles.read}>
            {briefing?.headline ? (
              <>
                <Rich className={styles.headline} html={briefing.headline} />
                <p className={styles.caption}>
                  AI가 이번 분석 결과를 읽고 쓴 한 문장입니다.
                </p>
              </>
            ) : (
              <p className={styles.missing}>AI 서술 없음</p>
            )}
          </div>
        </Band>

        <FindingsSection findings={briefing?.findings} id="briefing-findings" />

        <MethodSection sample={briefing?.sample} />

        <TopicSection
          lead={briefing?.leads.topics}
          participants={participants}
          quotes={quotes}
          read={briefing?.reads.topics}
          topics={run.topics}
        />

        <AxisSection
          lead={briefing?.leads.axes}
          read={briefing?.reads.axes}
          stats={run.axis_stats}
          summaries={run.axis_summaries}
        />

        <TensionSection tensions={briefing?.tensions} />

        <CrossSection
          ages={run.ages}
          cross={run.cross}
          lead={briefing?.leads.cross}
          participants={participants}
          read={briefing?.reads.cross}
          topics={run.topics}
        />

        <TypeSection
          distribution={run.type_distribution}
          lead={briefing?.leads.types}
          participants={participants}
          read={briefing?.reads.types}
        />

        <ImplicationSection implications={briefing?.implications} />

        <Band>
          <div className={styles.read}>
            <Head n="09" title="청년들의 목소리" />
            <p className={styles.serif}>
              이번 실행에는 비식별 인용 {quotes.length}건이 있습니다. 축, 계획
              부문, 자치구, 연령대로 걸러 전수를 살펴볼 수 있습니다.
            </p>
            <button
              className={styles.button}
              disabled={quotes.length === 0}
              onClick={() => setLayerOpen(true)}
              ref={layerButton}
              type="button"
            >
              인용 전수 살펴보기
            </button>
            {quotes.length === 0 && (
              <p className={styles.missing}>
                이번 실행에는 비식별 인용이 없어 탐색할 수 없습니다. 비식별
                사본이 있는 제출본에서만 인용을 모으기 때문입니다.
              </p>
            )}
            {quotes.slice(0, 3).map((quote) => (
              <QuoteText key={quote.quote_id} quote={quote} />
            ))}
          </div>
        </Band>

        <Band>
          <div className={styles.read}>
            <Head n="10" title="자료" />
            <button
              className={styles.button}
              disabled={people.length === 0}
              onClick={download}
              type="button"
            >
              원자료 CSV 내려받기
            </button>
            <dl className={styles.meta}>
              <div>
                <dt>분석 실행 시각</dt>
                <dd>{formatStamp(run.executed_at)}</dd>
              </div>
              <div>
                <dt>실행 ID</dt>
                <dd>{run.run_id}</dd>
              </div>
              <div>
                <dt>집계에 들어간 제출본</dt>
                <dd>{run.input_submission_ids.length}건</dd>
              </div>
            </dl>
            <p className={styles.serif}>
              이 문서에서 말하는 참여자 {participants}명은 분석을 실행한 시점에
              저장되어 있던 제출본 수입니다. 축별 집계의 인원은 그 축에 증거가
              있는 참여자만 센 값이므로 참여자 수보다 적을 수 있습니다. 어떤
              수치도 백분율로 쓰지 않고 모수와 인원으로 적었습니다.
            </p>
            <p className={styles.serif}>
              표지 문장, 핵심 정리, 표본 서술, 각 섹션의 리드문과 해석, 엇갈리는
              요구, 확인이 필요한 것은 AI가 이번 집계를 읽고 쓴 문장입니다.
              외부에 인용하기 전에 옆의 수치를 직접 확인하시기 바랍니다. 고정
              설명과 4축 정의는 AI가 쓰지 않습니다.
            </p>
            <Link
              className={`${styles.button} ${styles.buttonghost}`}
              href="/admin"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </Band>
      </main>

      {layerOpen && <QuoteLayer onClose={closeLayer} quotes={quotes} />}
    </div>
  );
}
