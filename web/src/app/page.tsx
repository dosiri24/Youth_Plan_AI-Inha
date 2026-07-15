"use client";

import { useCallback, useState, type FormEvent } from "react";

import { InterviewScreen } from "@/components/interview-screen";
import { MobileShell } from "@/components/mobile-shell";
import { ResultScreen } from "@/components/result-screen";
import { Button } from "@/components/ui/button";
import { createSession } from "@/lib/api";

type Screen =
  | { name: "start" }
  | { name: "interview"; sessionId: string }
  | { name: "result"; sessionId: string }
  | { name: "error" };

/** Invalid years should fail before the backend creates a session. */
function isValidBirthYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1900 && year <= 2026;
}

type StartScreenProps = {
  onError: () => void;
  onStart: (sessionId: string) => void;
};

/** The entry explains why participation matters before requesting verification. */
function StartScreen({ onError, onStart }: StartScreenProps) {
  const [birthYear, setBirthYear] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const valid = isValidBirthYear(birthYear);
  const invalid = birthYear.length > 0 && !valid;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || !agreed || pending) return;

    setPending(true);
    try {
      onStart(await createSession(Number(birthYear)));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7">
      <div className="flex-1">
        <p className="text-[15px] font-bold text-primary">유스플랜AI</p>
        <h1 className="mt-3 text-[29px] leading-[1.28] font-bold tracking-[-0.035em]">
          2040년의 인천,
          <br />
          어떤 하루를 보내고 싶나요?
        </h1>
        <p className="mt-4 text-[16px] leading-7 text-muted-foreground">
          유스플랜AI는 AI와 대화하며 내가 바라는 2040년 인천의 일상과 필요한
          변화를 함께 정리하는 서비스예요. 들려주신 목소리는 미래 도시를 계획할
          때 청년의 관점이 빠지지 않도록 돕는 소중한 자료가 됩니다.
        </p>
      </div>

      <form className="mt-10 shrink-0" onSubmit={submit}>
        <label
          className="block text-[14px] font-bold text-foreground"
          htmlFor="birth-year"
        >
          출생연도
        </label>
        <input
          id="birth-year"
          aria-describedby={invalid ? "birth-year-error" : undefined}
          aria-invalid={invalid}
          autoComplete="bday-year"
          className="mt-2.5 h-14 w-full rounded-2xl bg-muted px-4 text-base font-semibold outline-none transition focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/35 disabled:cursor-not-allowed"
          disabled={pending}
          inputMode="numeric"
          maxLength={4}
          onChange={(event) => {
            if (/^\d{0,4}$/.test(event.target.value)) {
              setBirthYear(event.target.value);
            }
          }}
          placeholder="예: 2000"
          value={birthYear}
        />
        <p
          id="birth-year-error"
          className={`mt-2 min-h-5 text-[13px] text-muted-foreground ${invalid ? "visible" : "invisible"}`}
        >
          1900년부터 2026년 사이로 입력해 주세요.
        </p>
        <div className="mt-4 rounded-2xl bg-muted/60 p-4">
          <p className="text-[13px] leading-6 text-muted-foreground">
            유스플랜AI는 인터뷰 진행과 정책 분석을 위해 출생연도, 인터뷰 대화
            내용, 대화 중 언급한 별명·거주 지역·꿈 또는 직업을 수집해요. 수집한
            내용은 인천시 청년정책 연구 자료로만 쓰고, 시범운영이 끝나면
            파기해요.
          </p>
          <div className="mt-3 flex items-start gap-2.5">
            <input
              id="consent"
              checked={agreed}
              className="mt-0.5 size-5 shrink-0 accent-primary"
              disabled={pending}
              onChange={(event) => setAgreed(event.target.checked)}
              type="checkbox"
            />
            <label
              className="text-[14px] leading-6 font-semibold text-foreground"
              htmlFor="consent"
            >
              안내를 읽었고 개인정보 수집·이용에 동의합니다.
            </label>
          </div>
        </div>
        <Button
          className={`mt-4 h-14 w-full rounded-2xl text-base font-bold ${agreed ? "bg-verify text-white hover:bg-verify/90" : "bg-muted text-muted-foreground"}`}
          disabled={!agreed || !valid || pending}
          type="submit"
        >
          {pending ? "본인인증을 확인하고 있어요" : "본인인증하고 인터뷰하기"}
        </Button>
        <p className="mt-2.5 text-center text-[12px] leading-5 text-muted-foreground">
          시연용 서비스라 실제 본인인증 절차 없이 진행돼요.
        </p>
      </form>
    </section>
  );
}

type ErrorScreenProps = {
  onReturn: () => void;
};

/** A failed flow must end without exposing recovery paths or transport details. */
function ErrorScreen({ onReturn }: ErrorScreenProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center bg-card px-6 text-center">
      <h1 className="text-[26px] leading-9 font-bold tracking-[-0.03em]">
        일시적인 오류가 발생했습니다
      </h1>
      <Button
        className="mt-9 h-14 w-full rounded-2xl text-base font-bold"
        onClick={onReturn}
      >
        처음 화면으로 돌아가기
      </Button>
    </section>
  );
}

/** View switching avoids adding forbidden persistence or session restoration. */
export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "start" });

  const showStart = useCallback(() => setScreen({ name: "start" }), []);
  const showError = useCallback(() => setScreen({ name: "error" }), []);

  return (
    <MobileShell>
      {screen.name === "start" && (
        <StartScreen
          onError={showError}
          onStart={(sessionId) => setScreen({ name: "interview", sessionId })}
        />
      )}
      {screen.name === "interview" && (
        <InterviewScreen
          key={screen.sessionId}
          onComplete={() =>
            setScreen({ name: "result", sessionId: screen.sessionId })
          }
          onError={showError}
          onReturn={showStart}
          sessionId={screen.sessionId}
        />
      )}
      {screen.name === "result" && (
        <ResultScreen
          key={screen.sessionId}
          onError={showError}
          sessionId={screen.sessionId}
        />
      )}
      {screen.name === "error" && <ErrorScreen onReturn={showStart} />}
    </MobileShell>
  );
}
