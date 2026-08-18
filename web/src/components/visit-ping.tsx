"use client";

import { useEffect } from "react";

import { recordVisit, type VisitPage } from "@/lib/api";

// sessionStorage survives a reload but not a new tab, which is exactly the
// once-per-visitor boundary the count wants; the module Set only guards the
// double mount strict mode adds within one render pass.
const sent = new Set<VisitPage>();

/** Renders nothing; mounting it counts one visit for the given page. */
export function VisitPing({ page }: { page: VisitPage }) {
  useEffect(() => {
    if (sent.has(page)) return;
    sent.add(page);

    const key = `visit-${page}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    recordVisit(page);
  }, [page]);

  return null;
}
