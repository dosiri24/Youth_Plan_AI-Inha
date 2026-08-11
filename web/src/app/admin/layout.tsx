import type { ReactNode } from "react";

import { AccessGate } from "@/components/access-gate";

/** The dashboard fills the viewport itself, so only the code gate is shared here. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AccessGate>{children}</AccessGate>;
}
