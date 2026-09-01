const STORAGE_KEY = "device-token";

/** Return a stable per-browser id, falling back to a per-visit one so refused storage never blocks participation. */
export function readDeviceToken(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    const token = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, token);

    return token;
  } catch {
    return crypto.randomUUID();
  }
}
