"use client";

import Image from "next/image";
import { forwardRef, useState } from "react";

import { AXIS_INFO, getDisplayStrength, getPoleBadge } from "@/lib/city-axes";
import { getCityType } from "@/lib/city-types";
import type { AxisResult, TypeResult } from "@/lib/api";

type CityTypeCardProps = {
  nickname: string;
  typeResult: TypeResult;
};

/** Short pole badges tie each bar back to the badge row that identifies the type. */
function StrengthBar({ result }: { result: AxisResult }) {
  const info = AXIS_INFO[result.axis];
  const leftWins = result.letter === info.left.letter;
  const strength = getDisplayStrength(result.strength);
  const leftStrength = leftWins ? strength : 100 - strength;
  const rightStrength = 100 - leftStrength;

  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground">
        {info.title}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px] leading-5">
        <p className={leftWins ? "font-bold" : "font-medium text-incheon-gray"}>
          {info.left.badge}
          <span className="ml-1.5 text-[15px]">{leftStrength}%</span>
        </p>
        <p
          className={`text-right ${leftWins ? "font-medium text-incheon-gray" : "font-bold"}`}
        >
          <span className="mr-1.5 text-[15px]">{rightStrength}%</span>
          {info.right.badge}
        </p>
      </div>
      <div
        aria-label={`${info.left.label} ${leftStrength}퍼센트, ${info.right.label} ${rightStrength}퍼센트`}
        className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted"
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
    const content = getCityType(typeResult.code);
    // A dropped illustration must never end the result flow, so the card falls back
    // to a typography panel and stops rendering the image element entirely.
    const [imageFailed, setImageFailed] = useState(false);
    // An extracted nickname can come back empty, and the rasterized card must still read cleanly.
    const owner = nickname ? `${nickname}님의 도시 유형` : "내 도시 유형";

    return (
      <div
        ref={ref}
        className="overflow-hidden rounded-[30px] bg-card shadow-[0_18px_50px_rgba(23,25,26,0.12)]"
      >
        <div className="bg-primary px-6 pt-6 pb-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12px] font-bold tracking-[0.12em] text-white/80">
              내가 바라는 2040 인천
            </p>
            <span className="rounded-full bg-incheon-green px-3 py-1 text-[11px] font-bold text-white">
              유스플랜AI
            </span>
          </div>
          <p className="mt-6 text-[16px] font-bold">{owner}</p>
        </div>

        {imageFailed ? (
          // The heading moves into the panel so the fallback card still leads with
          // the nickname instead of printing it twice.
          <div className="flex min-h-44 items-center justify-center bg-secondary px-6 py-10">
            <h1 className="text-center text-[26px] leading-9 font-black tracking-[-0.03em] text-primary">
              {content.nickname}
            </h1>
          </div>
        ) : (
          <Image
            alt={`${content.nickname} 유형 일러스트`}
            className="h-auto w-full bg-secondary"
            height={360}
            onError={() => setImageFailed(true)}
            priority
            src={content.image}
            unoptimized
            width={480}
          />
        )}

        <div className="px-6 pt-6 pb-7">
          {!imageFailed && (
            <h1 className="mb-3 text-[25px] leading-8 font-bold tracking-[-0.03em]">
              {content.nickname}
            </h1>
          )}
          <p className="text-[14px] leading-6 text-muted-foreground">
            {content.description}
          </p>

          <ul aria-label="유형 라벨" className="mt-5 flex flex-wrap gap-1.5">
            {typeResult.axes.map((result) => (
              <li
                key={result.axis}
                className="rounded-full bg-secondary px-3 py-1.5 text-[13px] font-bold text-primary"
              >
                {getPoleBadge(result.axis, result.letter)}
              </li>
            ))}
          </ul>

          <div className="mt-7 space-y-5 border-t border-border pt-6">
            {typeResult.axes.map((result) => (
              <StrengthBar key={result.axis} result={result} />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
