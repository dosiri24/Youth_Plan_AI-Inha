import { NextResponse } from "next/server";

import { renderMaintenancePage } from "@/lib/maintenance-page";

export function proxy() {
  if (process.env.MAINTENANCE_MODE?.toLowerCase() !== "true") {
    return NextResponse.next();
  }

  return new NextResponse(renderMaintenancePage(), {
    status: 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "900",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
