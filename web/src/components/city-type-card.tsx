import { forwardRef } from "react";

import cityTypes from "@/data/city_types.json";
import { AXIS_INFO } from "@/lib/city-axes";
import type { AxisResult, TypeResult } from "@/lib/api";

type CityTypeCardProps = {
  nickname: string;
  typeResult: TypeResult;
};

/** Fixed pole percentages keep the share card faithful to the scored result. */
function StrengthBar({ result }: { result: AxisResult }) {
  const info = AXIS_INFO[result.axis];
  const leftWins = result.letter === info.left.letter;
  const leftStrength = leftWins ? result.strength : 100 - result.strength;
  const rightStrength = 100 - leftStrength;

  return (
    <div>
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div className={leftWins ? "font-bold" : "font-medium"}>
          <p className="text-[13px] leading-5">
            <span className="text-primary">{info.left.letter}</span>
            <span className="ml-1.5 text-foreground">{info.left.label}</span>
          </p>
          <p className="mt-0.5 text-[17px] text-foreground">{leftStrength}%</p>
        </div>
        <div className={`text-right ${leftWins ? "font-medium" : "font-bold"}`}>
          <p className="text-[13px] leading-5">
            <span className="mr-1.5 text-foreground">{info.right.label}</span>
            <span className="text-incheon-green">{info.right.letter}</span>
          </p>
          <p className="mt-0.5 text-[17px] text-foreground">{rightStrength}%</p>
        </div>
      </div>
      <div
        aria-label={`${info.left.letter} ${info.left.label} ${leftStrength}퍼센트, ${info.right.letter} ${info.right.label} ${rightStrength}퍼센트`}
        className="flex h-3.5 overflow-hidden rounded-full bg-muted"
        role="img"
      >
        <span
          aria-hidden="true"
          className="h-full bg-primary"
          style={{ width: `${leftStrength}%` }}
        />
        <span
          aria-hidden="true"
          className="h-full bg-incheon-green"
          style={{ width: `${rightStrength}%` }}
        />
      </div>
    </div>
  );
}

/** A self-contained card preserves its layout and Incheon palette when rasterized. */
export const CityTypeCard = forwardRef<HTMLDivElement, CityTypeCardProps>(
  function CityTypeCard({ nickname, typeResult }, ref) {
    const content = cityTypes.find((item) => item.code === typeResult.code)!;
    // An extracted nickname can come back empty, and the rasterized card must still read cleanly.
    const owner = nickname ? `${nickname}님의 도시 MBTI` : "내 도시 MBTI";

    return (
      <div
        ref={ref}
        className="overflow-hidden rounded-[30px] bg-card shadow-[0_18px_50px_rgba(23,25,26,0.12)]"
      >
        <div className="bg-primary px-6 pt-6 pb-7 text-white">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] font-bold tracking-[0.12em] text-white/80">
              내가 바라는 2040 인천
            </p>
            <span className="rounded-full bg-incheon-green px-3 py-1 text-[11px] font-bold text-white">
              유스플랜AI
            </span>
          </div>
          <p className="mt-7 text-[54px] leading-none font-black tracking-[0.08em]">
            {typeResult.code}
          </p>
          <h1 className="mt-5 text-[25px] leading-8 font-bold tracking-[-0.03em]">
            {content.nickname}
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-white/85">
            {content.description}
          </p>
        </div>

        <div className="px-5 pt-6 pb-7">
          <div className="mb-5">
            <h2 className="text-[19px] font-bold tracking-[-0.02em]">
              {owner}
            </h2>
          </div>
          <div className="space-y-6">
            {typeResult.axes.map((result) => (
              <StrengthBar key={result.axis} result={result} />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
