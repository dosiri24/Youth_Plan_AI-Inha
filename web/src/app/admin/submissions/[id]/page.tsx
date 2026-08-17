"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Collapsible } from "@base-ui/react/collapsible";

import {
  AXIS_INFO,
  getDisplayStrength,
  getPoleLabel,
  isSinglePole,
} from "@/lib/city-axes";
import { formatDateTime } from "@/lib/format";
import {
  getSubmission,
  type AxisDemandFull,
  type AxisReason,
  type AxisResultFull,
  type SelfInfo,
  type SubmissionDetail,
  type TranscriptMessage,
} from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; detail: SubmissionDetail };

function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="text-[12px] font-bold text-primary">{label}</p>
      <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
    </div>
  );
}

/** Both pole scores stay visible so the winning letter is auditable. */
function TypeResultCard({ axis }: { axis: AxisResultFull }) {
  const info = AXIS_INFO[axis.axis];
  const poles = [info.left, info.right];
  const singlePole = isSinglePole(axis.strength);

  return (
    <article className="rounded-2xl bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-muted-foreground">
            {info.title}
          </p>
          <h3 className="mt-1 text-[17px] font-bold">
            {axis.letter} · {getPoleLabel(axis.axis, axis.letter)}
          </h3>
        </div>
        <span className="shrink-0 text-[15px] font-bold text-primary">
          {axis.empty_axis
            ? "강도 없음"
            : `강도 ${getDisplayStrength(axis.strength)}`}
        </span>
      </div>

      {axis.empty_axis && (
        <p className="mt-3 rounded-xl bg-muted px-3.5 py-2.5 text-[12px] leading-5 text-muted-foreground">
          <span className="font-bold text-incheon-gray">증거 0건</span> · 이
          축을 판단할 발화가 없어 기본 극 {axis.letter}로 채운 값입니다. 저장된
          강도 51은 계산 결과가 아니므로 집계에서도 제외됩니다.
        </p>
      )}

      {singlePole && (
        <p className="mt-3 rounded-xl bg-muted px-3.5 py-2.5 text-[12px] leading-5 text-muted-foreground">
          <span className="font-bold text-incheon-gray">단극 관측</span> · 반대
          극 증거가 0건이라 계산 강도는 100입니다. 단정적으로 읽히지 않도록 표시
          강도는 {getDisplayStrength(axis.strength)}까지만 보여 줍니다.
        </p>
      )}

      <dl className="mt-4 flex gap-2">
        {poles.map((pole) => (
          <div
            key={pole.letter}
            className={`flex-1 rounded-xl px-3 py-2.5 ${
              pole.letter === axis.letter
                ? "bg-secondary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <dt className="text-[12px] font-semibold">{pole.letter}</dt>
            <dd className="mt-0.5 text-[18px] font-bold">
              {axis.scores[pole.letter] ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      {axis.evidence.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          증거가 없어 기본 극으로 판정했습니다.
        </p>
      ) : (
        <Collapsible.Root className="mt-4">
          <Collapsible.Trigger className="group/ev inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none">
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[panel-open]/ev:rotate-180"
            />
            증거 {axis.evidence.length}건 펼쳐 보기
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <ul className="mt-3 space-y-2">
              {axis.evidence.map((item, index) => (
                <li
                  key={`${item.turn}-${index}`}
                  className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] leading-6"
                >
                  <span className="mr-2 font-mono text-[11px] font-bold text-primary">
                    {item.pole} +{item.weight} · {item.turn}턴
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </article>
  );
}

function AxisReasonRow({ reason }: { reason: AxisReason }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <p className="text-[13px] font-bold">
        {AXIS_INFO[reason.axis].title} · {reason.letter}
      </p>
      <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
        {reason.reason}
      </p>
    </div>
  );
}

/** Demands carry their source quotes here since the admin copy keeps them. */
function DemandBlock({ axisDemand }: { axisDemand: AxisDemandFull }) {
  return (
    <article className="rounded-2xl bg-card p-5">
      <p className="text-[12px] font-bold text-muted-foreground">
        {AXIS_INFO[axisDemand.axis].title}
      </p>
      <h3 className="mt-1 text-[16px] font-bold">
        {axisDemand.letter} · {getPoleLabel(axisDemand.axis, axisDemand.letter)}
      </h3>

      <div className="mt-4 space-y-5">
        {axisDemand.demands.map((demand) => (
          <div key={demand.id}>
            <h4 className="text-[15px] font-bold">{demand.title}</h4>
            <ul className="mt-2.5 space-y-1.5">
              {demand.description.map((sentence, index) => (
                <li
                  key={`${demand.id}-${index}`}
                  className="flex gap-2.5 text-[14px] leading-6"
                >
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-incheon-green" />
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1.5">
              {demand.quotes.map((quote, index) => (
                <li
                  key={`${demand.id}-q${index}`}
                  className="rounded-xl bg-muted px-3.5 py-2 text-[13px] leading-6 text-muted-foreground"
                >
                  <span className="mr-2 font-mono text-[11px] font-bold text-primary">
                    {quote.turn}턴
                  </span>
                  {quote.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

function TranscriptRow({ message }: { message: TranscriptMessage }) {
  const isUser = message.role === "user";

  return (
    <div className="flex gap-4 border-b border-border py-3 last:border-b-0">
      <span
        className={`shrink-0 text-[12px] font-bold ${
          isUser ? "text-primary" : "text-incheon-green"
        }`}
      >
        {message.turn}턴 · {isUser ? "참여자" : "AI"}
      </span>
      <p className="text-[14px] leading-6 whitespace-pre-wrap">
        {message.text}
      </p>
    </div>
  );
}

export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    void getSubmission(id)
      .then((detail) =>
        setState(
          detail === null ? { status: "missing" } : { status: "ready", detail },
        ),
      )
      .catch(() => setState({ status: "error" }));
  }, [id]);

  return (
    <div>
      <Link
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        href="/admin/submissions"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        제출본 목록
      </Link>

      {state.status === "loading" && (
        <p className="mt-6 rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          불러오는 중입니다.
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-6 rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          제출본을 불러오지 못했습니다.
        </p>
      )}
      {state.status === "missing" && (
        <p className="mt-6 rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          존재하지 않는 제출본입니다. 목록에서 다시 선택해 주세요.
        </p>
      )}
      {state.status === "ready" && <SubmissionBody detail={state.detail} />}
    </div>
  );
}

/** "기타" also holds participants who declined to say, so it is never read as missing data. */
const GENDER_LABEL: Record<SelfInfo["gender"], string> = {
  male: "남자",
  female: "여자",
  other: "기타",
};

function SubmissionBody({ detail }: { detail: SubmissionDetail }) {
  const { self_info, type_result, report, raw_transcript } = detail;

  return (
    <div className="mt-6 space-y-12">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            {self_info.nickname}
          </h1>
          <span className="rounded-md bg-secondary px-2.5 py-1 font-mono text-[14px] font-bold tracking-wider text-primary">
            {type_result.code}
          </span>
        </div>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {self_info.normalized_region || self_info.raw_region} · 2040년{" "}
          {self_info.age_2040}세 · {GENDER_LABEL[self_info.gender]} ·{" "}
          {self_info.dream_or_job} · {formatDateTime(detail.submitted_at)}
        </p>
      </header>

      <section className="space-y-4">
        <SectionTitle label="개인 보고서" title="요약과 판정 이유" />
        <div className="rounded-2xl bg-card p-5">
          <h3 className="text-[15px] font-bold">인터뷰 요약</h3>
          <ul className="mt-3 space-y-2">
            {report.summary.map((sentence, index) => (
              <li key={index} className="flex gap-2.5 text-[14px] leading-6">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{sentence}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-card px-5">
          {report.axis_reasons.map((reason) => (
            <AxisReasonRow key={reason.axis} reason={reason} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle label="개인 보고서" title="축별 요구와 근거 발화" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {report.axis_demands.map((axisDemand) => (
            <DemandBlock axisDemand={axisDemand} key={axisDemand.axis} />
          ))}
        </div>
      </section>

      {report.participation_notes.length > 0 && (
        <section className="space-y-4">
          <SectionTitle label="개인 보고서" title="조사 신뢰와 참여 조건" />
          <ul className="space-y-2 rounded-2xl bg-card p-5">
            {report.participation_notes.map((note) => (
              <li
                key={`${note.turn}-${note.text}`}
                className="text-[14px] leading-6"
              >
                <span className="mr-2 font-mono text-[12px] text-muted-foreground">
                  턴 {note.turn}
                </span>
                {note.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle label="유형 결과" title="축별 판정과 증거" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {type_result.axes.map((axis) => (
            <TypeResultCard axis={axis} key={axis.axis} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle label="원본 대화록" title="참여자와 AI의 전체 대화" />
        <div className="rounded-2xl bg-card px-5">
          {raw_transcript.map((message, index) => (
            <TranscriptRow key={index} message={message} />
          ))}
        </div>
      </section>
    </div>
  );
}
