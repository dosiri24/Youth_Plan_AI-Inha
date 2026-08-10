"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";

import adminGuide from "@/data/admin_guide.json";
import { AXIS_INFO } from "@/lib/city-axes";
import { CITY_TYPES } from "@/lib/city-types";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  getLatestAnalysis,
  runAnalysis,
  type AnalysisRun,
  type AxisName,
  type AxisStat,
  type AxisSummary,
} from "@/lib/api";

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

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; run: AnalysisRun };

type RunState = "idle" | "running" | "not_ready";

function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-[13px] font-bold text-primary">
        {index}
      </span>
      <h2 className="text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
    </div>
  );
}

function EmptyBlock() {
  return (
    <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
      아직 분석 결과가 없습니다. 분석을 실행하면 이곳에 표시됩니다.
    </p>
  );
}

function AxisStatCard({ stat }: { stat: AxisStat }) {
  return (
    <article className="rounded-2xl bg-card p-5">
      <p className="text-[15px] font-bold">{AXIS_INFO[stat.axis].title}</p>
      <dl className="mt-4 flex gap-2">
        {stat.poles.map((pole) => (
          <div
            key={pole.letter}
            className="flex-1 rounded-xl bg-muted px-3 py-3"
          >
            <dt className="text-[12px] font-bold text-primary">
              {pole.letter}
            </dt>
            <dd className="mt-1 text-[20px] font-bold">
              {pole.count}
              <span className="ml-1 text-[12px] font-semibold text-muted-foreground">
                명
              </span>
            </dd>
            <p className="mt-1 text-[12px] text-muted-foreground">
              평균 강도 {pole.mean_strength}
            </p>
          </div>
        ))}
      </dl>
    </article>
  );
}

function AxisSummaryCard({ summary }: { summary: AxisSummary }) {
  return (
    <article className="rounded-2xl bg-card p-5">
      <p className="text-[15px] font-bold">{AXIS_INFO[summary.axis].title}</p>
      <div className="mt-4 space-y-4">
        {summary.poles.map((pole) => (
          <div key={pole.letter}>
            <p className="text-[13px] font-bold text-primary">{pole.letter}</p>
            <ul className="mt-2 space-y-1.5">
              {pole.sentences.map((sentence, index) => (
                <li key={index} className="flex gap-2.5 text-[14px] leading-6">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-incheon-green" />
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

/** The sixteen-type reference sits behind a help icon so it never crowds the axes. */
function TypesHelpDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label="16유형 해설 보기"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <HelpCircle aria-hidden="true" className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[80dvh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-popover p-7 shadow-[0_18px_60px_rgba(23,25,26,0.18)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[20px] font-bold tracking-[-0.02em]">
                16유형 해설
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-muted-foreground">
                네 축 판정 글자를 이어 붙인 유형의 별명과 설명입니다.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="닫기"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {CITY_TYPES.map((type) => (
              <li key={type.code}>
                <p className="text-[13px] font-bold">
                  <span className="font-mono tracking-wider text-primary">
                    {type.code}
                  </span>{" "}
                  {type.nickname}
                </p>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                  {type.description}
                </p>
              </li>
            ))}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function ReportHome() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [runState, setRunState] = useState<RunState>("idle");

  useEffect(() => {
    void getLatestAnalysis()
      .then((run) =>
        setState(run === null ? { status: "empty" } : { status: "ready", run }),
      )
      .catch(() => setState({ status: "error" }));
  }, []);

  const run = async () => {
    if (runState === "running") return;

    setRunState("running");
    try {
      const outcome = await runAnalysis();
      if (outcome === "not_ready") {
        setRunState("not_ready");
        return;
      }
      setRunState("idle");
      const latest = await getLatestAnalysis();
      setState(
        latest === null
          ? { status: "empty" }
          : { status: "ready", run: latest },
      );
    } catch {
      setState({ status: "error" });
      setRunState("idle");
    }
  };

  const hasRun = state.status === "ready";
  const distribution = hasRun
    ? CITY_TYPES.map((type) => ({
        code: type.code,
        count: state.run.type_distribution[type.code] ?? 0,
      })).filter((entry) => entry.count > 0)
    : [];

  return (
    <div className="space-y-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            종합 리포트
          </h1>
          {hasRun && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {formatDateTime(state.run.executed_at)} 실행 ·{" "}
              {state.run.input_submission_ids.length}건 분석
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <Button
            className="h-11 rounded-xl px-5 text-[14px] font-bold"
            disabled={runState === "running"}
            onClick={() => void run()}
          >
            {runState === "running" ? "분석 실행 중" : "분석 실행"}
          </Button>
          {runState === "not_ready" && (
            <p className="mt-2 max-w-[220px] text-[12px] leading-5 text-muted-foreground">
              분석 파이프라인이 아직 준비되지 않았습니다.
            </p>
          )}
        </div>
      </header>

      {state.status === "loading" && (
        <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          불러오는 중입니다.
        </p>
      )}
      {state.status === "error" && (
        <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
          리포트를 불러오지 못했습니다.
        </p>
      )}

      {state.status !== "loading" && state.status !== "error" && (
        <>
          <section className="space-y-4">
            <SectionTitle index={1} title="축별 분포와 극별 평균 강도" />
            {hasRun ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {state.run.axis_stats.map((stat) => (
                  <AxisStatCard key={stat.axis} stat={stat} />
                ))}
              </div>
            ) : (
              <EmptyBlock />
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle index={2} title="16유형 분포" />
            {hasRun ? (
              <div className="rounded-2xl bg-card p-5">
                {distribution.length === 0 ? (
                  <p className="text-center text-[14px] text-muted-foreground">
                    집계된 유형이 없습니다.
                  </p>
                ) : (
                  <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                    {distribution.map((entry) => (
                      <li
                        key={entry.code}
                        className="flex items-center justify-between gap-4 text-[14px]"
                      >
                        <span className="font-mono font-bold tracking-wider text-primary">
                          {entry.code}
                        </span>
                        <span className="font-semibold">{entry.count}명</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <EmptyBlock />
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle index={3} title="축별·극별 정성 요약" />
            {hasRun ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {state.run.axis_summaries.map((summary) => (
                  <AxisSummaryCard key={summary.axis} summary={summary} />
                ))}
              </div>
            ) : (
              <EmptyBlock />
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle index={4} title="비식별 대표 인용" />
            {hasRun ? (
              <div className="grid gap-4 md:grid-cols-2">
                {state.run.axis_summaries.map((summary) => (
                  <article
                    key={summary.axis}
                    className="rounded-2xl bg-card p-5"
                  >
                    <p className="text-[15px] font-bold">
                      {AXIS_INFO[summary.axis].title}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {summary.quotes.map((quote) => (
                        <li
                          key={quote.quote_id}
                          className="rounded-xl bg-muted px-3.5 py-2.5 text-[14px] leading-6"
                        >
                          <Link
                            className="mr-2 font-mono text-[11px] font-bold text-primary hover:underline"
                            href={`/admin/submissions/${quote.submission_id}`}
                          >
                            {quote.quote_id}
                          </Link>
                          {quote.text}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyBlock />
            )}
          </section>
        </>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <SectionTitle index={5} title="축과 유형의 의미" />
          <TypesHelpDialog />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {GUIDE.axes.map((guide) => (
            <article key={guide.axis} className="rounded-2xl bg-card p-5">
              <p className="font-mono text-[12px] font-bold text-primary">
                {guide.display}
              </p>
              <h3 className="mt-1 text-[16px] font-bold">{guide.title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                {guide.measures}
              </p>
              <dl className="mt-4 space-y-3">
                {guide.poles.map((pole) => (
                  <div key={pole.letter}>
                    <dt className="text-[13px] font-bold">
                      {pole.letter} · {pole.name}
                    </dt>
                    <dd className="mt-1 text-[13px] leading-6 text-muted-foreground">
                      {pole.description}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl bg-muted px-3.5 py-3">
                <p className="text-[12px] font-bold text-incheon-gray">
                  축 계보
                </p>
                <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                  {guide.lineage}
                </p>
              </div>
            </article>
          ))}
        </div>
        <article className="rounded-2xl bg-card p-5">
          <p className="font-mono text-[12px] font-bold text-primary">
            {GUIDE.excluded_axis.display}
          </p>
          <h3 className="mt-1 text-[16px] font-bold">
            {GUIDE.excluded_axis.title} · 제외한 축
          </h3>
          <p className="mt-2 max-w-4xl text-[13px] leading-6 text-muted-foreground">
            {GUIDE.excluded_axis.reason}
          </p>
        </article>
      </section>
    </div>
  );
}
