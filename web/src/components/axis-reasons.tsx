import { AXIS_INFO, getPoleLabel } from "@/lib/city-axes";
import type { AxisReason } from "@/lib/api";

type AxisReasonsProps = {
  reasons: AxisReason[];
};

/** Judgement reasons explain the inference without echoing participant quotes. */
export function AxisReasons({ reasons }: AxisReasonsProps) {
  return (
    <section aria-labelledby="axis-reasons-title">
      <h2
        id="axis-reasons-title"
        className="text-[24px] font-bold tracking-[-0.03em]"
      >
        도시 MBTI 세부 결과
      </h2>
      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
        중요하게 여긴 도시의 모습을 네 가지 축으로 풀어봤어요.
      </p>

      <div className="mt-6 space-y-3">
        {reasons.map((reason) => (
          <article key={reason.axis} className="rounded-[22px] bg-card p-5">
            <p className="text-[12px] font-bold text-muted-foreground">
              {AXIS_INFO[reason.axis].title}
            </p>
            <h3 className="mt-1.5 text-[17px] font-bold">
              <span className="text-primary">{reason.letter}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              {getPoleLabel(reason.axis, reason.letter)}
            </h3>
            <p className="mt-3 text-[14px] leading-6 text-foreground">
              {reason.reason}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
