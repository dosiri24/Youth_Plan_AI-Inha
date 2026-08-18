import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";

/** The activity screen shares the scrolling desktop shell with the submissions list. */
export default function ActivityLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
