import type { ReactNode } from "react";

import { AccessGate } from "@/components/access-gate";
import { VisitPing } from "@/components/visit-ping";

/** The dashboard fills the viewport itself, so only the code gate is shared here. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Outside the gate: opening /admin is a visit whether or not a code follows. */}
      <VisitPing page="admin" />
      <AccessGate>{children}</AccessGate>
    </>
  );
}
