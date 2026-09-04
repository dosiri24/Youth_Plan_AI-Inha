"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ChevronDown, MapPin, MessagesSquare, Sparkles } from "lucide-react";

import { InterviewScreen } from "@/components/interview-screen";
import { MobileShell } from "@/components/mobile-shell";
import { ResultScreen } from "@/components/result-screen";
import { Button } from "@/components/ui/button";
import { VisitPing } from "@/components/visit-ping";
import { createSession, type Gender } from "@/lib/api";
import { readDeviceToken } from "@/lib/device-token";
import { CONTACT_EMAIL, RESEARCHERS } from "@/lib/team";

type Screen =
  | { name: "start" }
  | { name: "interview"; sessionId: string }
  | { name: "result"; sessionId: string }
  | { name: "error" };

/** Bound entry to ages 16 to 39 as counted in 2026, keeping every participant clear of the guardian-consent threshold at 14. */
function isValidBirthYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= 1987 && year <= 2010;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "other", label: "기타" },
];

/** What the participant gets, who may take part, and how long it takes: the three facts the start screen owes. */
const ENTRY_FACTS = [
  { Icon: Sparkles, text: "나도 몰랐던 내가 바라는 도시는?" },
  { Icon: MapPin, text: "인천과 관련있는 누구나 가능" },
  { Icon: MessagesSquare, text: "AI와 5~10분 인터뷰만으로" },
];

/** Written twice — once in the notice, once in the invisible copy that holds its place in
 *  the flow — so the two can never drift apart. */
const CONSENT_LINE = "버튼을 누르면 개인정보 수집·이용에 동의하게 됩니다.";

type NoticeToggleProps = {
  label: string;
  onClick: () => void;
  open: boolean;
};

/** The arrow the notice hangs on. It appears twice — once on the closed notice and once on
 *  the panel that covers it — so each says which way it goes rather than sharing one name. */
function NoticeToggle({ label, onClick, open }: NoticeToggleProps) {
  return (
    <button
      aria-controls="privacy-detail"
      aria-expanded={open}
      // Negative margin so a finger-sized target does not push the arrow off the text's
      // own first line.
      className="-m-1.5 shrink-0 self-start rounded-full p-1.5 text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
      onClick={onClick}
      type="button"
    >
      <span className="sr-only">{label}</span>
      <ChevronDown
        aria-hidden="true"
        className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

type StartScreenProps = {
  onError: () => void;
  onStart: (sessionId: string) => void;
};

/** The entry explains why participation matters before the participant consents. */
function StartScreen({ onError, onStart }: StartScreenProps) {
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderSlides, setGenderSlides] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
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
      <div className="flex shrink-0 flex-col">
        <p className="text-[15px] font-bold text-primary">유스플랜AI</p>
        <h1 className="mt-3 text-[29px] leading-[1.28] font-bold tracking-[-0.035em]">
          2045년의 인천,
          <br />
          어떤 하루를 보내고 싶나요?
        </h1>
        {/* Tighter leading than the rest of the screen: everything down to the start
            button has to fit on one 390×844 screen, and this is where the height goes. */}
        <p className="mt-3 text-[16px] leading-6 text-muted-foreground">
          AI와 대화하며 내가 바라는 2045년 인천의 일상을 상상해보세요. 들려주신
          이야기는 인천 도시계획 과정에 청년의 관점으로 전달돼요.
        </p>
        {/* These boxes absorb two paragraphs, so they have to fit in the height those
            paragraphs took: the start button below must not fold at 390×844. They read
            in Incheon Blue rather than the form's grey, which would invite a tap they
            do not answer. */}
        <ul className="mt-5 grid grid-cols-3 gap-3.5">
          {ENTRY_FACTS.map(({ Icon, text }) => (
            <li
              // The gap is wider than the padding the square is left with, so the
              // air sits between icon and label instead of banding top and bottom.
              className="flex aspect-square flex-col items-center justify-center gap-4 rounded-2xl bg-secondary px-[3px] text-center text-secondary-foreground"
              key={text}
            >
              <Icon aria-hidden="true" className="size-8 shrink-0" />
              {/* Korean breaks anywhere by default, which splits these labels
                  mid-word in a box this narrow. */}
              <span className="text-[15px] leading-[1.28] font-bold break-keep">
                {text}
              </span>
            </li>
          ))}
        </ul>
        {/* Names the collector before the consent rather than inside it: someone asked for
            their time and their answers should not have to open a disclosure to find out
            who is asking. The notice stops short of it, so it is readable throughout. */}
        <p className="mt-5 text-[13px] leading-5 break-keep text-muted-foreground">
          {RESEARCHERS}. 문의{" "}
          <a
            className="underline underline-offset-2"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>

      <form className="flex shrink-0 grow flex-col pt-4" onSubmit={submit}>
        {/* The notice is anchored to the bottom of this region and may grow to fill it, so
            what limits its reach is the region's own top — set just under the line naming
            the collector — rather than a measured height. */}
        <div className="relative flex grow flex-col justify-end">
          <label className="sr-only" htmlFor="birth-year">
            출생연도
          </label>
          <div className="relative">
            <input
              id="birth-year"
              aria-describedby={invalid ? "birth-year-error" : undefined}
              aria-invalid={invalid}
              autoComplete="bday-year"
              className="h-14 w-full rounded-2xl bg-muted px-4 text-base font-semibold outline-none transition focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/35 disabled:cursor-not-allowed"
              disabled={pending}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => {
                if (/^\d{0,4}$/.test(event.target.value)) {
                  setBirthYear(event.target.value);
                }
              }}
              placeholder="출생연도"
              value={birthYear}
            />
            {/* Not a label for pointer purposes, so clicks fall through to the field. */}
            <p
              id="birth-year-error"
              className={`pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[12px] whitespace-nowrap text-muted-foreground ${invalid ? "visible" : "invisible"}`}
            >
              1987~2010년생이 참여할 수 있어요
            </p>
          </div>
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

          {/* Holds the closed notice's height in the flow while the notice itself is taken
              out of it. Copying the row is what makes the reservation exact at any width,
              including one where the sentence wraps. */}
          <div aria-hidden="true" className="invisible mt-3 rounded-2xl p-3">
            <div className="flex gap-2">
              <p className="min-w-0 flex-1 text-[14px] leading-6 font-semibold">
                {CONSENT_LINE}
              </p>
              <span className="size-4 shrink-0" />
            </div>
          </div>

          {/* The notice itself: one box, bottom pinned where the closed one sits, growing
              upward over the fields as its text unfolds. Card white under the translucent
              grey keeps it opaque, so what it covers does not read through it. */}
          <div className="absolute inset-x-0 bottom-0 flex max-h-full flex-col rounded-2xl bg-card">
            <div className="flex min-h-0 flex-col rounded-2xl bg-muted/60 p-3">
              <div
                className={`grid min-h-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${noticeOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                id="privacy-detail"
                inert={!noticeOpen}
              >
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="min-h-0 overflow-y-auto">
                    {/* Every collected item has to be named here (PLAN 8). One paragraph
                        rather than two, and it scrolls if the screen is too short. */}
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      유스플랜AI는 출생연도, 성별, 인터뷰 대화 내용, 대화 중
                      말한 별명·거주 지역·꿈 또는 직업, 만족도 답변 2개, 기기
                      식별 토큰, IP주소, 기기·브라우저 정보를 수집합니다. 기기
                      식별 토큰과 IP주소는 중복 참여를 제한하는 용도로만
                      활용합니다. 대화 내용은 Anthropic과 Google의 AI로
                      처리합니다. 인터뷰 내용은 2045년 인천도시기본계획에 담을
                      청년 의견을 모으고 분석하는 데만 쓰며, 정리한 결과는
                      인천광역시에 전달합니다. 자료는 2026년 12월 31일까지
                      보관하고 폐기합니다.
                    </p>
                  </div>
                  {/* Keeps a line cut off by the scroll from sitting flush against
                      the consent sentence. It lives inside the fold so the closed
                      notice does not carry it and creep into the gender bar. */}
                  <div aria-hidden="true" className="h-3 shrink-0" />
                </div>
              </div>
              {/* The press is the consent, so this line carries the checkbox label's
                  weight, and the arrow rides its row: one arrow, in one place, whichever
                  state the notice is in. */}
              <div className="flex shrink-0 gap-2">
                <p className="min-w-0 flex-1 text-[14px] leading-6 font-semibold text-foreground">
                  {CONSENT_LINE}
                </p>
                <NoticeToggle
                  label={
                    noticeOpen
                      ? "개인정보 수집·이용 안내 접기"
                      : "개인정보 수집·이용 안내 자세히 보기"
                  }
                  onClick={() => setNoticeOpen((open) => !open)}
                  open={noticeOpen}
                />
              </div>
            </div>
          </div>
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
