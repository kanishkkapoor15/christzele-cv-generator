/**
 * Tensorix API client — uses the OpenAI-compatible chat completions endpoint.
 * Model: deepseek/deepseek-r1-0528 (reasoning model).
 *
 * WHY STREAMING:
 *   deepseek-r1 emits thousands of internal reasoning tokens before producing
 *   output. Without streaming, the HTTP connection sits idle for 60-90 seconds
 *   while the model thinks. Tensorix routes through CloudFront which times out
 *   at ~60 s (504). With stream:true, tokens flow from the first reasoning step,
 *   keeping the connection alive. We collect every delta and return the fully
 *   assembled string — callers see no difference.
 *
 * RETRY:
 *   One automatic retry (after 1.5 s) for 502/503/504 gateway errors that
 *   happen before the stream even starts (e.g. origin overload spike).
 */

const DEFAULT_BASE_URL = "https://api.tensorix.ai/v1";
const DEFAULT_MODEL = "deepseek/deepseek-r1-0528";

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TensorixCallOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Internal streaming reader.
 * Sends `stream: true`, reads the SSE response chunk by chunk,
 * and accumulates every `delta.content` token into a single string.
 */
async function readStream(res: Response): Promise<string> {
  if (!res.body) throw new Error("Tensorix API returned no response body.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; finish_reason?: string }[];
          };
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch {
          // Skip malformed SSE lines — common for keep-alive comments
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return content;
}

export async function callTensorix(opts: TensorixCallOptions): Promise<string> {
  const apiKey = process.env.TENSORIX_API_KEY;
  const baseUrl = process.env.TENSORIX_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.TENSORIX_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error(
      "TENSORIX_API_KEY is not set. Add it to .env.local at the project root."
    );
  }

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 3000,
    stream: true, // ← keeps CloudFront alive during long reasoning
  };

  // response_format is compatible with streaming on OpenAI-compatible APIs
  if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const err = new Error(
          `Tensorix API error ${res.status}: ${errText || res.statusText}`
        );
        if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
          console.warn(
            `Tensorix ${res.status} on attempt ${attempt}/${MAX_ATTEMPTS} — retrying in ${RETRY_DELAY_MS}ms…`
          );
          lastError = err;
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }

      const content = await readStream(res);

      if (!content.trim()) {
        throw new Error("Tensorix API stream completed with no content.");
      }
      return content;
    } catch (e) {
      // Re-throw network/stream errors that aren't HTTP status errors
      if (
        e instanceof Error &&
        !e.message.startsWith("Tensorix API error")
      ) {
        throw e;
      }
      lastError = e as Error;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Tensorix error on attempt ${attempt} — retrying…`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error("Tensorix call failed after all retries.");
}

/**
 * Extract JSON from a model response.
 * deepseek-r1 prepends <think>…</think> reasoning blocks and sometimes wraps
 * output in ```json fences — this strips all of that and returns pure JSON.
 *
 * Also handles truncated responses (token-budget exhaustion): if the raw JSON
 * is cut off mid-stream we attempt to close open brackets/braces so
 * JSON.parse has a fighting chance instead of throwing immediately.
 */
export function extractJSON<T = unknown>(raw: string): T {
  let s = raw.trim();

  // Strip ALL <think>…</think> blocks using a loop so we don't rely on a lazy
  // regex that misfires when the thinking itself contains JSON-like braces.
  // Also handles the edge case where deepseek-r1 emits an unclosed <think> tag
  // (truncated reasoning) — we drop everything from <think> onward in that case.
  while (s.includes("<think>")) {
    const start = s.indexOf("<think>");
    const end = s.indexOf("</think>");
    if (end !== -1) {
      // Remove the complete block and any surrounding whitespace
      s = (s.slice(0, start) + s.slice(end + 8)).trim();
    } else {
      // No closing tag — truncate at the opening tag
      s = s.slice(0, start).trim();
      break;
    }
  }

  // Strip ```json … ``` fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // Grab the outermost { … } block (handles any remaining leading text)
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  } else if (first !== -1) {
    // Only an opening brace found — response was truncated. Take everything
    // from the first { and attempt repair below.
    s = s.slice(first);
  }

  // First attempt: parse as-is
  try {
    return JSON.parse(s) as T;
  } catch {
    // Second attempt: repair truncated JSON by closing unclosed structures.
    // Walk the string tracking open brackets/braces and whether we are inside
    // a string literal, then append the necessary closing tokens.
    const repaired = repairTruncatedJSON(s);
    return JSON.parse(repaired) as T;
  }
}

/**
 * Best-effort repair of a truncated JSON string.
 * Tracks open objects/arrays and unclosed string literals, then appends
 * the minimum tokens needed to make the JSON syntactically valid.
 */
function repairTruncatedJSON(s: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (inString) {
      if (ch === "\\" ) {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') { inString = true; }
      else if (ch === "{") { stack.push("{"); }
      else if (ch === "[") { stack.push("["); }
      else if (ch === "}") { stack.pop(); }
      else if (ch === "]") { stack.pop(); }
    }
    i++;
  }

  let result = s;

  // If we ended inside a string, close it
  if (inString) result += '"';

  // Close any trailing comma before closing structures (invalid JSON)
  result = result.replace(/,\s*$/, "");

  // Close open structures in reverse order
  for (let j = stack.length - 1; j >= 0; j--) {
    result += stack[j] === "{" ? "}" : "]";
  }

  return result;
}
