"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The destructive decision must isolate focus from the active interview. */
export function ConfirmDialog({
  open,
  pending,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => {
    closeRef.current = onClose;
    pendingRef.current = pending;
  }, [onClose, pending]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const target =
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        dialogRef.current;
      target?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) closeRef.current();
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
      window.cancelAnimationFrame(frame);
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
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-busy={pending}
        aria-describedby="quit-description"
        aria-labelledby="quit-title"
        aria-modal="true"
        className="w-full max-w-[408px] rounded-t-[28px] bg-popover px-6 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(23,25,26,0.14)] sm:rounded-[28px] sm:p-7"
        role="alertdialog"
        tabIndex={-1}
      >
        <h2
          id="quit-title"
          className="text-[22px] font-bold tracking-[-0.02em]"
        >
          인터뷰를 그만둘까요?
        </h2>
        <p
          id="quit-description"
          className="mt-3 text-[15px] leading-6 text-muted-foreground"
        >
          지금까지 나눈 대화는 모두 버려지고 다시 복구할 수 없어요. 결과도
          만들어지지 않아요.
        </p>

        <div className="mt-7 grid gap-2.5">
          <Button
            className="h-13 rounded-2xl text-[15px] font-bold"
            disabled={pending}
            onClick={onClose}
            variant="secondary"
          >
            계속 인터뷰하기
          </Button>
          <Button
            className="h-13 rounded-2xl bg-incheon-gray text-[15px] font-bold text-white hover:bg-incheon-gray/90"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "대화를 버리는 중..." : "대화 버리고 나가기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
