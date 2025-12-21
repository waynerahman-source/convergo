// C:\Users\Usuario\Projects\convergo\lib\engines\wpArticleEngine.ts
type Role = "user" | "assistant";

type Msg = {
  role: Role;
  content: string;
  createdAt: Date;
};

type WpPostResponse = {
  id: number;
  link?: string;
};

class WpError extends Error {
  public readonly status: number;
  public readonly bodyText: string;

  constructor(status: number, bodyText: string, message?: string) {
    super(message ?? `WP error ${status}`);
    this.name = "WpError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function encodeBasicAuth(username: string, appPassword: string): string {
  const cleanedPassword = appPassword.replace(/\s+/g, "");
  return Buffer.from(`${username}:${cleanedPassword}`).toString("base64");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTranscript(messages: Msg[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
}

type FetchResult = {
  res: Response;
  ms: number;
  text: string;
};

async function fetchTextWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<FetchResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    const text = await res.text();
    return { res, text, ms: Date.now() - t0 };
  } catch (err) {
    const ms = Date.now() - t0;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    // Preserve original error but include elapsed ms for debugging
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error after ${ms}ms: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

function isRetryableWpStatus(status: number): boolean {
  // Retry on transient WP/infrastructure failures only
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function wpCreateDraft(title: string, contentHtml: string, requestId?: string): Promise<WpPostResponse> {
  const base = normalizeBaseUrl(mustEnv("WP_BASE_URL"));
  const username = mustEnv("WP_USERNAME");
  const appPassword = mustEnv("WP_APP_PASSWORD");

  const auth = encodeBasicAuth(username, appPassword);
  const url = `${base}/wp-json/wp/v2/posts`;

  const timeoutMs = Number(process.env.WP_TIMEOUT_MS ?? "15000");
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;

  const payload = JSON.stringify({
    title,
    content: contentHtml,
    status: "draft",
  });

  const attempt = async (attemptNo: number) => {
    const { res, text, ms } = await fetchTextWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
      },
      effectiveTimeout
    );

    const head = text.slice(0, 250);

    if (!res.ok) {
      // Log server-side details for debugging, but throw typed error up the chain.
      console.error(`[wp:createDraft][${requestId ?? "n/a"}] WP not ok`, {
        attempt: attemptNo,
        status: res.status,
        ms,
        bodyHead: head,
      });
      throw new WpError(res.status, text, `WP error ${res.status}: ${head}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`WP returned non-JSON response (status ${res.status}): ${head}`);
    }

    if (!isRecord(data) || typeof data["id"] !== "number") {
      throw new Error(`WP response missing expected fields: ${head}`);
    }

    console.info(`[wp:createDraft][${requestId ?? "n/a"}] ok`, {
      attempt: attemptNo,
      status: res.status,
      ms,
      wpPostId: data["id"],
    });

    return { id: data["id"], link: typeof data["link"] === "string" ? data["link"] : undefined };
  };

  // One retry only, and only if retryable
  try {
    return await attempt(1);
  } catch (err) {
    if (err instanceof WpError && isRetryableWpStatus(err.status)) {
      console.warn(`[wp:createDraft][${requestId ?? "n/a"}] retrying once`, {
        status: err.status,
        bodyHead: err.bodyText.slice(0, 200),
      });
      return await attempt(2);
    }
    throw err;
  }
}

type ArticleDraft = {
  title: string;
  body_html: string;
  excerpt: string;
};

function extractLikelyJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function parseArticleDraftOrFallback(rawModelContent: string, site: string): ArticleDraft {
  const trimmed = rawModelContent.trim();
  const candidate = extractLikelyJson(trimmed);

  try {
    const parsed: unknown = JSON.parse(candidate);

    if (
      isRecord(parsed) &&
      typeof parsed["title"] === "string" &&
      typeof parsed["body_html"] === "string" &&
      typeof parsed["excerpt"] === "string"
    ) {
      return {
        title: parsed["title"],
        body_html: parsed["body_html"],
        excerpt: parsed["excerpt"],
      };
    }

    throw new Error("JSON shape mismatch");
  } catch {
    const safe = escapeHtml(trimmed).replace(/\n/g, "<br/>");
    return {
      title: `ConVergo Article Draft — ${site}`,
      body_html: `<p><em>AI returned invalid JSON. Raw output below:</em></p><p>${safe}</p>`,
      excerpt: "Draft generated by ConVergo (needs review).",
    };
  }
}

function buildPrompt(transcript: string) {
  const system = `
You convert a human+AI session transcript into a WordPress draft article.
Output MUST be valid JSON only (no markdown fences, no extra text).
Use simple WordPress-friendly HTML in body_html: <p>, <h2>, <ul>, <li>, <strong>, <em>.
Keep it concise and readable.
`.trim();

  const user = `
Create a draft article from this session.

Return JSON with exactly:
{
  "title": "...",
  "body_html": "...",
  "excerpt": "..."
}

Session transcript:
${transcript}
`.trim();

  return { system, user };
}

async function callOpenAiToDraftJson(transcript: string, requestId?: string): Promise<string> {
  const apiKey = mustEnv("OPENAI_API_KEY");
  const model = (process.env.OPENAI_MODEL ?? "gpt-5.2").trim() || "gpt-5.2";

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? "20000");
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;

  const { system, user } = buildPrompt(transcript);

  const t0 = Date.now();
  const { res, text, ms } = await fetchTextWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    effectiveTimeout
  );

  if (!res.ok) {
    console.error(`[openai:draftJson][${requestId ?? "n/a"}] not ok`, {
      status: res.status,
      ms,
      bodyHead: text.slice(0, 300),
    });
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 500)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (!isRecord(data)) throw new Error("OpenAI response invalid (not an object)");
  const choices = data["choices"];
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("OpenAI response missing choices");

  const first = choices[0];
  if (!isRecord(first)) throw new Error("OpenAI response invalid (choice not object)");
  const message = first["message"];
  if (!isRecord(message)) throw new Error("OpenAI response invalid (message not object)");

  const content = message["content"];
  if (typeof content !== "string") throw new Error("OpenAI response missing message.content");

  console.info(`[openai:draftJson][${requestId ?? "n/a"}] ok`, {
    model,
    ms: Date.now() - t0,
    outChars: content.length,
  });

  return content.trim();
}

export async function createWpArticleDraftFromSession(args: {
  site: string;
  startedAt: Date;
  messages: Msg[];
  requestId?: string;
}): Promise<WpPostResponse> {
  const transcript = buildTranscript(args.messages);

  const modelContent = await callOpenAiToDraftJson(transcript, args.requestId);

  const parsed = parseArticleDraftOrFallback(modelContent, args.site);

  const title = (parsed.title || `ConVergo Article Draft — ${args.site}`).trim();
  const bodyHtml = (parsed.body_html || "").trim();
  const excerpt = (parsed.excerpt || "").trim();

  const finalHtml = (excerpt ? `<p><em>${escapeHtml(excerpt)}</em></p>` : "") + bodyHtml;

  return wpCreateDraft(title, finalHtml, args.requestId);
}

export { WpError };
