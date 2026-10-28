/**
 * Talks to the website's chat route (src/app/api/chat/route.ts) from the app.
 *
 * The route answers with the AI SDK's UI message stream: server-sent events,
 * each `data:` line holding a JSON chunk. Only the text deltas matter on a
 * phone; tool progress is reported as a short status line. The Convex auth
 * token goes in an `Authorization: Bearer` header because the app has no
 * cookies.
 */
import { fetch } from "expo/fetch";
import { webUrl } from "../convex";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
};

export function newChatId(): string {
  return `chat_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function messageText(m: ChatMessage): string {
  return m.parts.map((p) => p.text).join("");
}

type Chunk = { type?: string; delta?: string; errorText?: string; toolName?: string };

/**
 * Sends the conversation and calls back with the reply as it grows.
 * Resolves with the full reply text; throws with a readable message on failure.
 */
export async function streamReply(opts: {
  token: string;
  chatId: string;
  messages: ChatMessage[];
  onText: (text: string) => void;
  onStatus: (status: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  if (!webUrl) throw new Error("The assistant is not available in this build. The website address is not set.");

  const res = await fetch(`${webUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ id: opts.chatId, messages: opts.messages, trigger: "submit-message" }),
    signal: opts.signal,
  });

  if (res.status === 401) throw new Error("Your session has expired. Sign in again to use the assistant.");
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new Error(detail || "The assistant could not answer just now. Try again in a moment.");
  }

  let text = "";
  let buffer = "";
  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(payload) as Chunk;
    } catch {
      return;
    }
    if (chunk.type === "text-delta" && chunk.delta) {
      text += chunk.delta;
      opts.onStatus("");
      opts.onText(text);
    } else if (chunk.type === "tool-input-start") {
      opts.onStatus(statusFor(chunk.toolName));
    } else if (chunk.type === "error") {
      throw new Error(chunk.errorText || "The assistant ran into a problem.");
    }
  };

  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    handleLine(buffer);
  } else {
    // No streaming body on this platform: read the whole response at once.
    (await res.text()).split("\n").forEach(handleLine);
  }
  return text;
}

/** The same friendly tool names the website shows while the assistant works. */
const TOOL_LABELS: Record<string, string> = {
  getDashboardSummary: "Pulling dashboard stats",
  searchLeads: "Searching leads",
  getLeadDetails: "Loading lead details",
  listUpcomingTasks: "Checking upcoming tasks",
  listPipelineStages: "Looking up pipeline stages",
  moveLeadStage: "Moving lead to new stage",
  updateLeadNotes: "Updating lead notes",
};

function statusFor(tool?: string) {
  return (tool && TOOL_LABELS[tool]) || "Working on it";
}
