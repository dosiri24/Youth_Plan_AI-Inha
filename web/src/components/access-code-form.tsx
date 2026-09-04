"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type AccessCodeFormProps = {
  pending: boolean;
  message: string | null;
  onSubmit: (code: string) => void;
};

/**
 * Both entry points share this field. Its length and alphabet belong to the deployed
 * `access_code` and are never guessed here (PLAN 6.2) — the real value is a long random
 * string, and a shape check in the browser only locks the operator out of their own gate.
 */
export function AccessCodeForm({
  pending,
  message,
  onSubmit,
}: AccessCodeFormProps) {
  const [code, setCode] = useState("");
  const ready = code.trim() !== "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;

    // A pasted code carries the whitespace it was copied with, and the server compares
    // the bytes exactly.
    onSubmit(code.trim());
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
        // A phone capitalizes the first letter and corrects what it reads as a typo,
        // either of which silently changes a case-sensitive random code.
        autoCapitalize="off"
        autoCorrect="off"
        className="mt-2.5 h-14 w-full rounded-2xl bg-muted px-4 text-base font-semibold tracking-[0.02em] outline-none transition focus:ring-2 focus:ring-primary/20 aria-invalid:ring-2 aria-invalid:ring-incheon-gray/35 disabled:cursor-not-allowed"
        disabled={pending}
        onChange={(event) => setCode(event.target.value)}
        placeholder="받은 코드를 붙여 넣으세요"
        spellCheck={false}
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
