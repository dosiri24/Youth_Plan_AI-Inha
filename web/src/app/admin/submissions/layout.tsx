import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";

/** The submission screens keep the scrolling desktop shell the dashboard dropped. */
export default function SubmissionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
