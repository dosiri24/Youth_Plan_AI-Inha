import { AXIS_INFO, getDisplayStrength } from "@/lib/city-axes";
import type { AxisResult } from "@/lib/api";

/** These bars are the only place the type is identified, so the winning pole alone carries colour. */
function StrengthBar({ result }: { result: AxisResult }) {
  const info = AXIS_INFO[result.axis];

  // An unevidenced axis is scored at its default pole, so a percentage here would
  // present a fallback as a measurement.
  if (result.empty_axis) {
    return (
      <div>
        <p className="text-[11px] font-bold text-muted-foreground">
          {info.title}
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          이번 대화에서는 이 이야기가 나오지 않았어요.
        </p>
      </div>
    );
  }

  const leftWins = result.letter === info.left.letter;
  const strength = getDisplayStrength(result.strength);
  const leftStrength = leftWins ? strength : 100 - strength;
  const rightStrength = 100 - leftStrength;

  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground">
        {info.title}
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] leading-5">
        <p
          className={
            leftWins
              ? "font-bold text-primary"
              : "font-medium text-muted-foreground"
          }
        >
          {info.left.badge}
          <span
            className={`ml-1.5 ${leftWins ? "text-[18px]" : "text-[15px]"}`}
          >
            {leftStrength}%
          </span>
        </p>
        <p
          className={`text-right ${leftWins ? "font-medium text-muted-foreground" : "font-bold text-primary"}`}
        >
          <span
            className={`mr-1.5 ${leftWins ? "text-[15px]" : "text-[18px]"}`}
          >
            {rightStrength}%
          </span>
          {info.right.badge}
        </p>
      </div>
      <div
        aria-label={`${info.left.label} ${leftStrength}퍼센트, ${info.right.label} ${rightStrength}퍼센트`}
        className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
      >
        <span
          aria-hidden="true"
          className={`h-full ${leftWins ? "bg-primary" : "bg-incheon-gray/25"}`}
          style={{ width: `${leftStrength}%` }}
        />
        <span
          aria-hidden="true"
          className={`h-full ${leftWins ? "bg-incheon-gray/25" : "bg-primary"}`}
          style={{ width: `${rightStrength}%` }}
        />
      </div>
    </div>
  );
}

type AxisStrengthsProps = {
  axes: AxisResult[];
};

/** A ruled row per axis is what tells a title apart from the axis above it. */
export function AxisStrengths({ axes }: AxisStrengthsProps) {
  return (
    <section className="rounded-[24px] bg-card p-5">
      {axes.map((result, index) => (
        <div
          className={index === 0 ? "" : "mt-6 border-t border-border pt-6"}
          key={result.axis}
        >
          <StrengthBar result={result} />
        </div>
      ))}
    </section>
  );
}
