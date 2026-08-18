"use client";

import { useEffect } from "react";

import { recordVisit, type VisitPage } from "@/lib/api";

// Module scope survives remounts (strict mode, screen returns) but resets on a
// page load, which is exactly the once-per-visit boundary the count wants.
const sent = new Set<VisitPage>();

/** Renders nothing; mounting it counts one visit for the given page. */
export function VisitPing({ page }: { page: VisitPage }) {
  useEffect(() => {
    if (sent.has(page)) return;
    sent.add(page);
    recordVisit(page);
  }, [page]);

  return null;
}
