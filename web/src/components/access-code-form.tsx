"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type AccessCodeFormProps = {
  pending: boolean;
  message: string | null;
  onSubmit: (code: string) => void;
};

/** Both entry points ask for the same four digits, so the field lives in one place. */
export function AccessCodeForm({
  pending,
  message,
  onSubmit,
}: AccessCodeFormProps) {
  const [code, setCode] = useState("");
  const ready = /^\d{4}$/.test(code);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;

    onSubmit(code);
  };

  return (
    <form onSubmit={submit}>
      <label
        className="block text-[14px] font-bold text-foreground"
        htmlFor="access-code"
      >
        접근 코드
      </label>
      <input
        id="access-code"
        aria-describedby={message === null ? undefined : "access-code-message"}
        aria-invalid={message !== null}
        autoComplete="off"
        className="mt-2.5 h-14 w-full rounded-2xl bg-muted px-4 text-base font-semibold tracking-[0.35em] outline-none transition focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/35 disabled:cursor-not-allowed"
        disabled={pending}
        inputMode="numeric"
        maxLength={4}
        onChange={(event) => {
          if (/^\d{0,4}$/.test(event.target.value)) setCode(event.target.value);
        }}
        placeholder="숫자 네 자리"
        value={code}
      />
      <p
        id="access-code-message"
        className={`mt-2 min-h-5 text-[13px] text-muted-foreground ${message === null ? "invisible" : "visible"}`}
        role="alert"
      >
        {message}
      </p>
      <Button
        className="mt-4 h-14 w-full rounded-2xl text-base font-bold"
        disabled={!ready || pending}
        type="submit"
      >
        {pending ? "확인 중" : "확인"}
      </Button>
    </form>
  );
}
