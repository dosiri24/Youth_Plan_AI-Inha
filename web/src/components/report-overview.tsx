import { Check } from "lucide-react";

import { AXIS_INFO, getPoleLabel } from "@/lib/city-axes";
import type { PersonalReport } from "@/lib/api";

type ReportOverviewProps = {
  report: PersonalReport;
};

/** Fixed story details keep the participant's context beside the summary. */
function StoryOverview({ report }: ReportOverviewProps) {
  const info = report.self_info;
  const details = [
    ["별명", info.nickname],
    ["출생연도", `${info.birth_year}년`],
    ["2040년의 나이", `${info.age_2040}세`],
    ["거주 지역", info.region],
    ["꿈 또는 일", info.dream_or_job],
  ];

  return (
    <section aria-labelledby="story-title">
      <p className="text-[13px] font-bold text-incheon-green">
        내가 들려준 이야기
      </p>
      <h2
        id="story-title"
        className="mt-2 text-[24px] font-bold tracking-[-0.03em]"
      >
        {info.nickname}님의 2040년을 담았어요
      </h2>

      <div className="mt-6 rounded-[24px] bg-card p-5">
        <div className="flex items-center gap-2">
          <Check
            aria-hidden="true"
            className="size-5 text-incheon-green"
            strokeWidth={2.5}
          />
          <h3 className="text-[17px] font-bold">인터뷰 전체 요약</h3>
        </div>
        <ul className="mt-4 space-y-3">
          {report.summary.map((sentence, index) => (
            <li
              key={`${index}-${sentence}`}
              className="flex gap-3 text-[14px] leading-6"
            >
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{sentence}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-4 overflow-hidden rounded-[24px] bg-card px-5">
        {details.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[106px_1fr] gap-3 border-b border-border py-4 last:border-b-0"
          >
            <dt className="text-[13px] font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className="text-right text-[14px] leading-5 font-semibold">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Read-only demands let submission review stay separate from revision controls. */
function DemandOverview({ report }: ReportOverviewProps) {
  return (
    <section aria-labelledby="demands-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-primary">축별 요구 보고서</p>
          <h2
            id="demands-title"
            className="mt-2 text-[24px] font-bold tracking-[-0.03em]"
          >
            인천에 바라는 변화를 모았어요
          </h2>
        </div>
        {report.meta.revision_count > 0 && (
          <span className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary">
            {report.meta.revision_count}번 반영
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {report.axis_demands.map((axisDemand) => (
          <article key={axisDemand.axis} className="rounded-[24px] bg-card p-5">
            <p className="text-[12px] font-bold text-muted-foreground">
              {AXIS_INFO[axisDemand.axis].title}
            </p>
            <h3 className="mt-1.5 text-[18px] font-bold">
              {axisDemand.letter} ·{" "}
              {getPoleLabel(axisDemand.axis, axisDemand.letter)}
            </h3>

            <div className="mt-5 space-y-5">
              {axisDemand.demands.map((demand) => (
                <div key={demand.id}>
                  <h4 className="text-[16px] font-bold">{demand.title}</h4>
                  <ul className="mt-3 space-y-2.5">
                    {demand.description.map((sentence, index) => (
                      <li
                        key={`${demand.id}-${index}`}
                        className="flex gap-3 rounded-[18px] bg-muted px-3.5 py-3 text-[14px] leading-6"
                      >
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-incheon-green" />
                        <span>{sentence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** The overview contains only information needed to confirm and submit. */
export function ReportOverview({ report }: ReportOverviewProps) {
  return (
    <div className="space-y-12">
      <StoryOverview report={report} />
      <DemandOverview report={report} />
    </div>
  );
}
