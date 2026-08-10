const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** One formatter keeps every admin timestamp reading the same way. */
export function formatDateTime(value: string): string {
  return DATE_TIME.format(new Date(value));
}
