"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  deleteSubmission,
  listSubmissions,
  seedSubmissions,
  type SubmissionSummary,
} from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; submissions: SubmissionSummary[] };

/** The list drills from the aggregate report into each participant's context. */
export default function SubmissionsList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [seeding, setSeeding] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const toggleDeleteMode = () => {
    setDeleteMode((on) => !on);
    setSelected(new Set());
  };

  const toggleRow = (submissionId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(submissionId)) next.add(submissionId);
      return next;
    });
  };

  const closeDialog = () => {
    setConfirming(false);
    setCode("");
    setMessage(null);
  };

  const confirmDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deleting || code === "") return;

    setDeleting(true);
    setMessage(null);
    try {
      // There is no bulk endpoint, and running one at a time means a wrong code
      // is answered before anything has been removed.
      for (const submissionId of selected) {
        const outcome = await deleteSubmission(submissionId, code);
        if (outcome === "denied") {
          setMessage("코드가 맞지 않습니다. 다시 입력해 주세요.");
          return;
        }
      }
      closeDialog();
      setDeleteMode(false);
      setSelected(new Set());
      load();
    } catch {
      setMessage("삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">제출본</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            참여자가 제출한 인터뷰 결과를 확인합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deleteMode && (
            <>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {selected.size}건 선택
              </span>
              <Button
                className="rounded-xl text-[13px]"
                disabled={selected.size === 0}
                onClick={() => setConfirming(true)}
                size="sm"
                variant="destructive"
              >
                삭제
              </Button>
            </>
          )}
          <Button
            className="rounded-xl text-[13px]"
            onClick={toggleDeleteMode}
            size="sm"
            variant={deleteMode ? "secondary" : "ghost"}
          >
            {deleteMode ? "삭제 모드 끄기" : "삭제 모드"}
          </Button>
          <Button
            className="rounded-xl text-[13px] text-muted-foreground/80"
            disabled={seeding}
            onClick={handleSeed}
            size="sm"
            variant="ghost"
          >
            {seeding ? "불러오는 중" : "예시 제출본 불러오기"}
          </Button>
        </div>
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
              <li
                className="flex items-center border-b border-border last:border-b-0"
                key={item.submission_id}
              >
                <Link
                  className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 hover:bg-muted"
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
                {deleteMode && (
                  <label className="flex shrink-0 cursor-pointer items-center self-stretch pr-5 pl-2 hover:bg-muted">
                    <input
                      aria-label={`${item.nickname} 제출본 선택`}
                      checked={selected.has(item.submission_id)}
                      className="size-4 accent-primary"
                      onChange={() => toggleRow(item.submission_id)}
                      type="checkbox"
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog.Root
        onOpenChange={(next) => {
          if (next || deleting) return;
          closeDialog();
        }}
        open={confirming}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/35" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-popover p-7 shadow-[0_18px_60px_rgba(23,25,26,0.18)]">
            <Dialog.Title className="text-[20px] font-bold tracking-[-0.02em]">
              제출본 {selected.size}건을 지울까요?
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-[14px] leading-6 text-muted-foreground">
              유형 결과와 개인 보고서는 물론{" "}
              <b className="font-bold text-foreground">
                참여자가 나눈 원본 대화록까지 저장소에서 영원히 사라집니다.
              </b>{" "}
              되돌릴 방법은 없습니다.
            </Dialog.Description>
            <form
              className="mt-6"
              onSubmit={(event) => void confirmDelete(event)}
            >
              <label
                className="block text-[13px] font-bold"
                htmlFor="delete-access-code"
              >
                접근 코드를 다시 입력해 주세요
              </label>
              <input
                aria-describedby={
                  message === null ? undefined : "delete-access-code-message"
                }
                aria-invalid={message !== null}
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-xl bg-muted px-4 text-[15px] font-semibold tracking-[0.35em] outline-none transition focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/35 disabled:cursor-not-allowed"
                disabled={deleting}
                id="delete-access-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
              <p
                className={`mt-2 min-h-5 text-[13px] text-muted-foreground ${message === null ? "invisible" : "visible"}`}
                id="delete-access-code-message"
                role="alert"
              >
                {message}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  className="h-11 rounded-xl px-5 text-[14px] font-bold"
                  disabled={deleting}
                  onClick={closeDialog}
                  type="button"
                  variant="secondary"
                >
                  취소
                </Button>
                <Button
                  className="h-11 rounded-xl bg-incheon-gray px-5 text-[14px] font-bold text-white hover:bg-incheon-gray/90"
                  disabled={deleting || code === ""}
                  type="submit"
                >
                  {deleting ? "지우는 중" : "영구 삭제"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
