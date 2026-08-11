import { useEffect, useRef } from "react";

/** Marks our own entry so re-arming after a pop never stacks duplicates. */
const GUARD = "backGuard";

// Keeping Next's own state keys means both entries describe the same route, so
// the router treats a pop between them as a no-op instead of a navigation.
function arm(): void {
  const state = window.history.state as Record<string, unknown> | null;
  if (state?.[GUARD]) return;

  window.history.pushState({ ...state, [GUARD]: true }, "");
}

/** Device back must mean this screen's "이전", so a spare entry absorbs the press. */
export function useBackGuard(onBack: () => void): void {
  const handler = useRef(onBack);

  useEffect(() => {
    handler.current = onBack;
  });

  useEffect(() => {
    arm();

    const handlePop = () => {
      arm();
      handler.current();
    };

    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);
}
