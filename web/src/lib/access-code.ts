const STORAGE_KEY = "access-code";

const listeners = new Set<() => void>();

let rejected = false;

/** A wrong code is not a transport failure, so screens must tell the two apart. */
export class AccessDenied extends Error {}

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** sessionStorage keeps the code only until the tab closes. */
export function readAccessCode(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

/** Storing on entry lets later gated calls reuse the code without asking again. */
export function saveAccessCode(code: string): void {
  sessionStorage.setItem(STORAGE_KEY, code);
  rejected = false;
  notify();
}

/** A 403 is the only signal that the code was wrong, so the stored value drops. */
export function rejectAccessCode(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  rejected = true;
  notify();
}

/** The gate shows why it is asking again without owning the code itself. */
export function wasCodeRejected(): boolean {
  return rejected;
}

/** The admin gate re-reads the code whenever it is stored or rejected. */
export function subscribeAccessCode(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
