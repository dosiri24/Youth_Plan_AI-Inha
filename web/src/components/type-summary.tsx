"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCityType, type CityType } from "@/lib/city-types";

const DETAIL_ID = "type-detail";

type NeighbourProps = {
  code: string;
  label: string;
  reason: string;
};

/** The pairing is stored as a code, and no screen may print one (PLAN 4.1). */
function Neighbour({ code, label, reason }: NeighbourProps) {
  return (
    <div>
      <p className="text-[12px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[16px] font-bold text-primary">
        {getCityType(code).nickname}
      </p>
      <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
        {reason}
      </p>
    </div>
  );
}

type TypeSummaryProps = {
  type: CityType;
};

/** The long story stays folded so the picture and the share buttons keep the first screen. */
export function TypeSummary({ type }: TypeSummaryProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-[24px] bg-card p-5">
      <h2 className="text-[22px] leading-8 font-bold tracking-[-0.03em]">
        {type.nickname}
      </h2>
      <p className="mt-2.5 text-[15px] leading-6 text-muted-foreground">
        {type.description}
      </p>

      <Button
        aria-controls={DETAIL_ID}
        aria-expanded={open}
        className="mt-4 h-13 w-full rounded-2xl text-[15px] font-bold"
        onClick={() => setOpen((shown) => !shown)}
        variant="secondary"
      >
        이 유형 자세히 보기
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <div
        className="mt-5 space-y-5 border-t border-border pt-5"
        hidden={!open}
        id={DETAIL_ID}
      >
        <p className="text-[14px] leading-6 text-foreground">{type.story}</p>
        <Neighbour
          code={type.match.code}
          label="나와 잘 맞는 도시유형"
          reason={type.match.reason}
        />
        <Neighbour
          code={type.mismatch.code}
          label="나와 잘 안 맞는 도시유형"
          reason={type.mismatch.reason}
        />
      </div>
    </section>
  );
}
