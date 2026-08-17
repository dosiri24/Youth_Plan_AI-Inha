import { Noto_Serif_KR } from "next/font/google";
import type { ReactNode } from "react";

/* The briefing is the only screen that reads as a document, so it is the only
   one that loads a serif. Scoping the font to this route keeps it off the
   participant flow, and the Korean face is split by unicode-range so a browser
   fetches only the ranges the page actually uses. */
const serif = Noto_Serif_KR({
  weight: ["400", "600"],
  variable: "--font-report-serif",
  display: "swap",
  // The Korean ranges are far too large to preload, and Google does not offer a
  // "korean" subset for this face, so Next requires preload to be opted out.
  preload: false,
});

/** The access gate comes from the admin layout above; only the serif is added here. */
export default function ReportLayout({ children }: { children: ReactNode }) {
  return <div className={serif.variable}>{children}</div>;
}
