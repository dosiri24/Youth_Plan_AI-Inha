import type { ReactNode } from "react";

type MobileShellProps = {
  children: ReactNode;
};

/** One shell prevents desktop viewports from widening the participant flow. */
export function MobileShell({ children }: MobileShellProps) {
  return (
    <main className="flex min-h-dvh justify-center bg-muted sm:items-center sm:p-4">
      <div className="flex h-dvh w-full max-w-[440px] flex-col overflow-hidden bg-background sm:h-[min(860px,calc(100dvh-2rem))] sm:rounded-[30px] sm:shadow-[0_18px_60px_rgba(23,25,26,0.12)]">
        {children}
      </div>
    </main>
  );
}
