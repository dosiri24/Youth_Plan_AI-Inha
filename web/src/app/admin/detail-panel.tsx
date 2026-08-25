"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import adminGuide from "@/data/admin_guide.json";
import { getPoleBadge } from "@/lib/city-axes";
import { getCityType } from "@/lib/city-types";
import type {
  AiNoteCard,
  AnalysisRun,
  AxisName,
  DashboardPerson,
} from "@/lib/api";

import styles from "./dashboard.module.css";
import {
  AI_CARD_TITLES,
  axisTitle,
  AXIS_QUESTION,
  regionLabel,
  sectorLabel,
} from "./dashboard-data";

type AdminGuide = {
  axes: {
    axis: AxisName;
    display: string;
    title: string;
    measures: string;
    lineage: string;
    poles: { letter: string; name: string; description: string }[];
  }[];
  excluded_axis: { display: string; title: string; reason: string };
};

const GUIDE = adminGuide as AdminGuide;

export type Selection =
  | { kind: "sector"; sector: string }
  | { kind: "top"; sector: string }
  | { kind: "axis"; axis: AxisName }
  | { kind: "region"; region: string }
  | { kind: "keyword"; keyword: string }
  | { kind: "person"; submissionId: string }
  | { kind: "ai"; card: AiNoteCard };

type View = { label: string; title: string; sub: string; body: ReactNode };

type Props = {
  selection: Selection | null;
  run: AnalysisRun | null;
  onClear: () => void;
  onSelectPerson: (submissionId: string) => void;
};

/** A demand carries one sector, so the only thing left to badge is its sub-sector. */
function Pill({ label }: { label: string }) {
  return label ? <span className={styles.pill}>{label}</span> : null;
}

/* Inside a chapter panel the sub-sector badge repeats down the whole list, so the
   keywords ride beside it to carry what actually differs from row to row. They stay
   bare text: a second filled badge would compete with the classification for the eye. */
function Tags({ keywords }: { keywords: string[] }) {
  return keywords.length ? (
    <span className={styles.tags}>
      {keywords.map((keyword) => `#${keyword}`).join(" ")}
    </span>
  ) : null;
}

function sectorView(run: AnalysisRun, sector: string): View {
  const people = run.people ?? [];
  const stat = run.sectors?.find((item) => item.sector === sector);
  const items = people.flatMap((person) =>
    person.demands
      .filter((demand) => demand.sector === sector)
      .map((demand) => ({ person, demand })),
  );

  return {
    label: "계획 부문",
    title: sector,
    sub: `요구 ${stat?.demands ?? 0}건 · ${run.kpi?.participants ?? 0}명 중 ${
      stat?.people ?? 0
    }명이 언급`,
    body: (
      <>
        <h4>이 부문으로 들어온 요구</h4>
        {items.length === 0 ? (
          <div className={styles.li}>이 부문으로 들어온 요구가 없습니다.</div>
        ) : (
          items.map(({ person, demand }, index) => (
            <div className={styles.li} key={`${person.submission_id}-${index}`}>
              {demand.title}
              <div className={styles.m}>
                {regionLabel(person.region)} · {person.age}세{" "}
                <Pill label={demand.subsector} />
                <Tags keywords={demand.keywords} />
              </div>
            </div>
          ))
        )}
      </>
    ),
  };
}

function topDemandView(run: AnalysisRun, sector: string): View {
  const items = (run.top_demands?.items ?? []).filter(
    (item) => item.sector === sector,
  );

  return {
    label: "최우선 요구",
    title: sector,
    sub: `이 부문을 먼저 꼽은 참여자 ${items.length}명`,
    body: (
      <>
        <h4>참여자가 하나만 고른다면</h4>
        {items.map((item) => (
          <div className={styles.li} key={item.submission_id}>
            {item.title}
            {item.reason.map((sentence, index) => (
              <div className={styles.m} key={index}>
                {sentence}
              </div>
            ))}
            <div className={styles.m}>
              <Pill label={item.subsector} />
              <Tags keywords={item.keywords} />
            </div>
          </div>
        ))}
      </>
    ),
  };
}

function axisView(run: AnalysisRun, axis: AxisName): View {
  const stat = run.axis_stats.find((item) => item.axis === axis);
  const summary = run.axis_summaries.find((item) => item.axis === axis);
  const guide = GUIDE.axes.find((item) => item.axis === axis)!;

  return {
    label: "도시가치 축",
    title: axisTitle(axis),
    sub: AXIS_QUESTION[axis],
    body: (
      <>
        <h4>수치</h4>
        <table>
          <tbody>
            <tr>
              <th>극</th>
              <th style={{ textAlign: "right" }}>인원</th>
            </tr>
            {stat?.poles.map((pole) => (
              <tr key={pole.letter}>
                <td>{getPoleBadge(axis, pole.letter)}</td>
                <td className={styles.num}>{pole.count}명</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>이 축이 재는 것</h4>
        <div className={styles.li}>{guide.measures}</div>

        {summary?.poles.map((pole) => (
          <div key={pole.letter}>
            <h4>{getPoleBadge(axis, pole.letter)} 쪽 요구 경향</h4>
            {pole.sentences.length === 0 ? (
              <div className={styles.li}>
                이 극으로 판정된 참여자가 없습니다.
              </div>
            ) : (
              pole.sentences.map((sentence, index) => (
                <div className={styles.li} key={index}>
                  {sentence}
                </div>
              ))
            )}
          </div>
        ))}

        <h4>청년들이 실제로 한 말</h4>
        {summary?.quotes.map((quote) => (
          <div className={styles.q} key={quote.quote_id}>
            “{quote.text}”
          </div>
        ))}

        <h4>극이 뜻하는 것</h4>
        {guide.poles.map((pole) => (
          <div className={styles.li} key={pole.letter}>
            <b>{pole.name}</b> {pole.description}
          </div>
        ))}
      </>
    ),
  };
}

function regionView(
  run: AnalysisRun,
  region: string,
  onSelectPerson: (submissionId: string) => void,
): View {
  const people = (run.people ?? []).filter(
    (person) => person.region === region,
  );

  return {
    label: "군·구",
    title: region,
    sub: people.length ? `${people.length}명 참여` : "아직 참여자가 없습니다",
    body: people.length ? (
      <>
        <table>
          <thead>
            <tr>
              <th>별명</th>
              <th>나이</th>
              <th>도시유형</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr
                key={person.submission_id}
                onClick={() => onSelectPerson(person.submission_id)}
              >
                <td>{person.nickname}</td>
                <td className={styles.num}>{person.age}</td>
                <td>{getCityType(person.code).nickname}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>이 지역에서 나온 요구</h4>
        {people.flatMap((person) =>
          person.demands.map((demand, index) => (
            <div className={styles.li} key={`${person.submission_id}-${index}`}>
              {demand.title}
              <div className={styles.m}>
                {person.nickname} ·{" "}
                <Pill label={sectorLabel(demand.sector, demand.subsector)} />
              </div>
            </div>
          )),
        )}
      </>
    ) : (
      <div className={styles.note}>이 군·구에서는 아직 참여자가 없습니다.</div>
    ),
  };
}

function keywordView(run: AnalysisRun, keyword: string): View {
  const stat = run.keywords?.find((item) => item.keyword === keyword);
  const items = (run.people ?? []).flatMap((person) =>
    person.demands
      .filter((demand) => demand.keywords.includes(keyword))
      .map((demand) => ({ person, demand })),
  );

  return {
    label: "요구 키워드",
    title: keyword,
    sub: `${run.kpi?.participants ?? 0}명 중 ${stat?.people ?? 0}명이 말함 · ${
      stat?.sector ?? ""
    }`,
    body: (
      <>
        <h4>이 키워드가 붙은 요구 {items.length}건</h4>
        {items.length === 0 ? (
          <div className={styles.li}>이 키워드가 붙은 요구가 없습니다.</div>
        ) : (
          items.map(({ person, demand }, index) => (
            <div className={styles.li} key={`${person.submission_id}-${index}`}>
              {demand.title}
              <div className={styles.m}>
                {regionLabel(person.region)} · {person.age}세{" "}
                <Pill label={sectorLabel(demand.sector, demand.subsector)} />
              </div>
            </div>
          ))
        )}
      </>
    ),
  };
}

function personView(person: DashboardPerson): View {
  return {
    label: "참여자",
    title: person.nickname,
    sub: `${regionLabel(person.region)} · ${person.age}세 · ${
      getCityType(person.code).nickname
    }`,
    body: (
      <>
        <h4>인터뷰 요약</h4>
        <div className={styles.li}>{person.summary}</div>
        <h4>축별 판정 이유</h4>
        {person.reasons.map((reason) => (
          <div className={styles.li} key={reason.axis}>
            {reason.reason}
            <div className={styles.m}>{axisTitle(reason.axis)}</div>
          </div>
        ))}
        <h4>이 참여자의 요구 {person.demands.length}건</h4>
        {person.demands.length === 0 ? (
          <div className={styles.li}>
            표시할 요구가 없습니다. 분석을 업데이트한 뒤 다시 확인해 주세요.
          </div>
        ) : (
          person.demands.map((demand, index) => (
            <div className={styles.li} key={index}>
              {demand.title}
              <div className={styles.m}>
                <Pill label={sectorLabel(demand.sector, demand.subsector)} />
              </div>
            </div>
          ))
        )}
        <Link
          className={styles.bk}
          href={`/admin/submissions/${person.submission_id}`}
          style={{ marginTop: 14 }}
        >
          제출본 상세와 원본 대화록 보기
        </Link>
      </>
    ),
  };
}

function aiView(run: AnalysisRun, card: AiNoteCard): View {
  return {
    label: "AI 해석",
    title: AI_CARD_TITLES[card],
    sub: "이 카드의 수치가 무엇을 시사하는가",
    body: (
      <>
        {/* briefing.md contracts <b> emphasis inside each note, so the tags render. */}
        <div
          className={styles.aiRead}
          dangerouslySetInnerHTML={{ __html: run.ai_notes?.[card] ?? "" }}
        />
        <div className={styles.note} style={{ marginTop: 14 }}>
          AI가 이번 분석 결과를 읽고 쓴 문장입니다. 보고자료에 인용하기 전 왼쪽
          수치와 대조해 주세요.
        </div>
      </>
    ),
  };
}

function buildView(
  run: AnalysisRun,
  selection: Selection,
  onSelectPerson: (submissionId: string) => void,
): View | null {
  switch (selection.kind) {
    case "sector":
      return sectorView(run, selection.sector);
    case "top":
      return topDemandView(run, selection.sector);
    case "axis":
      return axisView(run, selection.axis);
    case "region":
      return regionView(run, selection.region, onSelectPerson);
    case "keyword":
      return keywordView(run, selection.keyword);
    case "ai":
      return aiView(run, selection.card);
    case "person": {
      const person = (run.people ?? []).find(
        (item) => item.submission_id === selection.submissionId,
      );
      return person ? personView(person) : null;
    }
  }
}

/** This panel expands whatever was picked on the left, and stays blank until one is. */
export function DetailPanel({
  selection,
  run,
  onClear,
  onSelectPerson,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const view =
    run && selection ? buildView(run, selection, onSelectPerson) : null;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [selection]);

  return (
    <div className={`${styles.ctx} ${view ? "" : styles.empty}`}>
      <header>
        <button className={styles.bk} onClick={onClear} type="button">
          ← 뒤로
        </button>
        <div className={styles.k}>{view?.label}</div>
        <h3>{view?.title}</h3>
        <p>{view?.sub}</p>
      </header>
      <div className={styles.c} ref={bodyRef}>
        {view?.body}
      </div>
      <div className={styles.blank}>
        <b>상세 보기</b>
        <span>자세히 보고 싶은 항목을 선택하세요</span>
      </div>
    </div>
  );
}
