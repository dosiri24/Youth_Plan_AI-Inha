"use client";

import { useEffect, useRef } from "react";

import { AccessCodeForm } from "@/components/access-code-form";
import { Button } from "@/components/ui/button";
import type { DevFixture } from "@/lib/api";

export type DevStage = "closed" | "code" | "fixtures";

type DevFixtureDialogProps = {
  stage: DevStage;
  fixtures: DevFixture[];
  listing: boolean;
  loadingName: string | null;
  codePending: boolean;
  codeMessage: string | null;
  onSubmitCode: (code: string) => void;
  onClose: () => void;
  onSelect: (name: string) => void;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The developer picker must not leak focus into participant controls. */
export function DevFixtureDialog({
  stage,
  fixtures,
  listing,
  loadingName,
  codePending,
  codeMessage,
  onSubmitCode,
  onClose,
  onSelect,
}: DevFixtureDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(false);
  const open = stage !== "closed";
  const busy = loadingName !== null || (stage === "code" && codePending);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  // The code stage and the picker stage swap controls, so focus is seated per stage.
  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      const target =
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        dialogRef.current;
      target?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, stage]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-busy={busy || listing}
        aria-describedby="dev-mode-description"
        aria-labelledby="dev-mode-title"
        aria-modal="true"
        className="w-full max-w-[408px] rounded-t-[28px] bg-popover px-6 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(23,25,26,0.14)] sm:rounded-[28px] sm:p-7"
        role="dialog"
        tabIndex={-1}
      >
        <p className="text-[12px] font-bold tracking-wide text-primary">
          개발자 모드
        </p>
        <h2
          id="dev-mode-title"
          className="mt-2 text-[22px] font-bold tracking-[-0.02em]"
        >
          {stage === "code" ? "코드를 입력해 주세요" : "예시 대화 선택"}
        </h2>
        <p
          id="dev-mode-description"
          className="mt-3 text-[15px] leading-6 text-muted-foreground"
        >
          {stage === "code"
            ? "코드를 입력하면 예시 대화를 고를 수 있어요."
            : "완료된 예시 대화를 불러오면 바로 결과를 확인할 수 있어요."}
        </p>

        {stage === "code" ? (
          <div className="mt-6">
            <AccessCodeForm
              message={codeMessage}
              onSubmit={onSubmitCode}
              pending={codePending}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-2.5">
            {listing ? (
              <p className="py-4 text-center text-[14px] text-muted-foreground">
                예시 대화를 불러오고 있어요
              </p>
            ) : (
              fixtures.map((fixture) => (
                <Button
                  key={fixture.name}
                  className="h-auto min-h-13 w-full justify-start rounded-2xl border-primary/15 bg-card px-4 py-3.5 text-left text-[14px] font-bold text-foreground hover:bg-secondary"
                  disabled={loadingName !== null}
                  onClick={() => onSelect(fixture.name)}
                  variant="outline"
                >
                  {loadingName === fixture.name
                    ? "대화를 불러오고 있어요"
                    : fixture.label}
                </Button>
              ))
            )}
          </div>
        )}

        <Button
          className="mt-3 h-13 w-full rounded-2xl text-[15px] font-bold"
          disabled={busy}
          onClick={onClose}
          variant="secondary"
        >
          닫기
        </Button>
      </div>
    </div>
  );
}
