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
  SECTIONS,
  axisTitle,
  AXIS_QUESTION,
  regionLabel,
  spellCode,
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
  | { kind: "topic"; topic: string }
  | { kind: "axis"; axis: AxisName }
  | { kind: "region"; region: string }
  | { kind: "type"; code: string }
  | { kind: "person"; submissionId: string }
  | { kind: "ai"; card: AiNoteCard };

type View = { label: string; title: string; sub: string; body: ReactNode };

type Props = {
  selection: Selection | null;
  run: AnalysisRun | null;
  onClear: () => void;
  onSelectPerson: (submissionId: string) => void;
};

function Pills({ topics }: { topics: string[] }) {
  return (
    <>
      {topics.map((topic) => (
        <span className={styles.pill} key={topic}>
          {topic}
        </span>
      ))}
    </>
  );
}

function topicView(run: AnalysisRun, topic: string): View {
  const people = run.people ?? [];
  const stat = run.topics?.find((item) => item.topic === topic);
  const items = people.flatMap((person) =>
    person.demands
      .filter((demand) => demand.topics.includes(topic))
      .map((demand) => ({ person, demand })),
  );

  return {
    label: "계획 부문",
    title: `${topic} · ${SECTIONS[topic]}`,
    sub: `요구 ${stat?.demands ?? 0}건 · ${run.kpi?.participants ?? 0}명 중 ${
      stat?.people ?? 0
    }명이 언급`,
    body: (
      <>
        <h4>이 부문으로 들어온 요구</h4>
        <div
          className={styles.li}
          style={{ color: "#b4520a", fontWeight: 700 }}
        >
          언급 장소 확보 0건 — 요구별 장소 추출은 다음 단계입니다
        </div>
        {items.map(({ person, demand }, index) => (
          <div className={styles.li} key={`${person.submission_id}-${index}`}>
            {demand.title}
            <div className={styles.m}>
              {regionLabel(person.region)} · {person.age}세{" "}
              <Pills topics={demand.topics.filter((item) => item !== topic)} />
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

        <h4>축 계보</h4>
        <div className={styles.li}>{guide.lineage}</div>

        <div className={styles.note} style={{ marginTop: 14 }}>
          <b>
            {GUIDE.excluded_axis.display} · {GUIDE.excluded_axis.title}
          </b>{" "}
          — {GUIDE.excluded_axis.reason}
        </div>
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
                {person.nickname} · <Pills topics={demand.topics} />
              </div>
            </div>
          )),
        )}
      </>
    ) : (
      <div className={styles.note}>
        이 군·구에서는 아직 참여자가 없습니다. 홍보를 어디에 더 해야 하는지
        판단하는 근거로 씁니다.
      </div>
    ),
  };
}

function typeView(run: AnalysisRun, code: string): View {
  const people = (run.people ?? []).filter((person) => person.code === code);
  const type = getCityType(code);

  return {
    label: "내가 바라는 도시유형",
    title: type.nickname,
    sub: `${spellCode(code)} · ${run.type_distribution[code] ?? 0}명`,
    body: (
      <>
        <h4>이 유형의 뜻</h4>
        <div className={styles.li}>{type.description}</div>
        <h4>이 유형으로 나온 사람</h4>
        {people.map((person) => (
          <div className={styles.li} key={person.submission_id}>
            {person.summary}
            <div className={styles.m}>
              {person.nickname} · {regionLabel(person.region)} · {person.age}세
            </div>
          </div>
        ))}
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
        <h4>이 사람이 낸 요구 {person.demands.length}건</h4>
        {person.demands.length === 0 ? (
          <div className={styles.li}>
            비식별본이 아직 없어 요구를 표시할 수 없습니다.
          </div>
        ) : (
          person.demands.map((demand, index) => (
            <div className={styles.li} key={index}>
              {demand.title}
              <div className={styles.m}>
                <Pills topics={demand.topics} />
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
          AI가 이번 분석 결과와 축 해설을 함께 읽고 쓴 문장입니다. 그대로 복사해
          보고자료에 쓸 수 있습니다. 판단의 근거는 왼쪽 수치이며, 인용 전에
          수치를 함께 확인하십시오.
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
    case "topic":
      return topicView(run, selection.topic);
    case "axis":
      return axisView(run, selection.axis);
    case "region":
      return regionView(run, selection.region, onSelectPerson);
    case "type":
      return typeView(run, selection.code);
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
