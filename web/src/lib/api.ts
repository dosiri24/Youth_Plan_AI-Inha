import {
  AccessDenied,
  readAccessCode,
  rejectAccessCode,
} from "@/lib/access-code";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

const GATED_PATH = /^\/api\/(dev|admin)\//;

export type SessionState = "continue" | "ended" | "aborted";

export type InterviewEnd = { state: SessionState; progress: number };

export type InterviewEvent =
  { type: "delta"; text: string } | ({ type: "end" } & InterviewEnd);

type SessionResponse = {
  session_id: string;
};

export type DevFixture = {
  name: string;
  label: string;
};

export type TranscriptMessage = {
  turn: number;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

export type AxisName = "AC" | "UN" | "OW" | "FH";
export type AxisLetter = "A" | "C" | "U" | "N" | "O" | "W" | "F" | "H";

export type AxisResult = {
  axis: AxisName;
  letter: AxisLetter;
  strength: number;
  /** True when nothing in the interview scored this axis, so 51 is a default, not a tie. */
  empty_axis: boolean;
};

export type TypeResult = {
  code: string;
  axes: AxisResult[];
};

/** "other" holds both a different gender and a participant who declined to say. */
export type Gender = "male" | "female" | "other";

export type SelfInfo = {
  nickname: string;
  birth_year: number;
  age_2040: number;
  gender: Gender;
  /** What the participant actually said; the backend never corrects it. */
  raw_region: string;
  /** The 2026 district the backend resolved for aggregation, or empty. */
  normalized_region: string;
  region_table_version: string;
  /** Filled only when the participant named a dong themselves. */
  dong: string;
  dream_or_job: string;
};

/** A verbatim participant sentence the backend matched back to its own turn. */
export type Quote = {
  text: string;
  turn: number;
};

export type Demand = {
  id: string;
  title: string;
  description: string[];
  quotes: Quote[];
};

export type AxisDemand = {
  axis: AxisName;
  letter: AxisLetter;
  demands: Demand[];
};

export type AxisReason = {
  axis: AxisName;
  letter: AxisLetter;
  reason: string;
};

export type PersonalReport = {
  session_id: string;
  self_info: SelfInfo;
  summary: string[];
  axis_reasons: AxisReason[];
  axis_demands: AxisDemand[];
  meta: {
    turn_count: number;
    revision_count: number;
    created_at: string;
  };
};

export type ResultResponse = {
  type_result: TypeResult;
  report: PersonalReport;
};

export type RevisionSelection = {
  axis: AxisName;
  demand_id: string;
  sentence_index: number;
};

/**
 * Every call funnels through here so no gated path can forget the access code.
 * `ownsForbidden` is for the one route that answers 403 to a second code sent in
 * the body, where the header code the gate already cleared must stay untouched.
 */
async function call(
  path: string,
  init: RequestInit,
  ownsForbidden = false,
): Promise<Response> {
  const gated = GATED_PATH.test(path);
  const code = gated ? readAccessCode() : null;
  const headers = init.headers as Record<string, string> | undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: code === null ? headers : { ...headers, "X-Access-Code": code },
  });

  if (gated && !ownsForbidden && response.status === 403) {
    rejectAccessCode();
    throw new AccessDenied("Access code rejected");
  }

  return response;
}

/** A shared status gate prevents screens from inventing recovery paths. */
async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await call(path, init);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response;
}

/** Malformed frames must fail before partial content reaches the transcript. */
function parseFrame(frame: string): InterviewEvent | null {
  if (!frame.trim()) return null;

  const lines = frame.split(/\r?\n/);
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));

  if (!eventLine || !dataLine) {
    throw new Error("Invalid SSE frame");
  }

  const event = eventLine.slice(6).trim();
  const data: unknown = JSON.parse(dataLine.slice(5).trim());

  if (
    event === "delta" &&
    typeof data === "object" &&
    data !== null &&
    "text" in data &&
    typeof data.text === "string"
  ) {
    return { type: "delta", text: data.text };
  }

  if (
    event === "end" &&
    typeof data === "object" &&
    data !== null &&
    "state" in data &&
    (data.state === "continue" ||
      data.state === "ended" ||
      data.state === "aborted") &&
    "progress" in data &&
    typeof data.progress === "number"
  ) {
    return { type: "end", state: data.state, progress: data.progress };
  }

  throw new Error("Unknown SSE event");
}

/** Network chunks do not preserve the backend's SSE frame boundaries. */
async function* readEvents(response: Response): AsyncGenerator<InterviewEvent> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary) {
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const event = parseFrame(frame);

      if (event) {
        ended ||= event.type === "end";
        yield event;
      }

      boundary = /\r?\n\r?\n/.exec(buffer);
    }

    if (done) break;
  }

  const finalEvent = parseFrame(buffer);
  if (finalEvent) {
    ended ||= finalEvent.type === "end";
    yield finalEvent;
  }

  if (!ended) {
    throw new Error("SSE stream ended without an end event");
  }
}

/** POST streams require fetch because EventSource cannot send this request shape. */
async function* openStream(
  path: string,
  body: string | undefined,
  signal: AbortSignal,
): AsyncGenerator<InterviewEvent> {
  const response = await request(path, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    signal,
  });

  yield* readEvents(response);
}

export type VisitPage = "participant" | "admin";

/** Fire-and-forget: a lost visit ping must never affect the screen flow. */
export function recordVisit(page: VisitPage): void {
  void call("/api/visits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page }),
  }).catch(() => {});
}

/** The client intentionally retains only a volatile session identifier. */
export async function createSession(
  birthYear: number,
  gender: Gender,
): Promise<string> {
  const response = await request("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ birth_year: birthYear, gender }),
  });
  const data = (await response.json()) as SessionResponse;

  return data.session_id;
}

/** Developer listings exclude transcript content until a fixture is selected. */
export async function listDevFixtures(): Promise<DevFixture[]> {
  const response = await request("/api/dev/fixtures", { method: "GET" });

  return (await response.json()) as DevFixture[];
}

/** Loaded messages replace only the active session's conversation state. */
export async function loadDevFixture(
  sessionId: string,
  name: string,
): Promise<TranscriptMessage[]> {
  const response = await request(`/api/dev/sessions/${sessionId}/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  return (await response.json()) as TranscriptMessage[];
}

/** Greeting and replies share one transport contract to keep UI state simple. */
export function startInterview(
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<InterviewEvent> {
  return openStream(`/api/sessions/${sessionId}/start`, undefined, signal);
}

/** Backend end states must remain visible to the screen controller. */
export function sendMessage(
  sessionId: string,
  text: string,
  signal: AbortSignal,
): AsyncGenerator<InterviewEvent> {
  return openStream(
    `/api/sessions/${sessionId}/messages`,
    JSON.stringify({ text }),
    signal,
  );
}

/** The server owns the evidence of a turn, so undoing one cannot be a client-side edit. */
export async function undoTurn(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}/turns/last`, { method: "DELETE" });
}

/** Deletion is reserved for explicit abandonment rather than recovery. */
export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

/** Result generation remains a one-shot request even though its tracks are separate. */
export async function generateResult(
  sessionId: string,
): Promise<ResultResponse> {
  const response = await request(`/api/sessions/${sessionId}/result`, {
    method: "POST",
  });

  return (await response.json()) as ResultResponse;
}

/** Sentence positions keep revision input separate from fixed report text. */
export async function reviseResult(
  sessionId: string,
  selectedSentences: RevisionSelection[],
  comment: string,
): Promise<PersonalReport> {
  const response = await request(`/api/sessions/${sessionId}/result/revise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      selected_sentences: selectedSentences,
      comment,
    }),
  });

  return (await response.json()) as PersonalReport;
}

/** Submission returns no result data so the held client state stays authoritative. */
export async function submitResult(sessionId: string): Promise<string> {
  const response = await request(`/api/sessions/${sessionId}/submit`, {
    method: "POST",
  });
  const data = (await response.json()) as { submission_id: string };

  return data.submission_id;
}

export type Evidence = {
  axis: AxisName;
  pole: AxisLetter;
  weight: number;
  text: string;
  turn: number;
};

export type AxisResultFull = AxisResult & {
  scores: Record<string, number>;
  evidence: Evidence[];
};

export type TypeResultFull = {
  code: string;
  axes: AxisResultFull[];
};

/** The three kinds of place the structuring call may attach to a demand. */
export type PlaceKind = "거주지" | "활동 장소" | "문제 장소";

/** A place a participant named, kept with the turn that carried it. */
export type ReportPlace = {
  text: string;
  turn: number;
  kind: PlaceKind;
  /** Empty when the place could not be settled into one of the eleven districts. */
  district: string;
};

export type DemandFull = Demand & {
  places: ReportPlace[];
};

export type AxisDemandFull = {
  axis: AxisName;
  letter: AxisLetter;
  demands: DemandFull[];
};

/** The one demand the participant picked when asked which should come first. */
export type TopDemand = {
  /** Empty when the closing question never ran or the participant declined to pick. */
  title: string;
  reason: string[];
  quotes: Quote[];
  /** The axis demand this choice matched, or empty when it matched none. */
  demand_id: string;
};

/** Each field is filled only from an explicit participant sentence, else empty. */
export type SettlementIntent = Record<SettlementField, "인천" | "타지" | "">;

export type PersonalReportFull = Omit<PersonalReport, "axis_demands"> & {
  axis_demands: AxisDemandFull[];
  settlement: SettlementIntent;
  top_demand: TopDemand;
  /** What the participant said about trusting the survey itself, kept verbatim. */
  participation_notes: Quote[];
};

export type SubmissionSummary = {
  submission_id: string;
  submitted_at: string;
  nickname: string;
  region: string;
  type_code: string;
  turn_count: number;
  revision_count: number;
};

export type SubmissionDetail = {
  submission_id: string;
  session_id: string;
  submitted_at: string;
  self_info: SelfInfo;
  raw_transcript: TranscriptMessage[];
  evidence_log: Evidence[];
  type_result: TypeResultFull;
  report: PersonalReportFull;
  /** Demands found outside the four axes, and null until that pass has run. */
  extra_demands: DemandFull[] | null;
  /** Demand id to its plan sector, and null until the labelling call has run. */
  sectors: Record<string, SectorLabel> | null;
  deidentified: unknown;
};

/** A sub-sector qualifies its chapter; every aggregate still counts by chapter. */
export type SectorLabel = { sector: string; subsector: string };

export type AxisPoleStat = {
  letter: AxisLetter;
  count: number;
  mean_strength: number;
};

export type AxisStat = {
  axis: AxisName;
  poles: AxisPoleStat[];
  submission_ids: string[];
};

export type AxisPoleSummary = {
  letter: AxisLetter;
  sentences: string[];
};

export type RepresentativeQuote = {
  quote_id: string;
  submission_id: string;
  text: string;
};

export type AxisSummary = {
  axis: AxisName;
  poles: AxisPoleSummary[];
  quotes: RepresentativeQuote[];
};

export type DashboardKpi = {
  participants: number;
  demands: number;
  regions: number;
  age_min: number;
  age_max: number;
};

export type AgeBand = {
  band: string;
  male: number;
  female: number;
  other: number;
  total: number;
};

/** One chapter of the 2040 plan, which is the unit every sector aggregate counts by. */
export type SectorStat = {
  sector: string;
  demands: number;
  people: number;
};

/** A district a demand named. `district` is empty when it could not be settled. */
export type DemandPlace = { text: string; district: string };

export type PersonDemand = {
  /** Empty for a demand found outside the four axes by the extra-demand pass. */
  axis: AxisName | "";
  /** Already de-identified, as is every place text below it. */
  title: string;
  /** Empty until the sector labelling call has run for this submission. */
  sector: string;
  subsector: string;
  /** Empty when the labelling call attached no keyword to this demand. */
  keywords: string[];
  /** The one demand the participant picked when asked what should come first. */
  top: boolean;
  places: DemandPlace[];
};

/** One keyword and how many participants said it, not how many times it was said. */
export type KeywordStat = {
  keyword: string;
  /** Participants, so a keyword said twice by one person still counts once. */
  people: number;
  /** The plan chapter this keyword landed in most often. Never empty. */
  sector: string;
  /**
   * The same head count split by plan chapter, which is what lets the bubble card
   * narrow to one of them. Chapters where nobody tied this keyword to the chapter
   * are left out rather than carried as zeroes, and the whole field is missing from
   * runs analysed before it existed. Read it only through `headsIn` in
   * `admin/keyword-bubbles.tsx`, which also covers those older runs.
   *
   * These do not add up to `people` and must never be summed into a denominator:
   * one participant who raised the same keyword under two chapters counts once in
   * `people` and once under each of the two.
   */
  sector_people?: Record<string, number>;
};

export type TopDemandItem = {
  submission_id: string;
  title: string;
  reason: string[];
  sector: string;
  subsector: string;
  /** Empty on a submission labelled before keywords joined the sector call. */
  keywords: string[];
};

/** What each participant named when asked which one demand should come first. */
export type TopDemands = {
  by_sector: { sector: string; count: number }[];
  items: TopDemandItem[];
};

export type SettlementField = "residence" | "work" | "leisure";

export type SettlementCounts = { 인천: number; 타지: number };

/** Only participants who said it themselves are counted, so `answered` is the base. */
export type Settlement = {
  residence: SettlementCounts;
  work: SettlementCounts;
  leisure: SettlementCounts;
  answered: Record<SettlementField, number>;
  participants: number;
};

export type DashboardPerson = {
  submission_id: string;
  nickname: string;
  gender: Gender;
  age: number;
  region: string;
  /** What the participant said, which survives even when `region` could not be settled. */
  raw_region: string;
  /** Filled only when the participant named a dong themselves. */
  dong: string;
  /** "인천", "타지", or empty. Submissions from before this round carry no key at all. */
  settlement: Partial<Record<SettlementField, string>>;
  code: string;
  turns: number;
  submitted_at: string;
  summary: string;
  /** Axis demands and extra demands in one list, and empty without a blinded copy. */
  demands: PersonDemand[];
  reasons: AxisReason[];
};

export type AiNoteCard = "map" | "topics" | "axes" | "cross" | "keywords";

/** The four data sections of the briefing. The cover map carries no lead or read. */
export type BriefingSectionKey = "topics" | "axes" | "cross" | "types";

export type BriefingFinding = { title: string; body: string };

export type BriefingTension = {
  title: string;
  body: string;
  left_label: string;
  right_label: string;
  left_quotes: RepresentativeQuote[];
  right_quotes: RepresentativeQuote[];
};

export type BriefingImplication = { topic: string; question: string };

export type Briefing = {
  headline: string;
  findings: BriefingFinding[];
  /** What this particular sample was actually like, written from run metadata. */
  sample: string;
  leads: Record<BriefingSectionKey, string>;
  reads: Record<BriefingSectionKey, string>;
  tensions: BriefingTension[];
  implications: BriefingImplication[];
};

export type BriefingQuote = {
  quote_id: string;
  submission_id: string;
  axis: AxisName;
  letter: AxisLetter;
  /** Empty until the sector labelling call has run for this submission. */
  sector: string;
  /** Empty when the interview never resolved one of the eleven districts. */
  region: string;
  /** Empty when the participant falls outside the four youth age bands. */
  age_band: string;
  demand_title: string;
  text: string;
};

export type AnalysisRun = {
  run_id: string;
  executed_at: string;
  input_submission_ids: string[];
  axis_stats: AxisStat[];
  type_distribution: Record<string, number>;
  axis_summaries: AxisSummary[];
  /**
   * Dashboard aggregates arrived in Phase 10 and older runs were not migrated,
   * so every field below is absent until the next analysis run.
   */
  kpi?: DashboardKpi;
  ages?: AgeBand[];
  regions_count?: Record<string, number>;
  sectors?: SectorStat[];
  /** Keyed by sector name, and a sector with no demands is left out entirely. */
  cross?: Record<string, number[]>;
  top_demands?: TopDemands;
  settlement?: Settlement;
  /** Districts named inside demands, counted per mention rather than per participant. */
  places?: Record<string, number>;
  /** Every keyword, by people descending then keyword ascending. The card draws a slice. */
  keywords?: KeywordStat[];
  people?: DashboardPerson[];
  ai_notes?: Partial<Record<AiNoteCard, string>>;
  /** Absent on runs from before the briefing, and null when its one call failed. */
  briefing?: Briefing | null;
  quotes?: BriefingQuote[];
};

export type ActivityTotals = {
  visit_participant: number;
  visit_admin: number;
  interview_start: number;
  result_view: number;
  submission: number;
};

export type ActivityEvent = {
  /** KST ISO 8601, so the screen can slice it without a timezone conversion. */
  ts: string;
  type: keyof ActivityTotals;
  ip: string;
  device: string;
  browser: string;
};

export type ActivityResponse = {
  totals: ActivityTotals;
  /** Newest first, as the backend orders it. */
  events: ActivityEvent[];
};

/** Cumulative counts plus the full access log for the admin activity screen. */
export async function getActivity(): Promise<ActivityResponse> {
  const response = await request("/api/admin/activity", { method: "GET" });

  return (await response.json()) as ActivityResponse;
}

/** The admin table reads store summaries without loading full transcripts. */
export async function listSubmissions(): Promise<SubmissionSummary[]> {
  const response = await request("/api/admin/submissions", { method: "GET" });

  return (await response.json()) as SubmissionSummary[];
}

/** Dev mode seeds fixed-id example submissions so repeated calls do not duplicate. */
export async function seedSubmissions(): Promise<string[]> {
  const response = await request("/api/dev/submissions/seed", {
    method: "POST",
  });

  return (await response.json()) as string[];
}

/** A missing submission returns null so the detail page can guide back to the list. */
export async function getSubmission(
  submissionId: string,
): Promise<SubmissionDetail | null> {
  const response = await call(`/api/admin/submissions/${submissionId}`, {
    method: "GET",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as SubmissionDetail;
}

/** The body code is a separate confirmation, so its rejection stays on the dialog. */
export async function deleteSubmission(
  submissionId: string,
  accessCode: string,
): Promise<"ok" | "denied"> {
  const response = await call(
    `/api/admin/submissions/${submissionId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_code: accessCode }),
    },
    true,
  );

  if (response.status === 403) return "denied";
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return "ok";
}

/** An empty store answers 409, which is guidance to seed rather than a failure. */
export async function runAnalysis(): Promise<"ok" | "empty"> {
  const response = await call("/api/admin/analysis/run", { method: "POST" });

  if (response.status === 409) return "empty";
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return "ok";
}

/** No analysis yet returns null so the report keeps the static guidance visible. */
export async function getLatestAnalysis(): Promise<AnalysisRun | null> {
  const response = await call("/api/admin/analysis/latest", { method: "GET" });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as AnalysisRun;
}
