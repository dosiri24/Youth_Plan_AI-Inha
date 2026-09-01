"use client";

import { useCallback, useState, type FormEvent } from "react";

import { InterviewScreen } from "@/components/interview-screen";
import { MobileShell } from "@/components/mobile-shell";
import { ResultScreen } from "@/components/result-screen";
import { Button } from "@/components/ui/button";
import { VisitPing } from "@/components/visit-ping";
import { createSession, type Gender } from "@/lib/api";
import { readDeviceToken } from "@/lib/device-token";
import { PRIZE_DRAW_OPEN } from "@/lib/prize";

type Screen =
  | { name: "start" }
  | { name: "interview"; sessionId: string }
  | { name: "result"; sessionId: string }
  | { name: "error" };

/** Bound entry to ages 16 to 29 as counted in 2026, keeping every participant clear of the guardian-consent threshold at 14. */
function isValidBirthYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1997 && year <= 2010;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "other", label: "기타" },
];

type StartScreenProps = {
  onError: () => void;
  onStart: (sessionId: string) => void;
};

/** The entry explains why participation matters before the participant consents. */
function StartScreen({ onError, onStart }: StartScreenProps) {
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderSlides, setGenderSlides] = useState(false);
  const [pending, setPending] = useState(false);
  const valid = isValidBirthYear(birthYear);
  const invalid = birthYear.length > 0 && !valid;
  const genderIndex = GENDER_OPTIONS.findIndex(
    (option) => option.value === gender,
  );

  // Sliding turns on only once a choice already exists, so the first one fades in
  // where it was picked instead of travelling there from the left edge.
  const chooseGender = (value: Gender) => {
    if (gender !== null) setGenderSlides(true);
    setGender(value);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || gender === null || pending) return;

    setPending(true);
    try {
      // Read on submit because localStorage does not exist during server rendering.
      onStart(
        await createSession(Number(birthYear), gender, readDeviceToken()),
      );
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7">
      <VisitPing page="participant" />
      <div className="flex-1">
        <p className="text-[15px] font-bold text-primary">유스플랜AI</p>
        <h1 className="mt-3 text-[29px] leading-[1.28] font-bold tracking-[-0.035em]">
          2045년의 인천,
          <br />
          어떤 하루를 보내고 싶나요?
        </h1>
        {/* Tighter leading than the rest of the screen: the notice below has to name
            every collected item, and this is where that height comes from. */}
        <p className="mt-3 text-[16px] leading-6 text-muted-foreground">
          AI와 대화하며 내가 바라는 2045년 인천의 일상과 필요한 변화를 정리해요.
          들려주신 이야기는 인천을 계획할 때 청년의 관점을 반영하는 자료가 돼요.
        </p>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          인천에 살거나, 학교나 직장이 인천이거나, 인천을 자주 찾는 청년이면
          누구나 참여할 수 있어요.
        </p>
        {/* The only place the duration is stated, so the interviewer never guesses it. */}
        <p className="mt-3 text-[15px] font-semibold text-incheon-green">
          인터뷰는 5~10분 정도 걸려요.
        </p>
        {/* A completion reward only works if it is known before starting, so it
            joins the duration as the second fact about taking part. */}
        {PRIZE_DRAW_OPEN && (
          <p className="mt-1.5 text-[15px] font-semibold text-incheon-green">
            끝까지 마치면 스타벅스 쿠폰 추첨에 응모할 수 있어요.
          </p>
        )}
      </div>

      <form className="mt-6 shrink-0" onSubmit={submit}>
        {/* The error shares the label's line so appearing and clearing costs no vertical space. */}
        <div className="flex items-baseline justify-between gap-3">
          <label
            className="text-[14px] font-bold text-foreground"
            htmlFor="birth-year"
          >
            출생연도
          </label>
          <p
            id="birth-year-error"
            className={`shrink-0 text-[12px] whitespace-nowrap text-muted-foreground ${invalid ? "visible" : "invisible"}`}
          >
            1997~2010년생이 참여할 수 있어요
          </p>
        </div>
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
        <fieldset className="mt-1.5" disabled={pending}>
          <legend className="sr-only">성별</legend>
          {/* Same radius token as the input above, which at this height resolves to a pill. */}
          <div className="relative h-8 w-full rounded-2xl bg-muted p-[2px]">
            {/* Position and appearance are split so enabling the slide cannot cut the fade short. */}
            <div
              className={`absolute inset-y-[2px] left-[2px] w-[calc((100%_-_4px)/3)] ${
                genderSlides
                  ? "transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  : ""
              }`}
              style={{
                transform: `translateX(${Math.max(genderIndex, 0) * 100}%)`,
              }}
            >
              <div
                className={`size-full rounded-full bg-card shadow-[0_1px_3px_rgba(23,25,26,0.1)] transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                  genderIndex >= 0 ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
            <div className="relative flex h-full">
              {GENDER_OPTIONS.map((option) => {
                const checked = gender === option.value;

                return (
                  // The label reaches past the rail so the bar can look thin while the thumb stays a full finger tall.
                  <label
                    className="-my-2 flex flex-1 cursor-pointer py-2 has-[:disabled]:cursor-not-allowed"
                    key={option.value}
                  >
                    <input
                      checked={checked}
                      className="peer sr-only"
                      name="gender"
                      onChange={() => chooseGender(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span
                      className={`flex flex-1 items-center justify-center rounded-full text-[15px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                        checked
                          ? "font-bold text-primary"
                          : "font-semibold text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>
        <div className="mt-4 rounded-2xl bg-muted/60 p-3.5">
          {/* Every collected item has to be named here, so the block splits into
              what is taken and what happens to it rather than running on. */}
          <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
            <p>
              유스플랜AI는 출생연도, 성별, 인터뷰 대화 내용, 대화 중 말한
              별명·거주 지역·꿈 또는 직업, 만족도 답변 2개, 기기 식별 토큰을
              받아요. 이 토큰은 같은 기기에서 몇 번 참여했는지만 세고, 참여를
              막거나 누구인지 알아내지 않아요. 화면을 열면 뒷자리를 가린 IP
              주소와 기기·브라우저도 남아요.
            </p>
            <p>
              대화 내용은 앤트로픽과 구글의 AI로 처리해요. 받은 내용은 2045년
              인천도시기본계획에 담을 청년 의견을 모으고 분석하는 데만 쓰고,
              정리한 결과는 인천광역시에 전달해요. 2026년 12월 31일까지 보관하고
              지워요.
            </p>
          </div>
          {/* The press is the consent now, so it carries the checkbox label's weight
              and closes the notice instead of trailing the button as a footnote. */}
          <p className="mt-3 text-[14px] leading-6 font-semibold text-foreground">
            버튼을 누르면 개인정보 수집·이용에 동의하게 돼요.
          </p>
        </div>
        <Button
          className="mt-4 h-14 w-full rounded-2xl text-base font-bold"
          disabled={!valid || gender === null || pending}
          type="submit"
        >
          {pending ? "시작하고 있어요" : "동의하고 시작하기"}
        </Button>
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
        잠시 문제가 생겼어요
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
          onReturn={showStart}
          sessionId={screen.sessionId}
        />
      )}
      {screen.name === "error" && <ErrorScreen onReturn={showStart} />}
    </MobileShell>
  );
}
