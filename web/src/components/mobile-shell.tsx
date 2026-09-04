import type { ReactNode } from "react";

type MobileShellProps = {
  children: ReactNode;
};

/** One shell prevents desktop viewports from widening the participant flow. The cap is
 *  held to those viewports: a phone rendering at reduced page zoom reports a width past
 *  440px and would otherwise sit in a grey frame with the flow shrunk inside it. */
export function MobileShell({ children }: MobileShellProps) {
  return (
    <main className="flex min-h-dvh justify-center bg-muted sm:items-center sm:p-4">
      <div className="flex h-dvh w-full sm:max-w-[440px] flex-col overflow-hidden bg-background sm:h-[min(860px,calc(100dvh-2rem))] sm:rounded-[30px] sm:shadow-[0_18px_60px_rgba(23,25,26,0.12)]">
        {children}
      </div>
    </main>
  );
}
