"use client";

import { useEffect, useState } from "react";

import { formatLogTime } from "@/lib/format";
import {
  getActivity,
  type ActivityResponse,
  type ActivityTotals,
} from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; activity: ActivityResponse };

const METRICS: { key: keyof ActivityTotals; label: string }[] = [
  { key: "visit_participant", label: "참여자 접속" },
  { key: "visit_admin", label: "담당자 접속" },
  { key: "interview_start", label: "인터뷰 시작" },
  { key: "result_view", label: "결과 확인" },
  { key: "submission", label: "제출" },
];

const EVENT_LABELS: Record<keyof ActivityTotals, string> = {
  visit_participant: "참여자 접속",
  visit_admin: "담당자 접속",
  interview_start: "인터뷰 시작",
  result_view: "결과 확인",
  submission: "제출",
};

/** Cumulative counters up top, every recorded access event listed below. */
export default function ActivityPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    void getActivity()
      .then((activity) => setState({ status: "ready", activity }))
      .catch(() => setState({ status: "error" }));
  }, []);

  return (
    <div>
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">접속 현황</h1>
      <p className="mt-1.5 text-[14px] text-muted-foreground">
        참여자와 담당자의 접속 기록입니다. IP는 마지막 자리를 가려 저장합니다.
      </p>

      <div className="mt-6">
        {state.status === "loading" && (
          <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
            불러오는 중입니다.
          </p>
        )}
        {state.status === "error" && (
          <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
            접속 현황을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
          </p>
        )}
        {state.status === "ready" && (
          <>
            <dl className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {METRICS.map(({ key, label }) => (
                <div className="rounded-2xl bg-card px-5 py-5" key={key}>
                  <dt className="text-[13px] font-semibold text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1.5 text-[26px] font-bold tracking-[-0.02em] text-primary tabular-nums">
                    {state.activity.totals[key].toLocaleString("ko-KR")}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              {state.activity.events.length === 0 ? (
                <p className="rounded-2xl bg-card px-5 py-12 text-center text-[14px] text-muted-foreground">
                  아직 기록이 없습니다.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-card">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">
                          시각 (KST)
                        </th>
                        <th className="px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">
                          활동
                        </th>
                        <th className="px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">
                          IP
                        </th>
                        <th className="px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">
                          기기
                        </th>
                        <th className="px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">
                          브라우저
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.activity.events.map((event, index) => (
                        <tr
                          className="border-b border-border last:border-b-0"
                          key={`${event.ts}-${index}`}
                        >
                          <td className="px-5 py-3 text-[14px] font-semibold tabular-nums">
                            {formatLogTime(event.ts)}
                          </td>
                          <td className="px-5 py-3 text-[14px]">
                            {EVENT_LABELS[event.type]}
                          </td>
                          <td className="px-5 py-3 text-[14px] tabular-nums text-muted-foreground">
                            {event.ip || "-"}
                          </td>
                          <td className="px-5 py-3 text-[14px] text-muted-foreground">
                            {event.device || "-"}
                          </td>
                          <td className="px-5 py-3 text-[14px] text-muted-foreground">
                            {event.browser || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
