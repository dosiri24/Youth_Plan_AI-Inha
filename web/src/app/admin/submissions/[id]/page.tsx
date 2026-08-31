"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Collapsible } from "@base-ui/react/collapsible";
import { Popover } from "@base-ui/react/popover";

import {
  AXIS_INFO,
  getDisplayStrength,
  getPoleBadge,
  getPoleLabel,
} from "@/lib/city-axes";
import { formatDateTime } from "@/lib/format";
import {
  SETTLEMENT_FIELDS,
  regionLabel,
  sectorLabel,
  spellCode,
} from "../../dashboard-data";
import { getCityType } from "@/lib/city-types";
import {
  getSubmission,
  type AxisReason,
  type AxisResultFull,
  type DemandFull,
  type ReportPlace,
  type SectorLabel,
  type SelfInfo,
  type SettlementIntent,
  type SubmissionDetail,
  type TopDemand,
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

  return (
    <article className="rounded-2xl bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-muted-foreground">
            {info.title}
          </p>
          <h3 className="mt-1 text-[17px] font-bold">
            {getPoleLabel(axis.axis, axis.letter)}
          </h3>
        </div>
        {/* An empty axis shows no number at all; the notice below says why. */}
        {!axis.empty_axis && (
          <span className="shrink-0 text-[15px] font-bold text-primary">
            {getDisplayStrength(axis.strength)}%
          </span>
        )}
      </div>

      {axis.empty_axis && (
        <p className="mt-3 rounded-xl bg-muted px-3.5 py-2.5 text-[12px] leading-5 text-muted-foreground">
          <span className="font-bold text-incheon-gray">증거 0건</span> · 이
          축을 판단할 발화가 없어 집계에서 제외됩니다.
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
            <dt className="text-[12px] font-semibold">
              {getPoleBadge(axis.axis, pole.letter)}
            </dt>
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
                    {getPoleBadge(axis.axis, item.pole)} +{item.weight} ·{" "}
                    {item.turn}번째 발화
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
        {AXIS_INFO[reason.axis].title} ·{" "}
        {getPoleLabel(reason.axis, reason.letter)}
      </p>
      <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
        {reason.reason}
      </p>
    </div>
  );
}

/** Turn number to full participant utterance, for quote context lookup. */
type UserTurnMap = Map<number, string>;

/**
 * Shows the full participant utterance behind a quote on hover or click.
 * Falls back to a plain block when the turn has no user message.
 */
function QuoteSourcePopover({
  turn,
  source,
  className,
  children,
}: {
  turn: number;
  source: string | undefined;
  className: string;
  children: ReactNode;
}) {
  if (source === undefined) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        className={`${className} w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-primary`}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50" sideOffset={8}>
          <Popover.Popup className="max-h-80 w-[min(480px,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-popover p-4 shadow-[0_10px_36px_rgba(23,25,26,0.16)]">
            <p className="font-mono text-[11px] font-bold text-primary">
              {turn}번째 발화
            </p>
            <p className="mt-1.5 text-[13px] leading-6 whitespace-pre-wrap">
              {source}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Sector labels arrive from a later call, so a demand can legitimately carry none. */
function SectorPill({ label }: { label: string }) {
  if (!label) return null;

  return (
    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

/** Places the participant named while raising this demand, in their own words. */
function PlaceList({ places }: { places: ReportPlace[] }) {
  if (places.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-[12px] font-bold text-muted-foreground">언급 장소</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {places.map((place, index) => (
          <li
            key={`${place.turn}-${index}`}
            className="rounded-lg bg-secondary px-2.5 py-1 text-[12px] leading-5 text-primary"
          >
            <span className="font-bold">{place.text}</span> · {place.kind}
            {place.district ? ` · ${place.district}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteList({
  demand,
  userTurns,
}: {
  demand: DemandFull;
  userTurns: UserTurnMap;
}) {
  return (
    <ul className="mt-3 space-y-1.5">
      {demand.quotes.map((quote, index) => (
        <li key={`${demand.id}-q${index}`}>
          <QuoteSourcePopover
            className="rounded-xl bg-muted px-3.5 py-2 text-[13px] leading-6 text-muted-foreground"
            source={userTurns.get(quote.turn)}
            turn={quote.turn}
          >
            <span className="mr-2 font-mono text-[11px] font-bold text-primary">
              {quote.turn}번째 발화
            </span>
            {quote.text}
          </QuoteSourcePopover>
        </li>
      ))}
    </ul>
  );
}

/**
 * Demands carry their source quotes here since the admin copy keeps them. Extra
 * demands are demands on the same terms, so they get this card rather than a note.
 */
function DemandBlock({
  demands,
  label,
  sectors,
  title,
  userTurns,
}: {
  demands: DemandFull[];
  label: string;
  sectors: SubmissionDetail["sectors"];
  title: string;
  userTurns: UserTurnMap;
}) {
  return (
    <article className="rounded-2xl bg-card p-5">
      <p className="text-[12px] font-bold text-muted-foreground">{label}</p>
      <h3 className="mt-1 text-[16px] font-bold">{title}</h3>

      <div className="mt-4 space-y-5">
        {demands.map((demand) => (
          <div key={demand.id}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-[15px] font-bold">{demand.title}</h4>
              <SectorPill label={labelSector(sectors, demand.id)} />
            </div>
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
            <QuoteList demand={demand} userTurns={userTurns} />
            <PlaceList places={demand.places} />
          </div>
        ))}
      </div>
    </article>
  );
}

/** The labelling call runs after submission, so its map can be missing entirely. */
function labelSector(
  sectors: SubmissionDetail["sectors"],
  demandId: string,
): string {
  const label: SectorLabel | undefined = sectors?.[demandId];

  return label ? sectorLabel(label.sector, label.subsector) : "";
}

/**
 * The one demand the participant picked at the close. A blank title means the
 * question never ran or they declined to pick, so the section is not built at all.
 */
function TopDemandSection({
  linkedTitle,
  sector,
  topDemand,
  userTurns,
}: {
  linkedTitle: string;
  sector: string;
  topDemand: TopDemand;
  userTurns: UserTurnMap;
}) {
  return (
    <section className="space-y-4">
      <SectionTitle label="개인 보고서" title="딱 하나만 먼저 이뤄진다면" />
      <article className="rounded-2xl bg-card p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-[17px] font-bold">{topDemand.title}</h3>
          <SectorPill label={sector} />
        </div>
        {linkedTitle && (
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            축별 요구 ‘{linkedTitle}’에서 고른 것입니다.
          </p>
        )}
        <ul className="mt-3 space-y-1.5">
          {topDemand.reason.map((sentence, index) => (
            <li key={index} className="flex gap-2.5 text-[14px] leading-6">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{sentence}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1.5">
          {topDemand.quotes.map((quote, index) => (
            <li key={`top-q${index}`}>
              <QuoteSourcePopover
                className="rounded-xl bg-muted px-3.5 py-2 text-[13px] leading-6 text-muted-foreground"
                source={userTurns.get(quote.turn)}
                turn={quote.turn}
              >
                <span className="mr-2 font-mono text-[11px] font-bold text-primary">
                  {quote.turn}번째 발화
                </span>
                {quote.text}
              </QuoteSourcePopover>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

/** Saying nothing about a field is the normal case, so an unsaid one is left out. */
function SettlementRow({ settlement }: { settlement: SettlementIntent }) {
  const said = SETTLEMENT_FIELDS.filter(([field]) => settlement[field]);
  if (said.length === 0) return null;

  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="font-bold text-muted-foreground">정착 의향</span>
      {said.map(([field, label]) => (
        <span
          key={field}
          className="rounded-md bg-secondary px-2 py-0.5 text-[12px] font-semibold text-primary"
        >
          {label} {settlement[field]}
        </span>
      ))}
    </p>
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
        {message.turn}번째 발화 · {isUser ? "참여자" : "바다"}
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
          제출본을 불러오지 못했습니다. 목록에서 다시 선택해 주세요.
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

/** The id the labelling call gives a top demand that matched no axis demand. */
const TOP_DEMAND_LABEL_ID = "TOP";

/** "기타" also holds participants who declined to say, so it is never read as missing data. */
const GENDER_LABEL: Record<SelfInfo["gender"], string> = {
  male: "남성",
  female: "여성",
  other: "기타",
};

function SubmissionBody({ detail }: { detail: SubmissionDetail }) {
  const { self_info, type_result, report, raw_transcript } = detail;
  const extraDemands = detail.extra_demands ?? [];
  const topDemand = report.top_demand;

  const userTurns: UserTurnMap = useMemo(
    () =>
      new Map(
        raw_transcript
          .filter((message) => message.role === "user")
          .map((message) => [message.turn, message.text]),
      ),
    [raw_transcript],
  );

  /* A top demand may point at an axis demand, which names what was chosen. */
  const linkedTitle =
    report.axis_demands
      .flatMap((axisDemand) => axisDemand.demands)
      .find((demand) => demand.id === topDemand.demand_id)?.title ?? "";

  return (
    <div className="mt-6 space-y-12">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            {self_info.nickname}
          </h1>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-[14px] font-bold text-primary">
            {getCityType(type_result.code).nickname}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {spellCode(type_result.code)}
          </span>
        </div>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {regionLabel(self_info.normalized_region)} · 2045년{" "}
          {self_info.age_2045}세 · {GENDER_LABEL[self_info.gender]} ·{" "}
          {self_info.dream_or_job} · {formatDateTime(detail.submitted_at)}
        </p>
        {/* The words the participant used survive even when no district resolved. */}
        {self_info.raw_region && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            참여자가 말한 거주지 ‘{self_info.raw_region}’
            {self_info.dong ? ` · 행정동 ${self_info.dong}` : ""}
          </p>
        )}
        <SettlementRow settlement={report.settlement} />
      </header>

      {topDemand.title && (
        <TopDemandSection
          linkedTitle={linkedTitle}
          sector={labelSector(
            detail.sectors,
            topDemand.demand_id || TOP_DEMAND_LABEL_ID,
          )}
          topDemand={topDemand}
          userTurns={userTurns}
        />
      )}

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
        <SectionTitle label="개인 보고서" title="요구와 근거 발화" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {report.axis_demands.map((axisDemand) => (
            <DemandBlock
              demands={axisDemand.demands}
              key={axisDemand.axis}
              label={AXIS_INFO[axisDemand.axis].title}
              sectors={detail.sectors}
              title={getPoleLabel(axisDemand.axis, axisDemand.letter)}
              userTurns={userTurns}
            />
          ))}
          {extraDemands.length > 0 && (
            <DemandBlock
              demands={extraDemands}
              label="축 밖"
              sectors={detail.sectors}
              title="네 축에 담기지 않은 요구"
              userTurns={userTurns}
            />
          )}
        </div>
      </section>

      {report.participation_notes.length > 0 && (
        <section className="space-y-4">
          <SectionTitle label="개인 보고서" title="조사에 관해 남긴 의견" />
          <ul className="space-y-2 rounded-2xl bg-card p-5">
            {report.participation_notes.map((note) => (
              <li key={`${note.turn}-${note.text}`}>
                <QuoteSourcePopover
                  className="text-[14px] leading-6"
                  source={userTurns.get(note.turn)}
                  turn={note.turn}
                >
                  <span className="mr-2 font-mono text-[12px] text-muted-foreground">
                    {note.turn}번째 발화
                  </span>
                  {note.text}
                </QuoteSourcePopover>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle label="도시유형 결과" title="축별 판정과 증거" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {type_result.axes.map((axis) => (
            <TypeResultCard axis={axis} key={axis.axis} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle label="원본 대화록" title="바다와 나눈 전체 대화" />
        <div className="rounded-2xl bg-card px-5">
          {raw_transcript.map((message, index) => (
            <TranscriptRow key={index} message={message} />
          ))}
        </div>
      </section>
    </div>
  );
}
