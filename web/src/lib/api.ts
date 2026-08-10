const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

export type SessionState = "continue" | "ended" | "aborted";

export type InterviewEvent =
  { type: "delta"; text: string } | { type: "end"; state: SessionState };

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
};

export type TypeResult = {
  code: string;
  axes: AxisResult[];
};

export type SelfInfo = {
  nickname: string;
  birth_year: number;
  age_2040: number;
  region: string;
  dream_or_job: string;
};

export type Demand = {
  id: string;
  title: string;
  description: string[];
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

/** A shared status gate prevents screens from inventing recovery paths. */
async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

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
      data.state === "aborted")
  ) {
    return { type: "end", state: data.state };
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

/** The client intentionally retains only a volatile session identifier. */
export async function createSession(birthYear: number): Promise<string> {
  const response = await request("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ birth_year: birthYear }),
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

export type Quote = {
  text: string;
  turn: number;
};

export type DemandFull = Demand & {
  quotes: Quote[];
  topics: string[];
};

export type AxisDemandFull = {
  axis: AxisName;
  letter: AxisLetter;
  demands: DemandFull[];
};

export type PersonalReportFull = Omit<PersonalReport, "axis_demands"> & {
  axis_demands: AxisDemandFull[];
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
  deidentified: unknown;
};

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

export type AnalysisRun = {
  run_id: string;
  executed_at: string;
  input_submission_ids: string[];
  axis_stats: AxisStat[];
  type_distribution: Record<string, number>;
  axis_summaries: AxisSummary[];
};

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
  const response = await fetch(
    `${API_BASE_URL}/api/admin/submissions/${submissionId}`,
    { method: "GET" },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as SubmissionDetail;
}

/** The analysis pipeline lands in Phase 5, so 501 is a known not-ready signal. */
export async function runAnalysis(): Promise<"ok" | "not_ready"> {
  const response = await fetch(`${API_BASE_URL}/api/admin/analysis/run`, {
    method: "POST",
  });

  if (response.status === 501) return "not_ready";
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return "ok";
}

/** No analysis yet returns null so the report keeps the static guidance visible. */
export async function getLatestAnalysis(): Promise<AnalysisRun | null> {
  const response = await fetch(`${API_BASE_URL}/api/admin/analysis/latest`, {
    method: "GET",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return (await response.json()) as AnalysisRun;
}
