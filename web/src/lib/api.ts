const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type EchoResponse = {
  reply: string;
  model: string;
};

export async function sendEcho(text: string): Promise<EchoResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dev/echo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Echo request failed with status ${response.status}`);
  }

  return response.json();
}
