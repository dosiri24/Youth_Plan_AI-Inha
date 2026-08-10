"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  listSubmissions,
  seedSubmissions,
  type SubmissionSummary,
} from "@/lib/api";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; submissions: SubmissionSummary[] };

/** The list drills from the aggregate report into each participant's context. */
export default function SubmissionsList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(() => {
    void listSubmissions()
      .then((submissions) => setState({ status: "ready", submissions }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedSubmissions();
      load();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">제출본</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            참여자가 제출한 인터뷰 결과를 확인합니다.
          </p>
        </div>
        {DEV_MODE && (
          <Button
            className="shrink-0 rounded-xl text-[13px] text-muted-foreground/80"
            disabled={seeding}
            onClick={handleSeed}
            size="sm"
            variant="ghost"
          >
            {seeding ? "불러오는 중" : "예시 제출본 불러오기"}
          </Button>
        )}
      </div>

      <div className="mt-6">
        {state.status === "loading" && (
          <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
            불러오는 중입니다.
          </p>
        )}
        {state.status === "error" && (
          <p className="rounded-2xl bg-card px-5 py-8 text-center text-[14px] text-muted-foreground">
            제출본을 불러오지 못했습니다.
          </p>
        )}
        {state.status === "ready" && state.submissions.length === 0 && (
          <p className="rounded-2xl bg-card px-5 py-12 text-center text-[14px] text-muted-foreground">
            아직 제출된 인터뷰가 없습니다.
          </p>
        )}
        {state.status === "ready" && state.submissions.length > 0 && (
          <ul className="overflow-hidden rounded-2xl bg-card">
            {state.submissions.map((item) => (
              <li key={item.submission_id}>
                <Link
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 hover:bg-muted"
                  href={`/admin/submissions/${item.submission_id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="truncate text-[16px] font-bold">
                        {item.nickname}
                      </span>
                      <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 font-mono text-[12px] font-bold tracking-wider text-primary">
                        {item.type_code}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted-foreground">
                      {item.region} · {formatDateTime(item.submitted_at)} ·{" "}
                      {item.turn_count}턴 · 수정 {item.revision_count}회
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
