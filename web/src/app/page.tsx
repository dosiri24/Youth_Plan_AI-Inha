"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { sendEcho, type EchoResponse } from "@/lib/api";

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<EchoResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = text.trim();
    if (!value || pending) return;

    setPending(true);
    setResult(null);

    try {
      setResult(await sendEcho(value));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (failed) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-50 px-5 py-10">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">
            일시적인 오류가 발생했습니다
          </h1>
          <Button
            className="mt-8 h-12 w-full rounded-xl text-base"
            onClick={() => {
              setFailed(false);
              setText("");
              setResult(null);
            }}
          >
            처음 화면으로 돌아가기
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-5 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          0단계 개발 확인용 화면
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-sky-700">유스플랜AI</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            인천의 미래를 AI와 연결합니다
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            프론트엔드와 AI 서버의 실제 왕복 연결을 확인하는 임시 개발
            화면입니다. 정식 인터뷰 화면은 이후 단계에서 이 화면을 대체합니다.
          </p>
        </div>

        <form className="mt-8 space-y-3" onSubmit={submit}>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="message"
          >
            AI에게 보낼 메시지
          </label>
          <input
            id="message"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-3 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
            placeholder="안녕하세요"
            value={text}
          />
          <Button
            className="h-12 w-full rounded-xl bg-sky-600 text-base hover:bg-sky-700"
            disabled={pending || !text.trim()}
            type="submit"
          >
            {pending ? "응답을 기다리는 중..." : "메시지 보내기"}
          </Button>
        </form>

        {result && (
          <section
            aria-live="polite"
            className="mt-6 rounded-2xl bg-slate-50 p-5"
          >
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              AI 응답
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
              {result.reply}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              사용 모델: {result.model}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
