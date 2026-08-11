import Link from "next/link";
import type { ReactNode } from "react";

/** The submission screens keep the scrolling desktop shell the dashboard dropped. */
export default function SubmissionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-y-auto bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-8 py-4">
          <Link className="flex items-baseline gap-2" href="/admin">
            <span className="text-[15px] font-bold text-primary">
              유스플랜AI
            </span>
            <span className="text-[13px] text-muted-foreground">
              운영 대시보드
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground"
              href="/admin"
            >
              대시보드
            </Link>
            <Link
              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground"
              href="/admin/submissions"
            >
              제출본
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-8 py-10">{children}</main>
    </div>
  );
}
