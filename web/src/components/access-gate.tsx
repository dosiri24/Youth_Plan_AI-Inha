"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { AccessCodeForm } from "@/components/access-code-form";
import {
  readAccessCode,
  saveAccessCode,
  subscribeAccessCode,
  wasCodeRejected,
} from "@/lib/access-code";

/** The server cannot read sessionStorage, so the first render knows nothing yet. */
const unknownCode = () => undefined;

/** One gate above the admin pages keeps the code question out of every page. */
export function AccessGate({ children }: { children: ReactNode }) {
  const code = useSyncExternalStore(
    subscribeAccessCode,
    readAccessCode,
    unknownCode,
  );

  if (code === undefined) return null;
  if (code !== null) return <>{children}</>;

  return (
    <section className="mx-auto mt-20 max-w-[400px] rounded-3xl bg-card px-9 py-10">
      <h1 className="text-[24px] font-bold tracking-[-0.02em]">
        코드를 입력해 주세요
      </h1>
      <p className="mt-3 mb-8 text-[15px] leading-7 text-muted-foreground">
        운영 대시보드는 코드를 아는 사람만 볼 수 있습니다.
      </p>
      <AccessCodeForm
        message={
          wasCodeRejected() ? "코드가 맞지 않습니다. 다시 입력해 주세요." : null
        }
        onSubmit={saveAccessCode}
        pending={false}
      />
    </section>
  );
}
