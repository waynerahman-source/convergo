// C:\Users\Usuario\Projects\convergo\app\embed\ChatPanel.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type UiMsg = { id?: string; who: "author" | "ai"; text: string };

type MessagesApiResponse = {
  ok?: boolean;
  site?: string;
  conversationId?: string;
  sessionId?: string | null;
  messages?: Array<{ id: string; role: "user" | "assistant" | string; content: string }>;
};

type ChatApiResponse = { reply?: string; detail?: string; error?: string };

type SessionStartResponse = {
  ok: boolean;
  site: string;
  conversationId: string;
  sessionId: string;
  startedAt: string;
};

type SessionEndResponse = {
  ok: boolean;
  site: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
  wpPostId?: number;
  wpLink?: string | null;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Reads response as text. If status is not ok, tries to extract a friendly JSON error payload:
 * { ok:false, error:"...", message:"...", requestId:"..." }
 */
async function readJsonOrExplain(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  // Non-OK responses: try to parse JSON for nicer messaging
  if (!res.ok) {
    let parsed: any = null;
    if (text && contentType.toLowerCase().includes("application/json")) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    // If server provided structured error payload, present it cleanly
    if (parsed && typeof parsed === "object") {
      const msg = typeof parsed.message === "string" ? parsed.message : null;
      const reqId = typeof parsed.requestId === "string" ? parsed.requestId : null;
      const errCode = typeof parsed.error === "string" ? parsed.error : null;

      const friendly =
        msg ??
        (errCode ? `${errCode}` : `HTTP ${res.status} ${res.statusText}`) +
          (reqId ? ` (ref ${reqId})` : "");

      throw new Error(`HTTP ${res.status}: ${friendly}`);
    }

    const snippet = text ? text.slice(0, 400) : "(empty body)";
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${snippet}`);
  }

  if (!text.trim()) {
    throw new Error("Server returned an empty response (expected JSON).");
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    const snippet = text.slice(0, 400);
    throw new Error(`Expected JSON but got "${contentType}". Body: ${snippet}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 400);
    throw new Error(`Invalid JSON returned by server. Body: ${snippet}`);
  }
}

export default function ChatPanel() {
  const sp = useSearchParams();

  const site = useMemo(() => sp.get("site") || "default", [sp]);
  const author = useMemo(() => sp.get("author") || "the author", [sp]);

  // Debug toggle: add &debug=1 to show sessionId
  const debug = useMemo(() => sp.get("debug") === "1", [sp]);

  // Limits (client-side guardrail)
  const MAX_MESSAGE_CHARS = 4000;
  const LIMITS_URL = "https://convergo.live/usage-limits";

  const [input, setInput] = useState<string>("");
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ending, setEnding] = useState<boolean>(false);

  // A small inline warning above the input (not stored as chat message)
  const [inlineWarning, setInlineWarning] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const DEFAULT_GREETING: UiMsg = useMemo(
    () => ({ who: "ai", text: "Ready when you are!" }),
    []
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, busy, loadingHistory, ending]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingHistory(true);
      setSessionId(null);

      try {
        const res = await fetch(`/api/messages?site=${encodeURIComponent(site)}`, {
          cache: "no-store",
        });

        const parsed = (await readJsonOrExplain(res)) as MessagesApiResponse;

        const loaded: UiMsg[] =
          parsed.messages?.map((m) => ({
            id: m.id,
            who: m.role === "assistant" ? ("ai" as const) : ("author" as const),
            text: m.content,
          })) ?? [];

        if (!cancelled) {
          setMsgs(loaded.length ? loaded : [DEFAULT_GREETING]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setMsgs([{ who: "ai", text: `⚠️ Failed to load history: ${errorMessage(err)}` }]);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [site, DEFAULT_GREETING]);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;

    const res = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site }),
    });

    const parsed = (await readJsonOrExplain(res)) as SessionStartResponse;
    setSessionId(parsed.sessionId);
    return parsed.sessionId;
  }

  async function endSession(): Promise<void> {
    if (!sessionId || busy || ending) return;

    setInlineWarning(null);
    setEnding(true);

    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId, mode: "article" }),
      });

      const parsed = (await readJsonOrExplain(res)) as SessionEndResponse;

      const linkText = parsed.wpLink
        ? `Draft created: ${parsed.wpLink}`
        : `Draft created (postId ${parsed.wpPostId ?? "?"})`;

      setMsgs((prev) => [
        ...prev,
        {
          who: "ai",
          text: `✅ Session ended. ${linkText}`,
        },
      ]);

      setSessionId(null);
    } catch (err: unknown) {
      setMsgs((prev) => [...prev, { who: "ai", text: `⚠️ End session failed: ${errorMessage(err)}` }]);
      setInlineWarning("Tip: If your session is large, split it into smaller parts. See Usage limits.");
    } finally {
      setEnding(false);
    }
  }

  function clearModal(): void {
    if (busy || ending) return;
    setInput("");
    setInlineWarning(null);
    setSessionId(null);
    setMsgs([DEFAULT_GREETING]);
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || busy || ending) return;

    // Client-side limit guard
    if (text.length > MAX_MESSAGE_CHARS) {
      setInlineWarning(
        `Message too long (${text.length} chars). Please shorten or split it. Max is ${MAX_MESSAGE_CHARS}.`
      );
      return;
    }

    setInlineWarning(null);
    setInput("");
    setBusy(true);

    // Optimistically show the user's message
    setMsgs((prev) => [...prev, { who: "author", text }]);

    try {
      const sid = await ensureSession();

      // OPTIONAL: persist the message via /api/messages too (if your /api/chat doesn't already do it).
      // We keep your current flow as-is: /api/chat drives the assistant response.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId: sid, message: text }),
      });

      const parsed = (await readJsonOrExplain(res)) as ChatApiResponse;

      setMsgs((prev) => [...prev, { who: "ai", text: parsed.reply ?? "…" }]);
    } catch (err: unknown) {
      setMsgs((prev) => [...prev, { who: "ai", text: `⚠️ ${errorMessage(err)}` }]);
      setInlineWarning("If this keeps happening, shorten the text and try again. See Usage limits.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: "46rem" }}>
      <div
        ref={scrollerRef}
        style={{
          border: "1px solid rgba(15,23,42,.12)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(248,250,252,.9)",
          boxShadow: "0 10px 30px rgba(0,0,0,.06)",
          height: "54vh",
          overflowY: "auto",
        }}
      >
        {loadingHistory && (
          <div style={{ fontSize: 12, opacity: 0.6, padding: "6px 4px" }}>
            Loading history…
          </div>
        )}

        {sessionId && (
          <div style={{ fontSize: 12, opacity: 0.75, padding: "6px 4px" }}>
            Session active
            {debug && (
              <>
                {" "}
                • <code>{sessionId}</code>
              </>
            )}
          </div>
        )}

        {msgs.map((m, i) => (
          <div
            key={m.id ?? i}
            style={{
              marginBottom: 12,
              display: "flex",
              justifyContent: m.who === "author" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 12px",
                borderRadius: 14,
                whiteSpace: "pre-wrap",
                background: m.who === "author" ? "rgba(107,15,46,.10)" : "rgba(15,23,42,.06)",
                border: "1px solid rgba(15,23,42,.10)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                {m.who === "author" ? author : "AI"}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.45 }}>{m.text}</div>
            </div>
          </div>
        ))}

        {(busy || ending) && (
          <div style={{ fontSize: 12, opacity: 0.6, padding: "6px 4px" }}>
            {ending ? "Ending session & creating WP draft…" : "AI is typing…"}
          </div>
        )}
      </div>

      {inlineWarning && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6b0f2e" }}>
          ⚠️ {inlineWarning}{" "}
          <a
            href={LIMITS_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#6b0f2e", textDecoration: "underline" }}
          >
            Usage limits
          </a>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (inlineWarning) setInlineWarning(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder="Type a message…"
          style={{
            flex: 1,
            borderRadius: 999,
            border: "1px solid rgba(15,23,42,.18)",
            padding: "12px 14px",
            outline: "none",
          }}
        />

        <button
          onClick={() => void send()}
          disabled={busy || ending}
          style={{
            borderRadius: 999,
            border: 0,
            padding: "12px 16px",
            fontWeight: 700,
            cursor: busy || ending ? "not-allowed" : "pointer",
            background: "#6b0f2e",
            color: "white",
            opacity: busy || ending ? 0.6 : 1,
          }}
        >
          {busy ? "…" : "Send"}
        </button>

        <button
          onClick={() => void endSession()}
          disabled={!sessionId || busy || ending}
          title={!sessionId ? "Start chatting to begin a session" : "End session and create WP draft"}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(15,23,42,.18)",
            padding: "12px 14px",
            fontWeight: 700,
            cursor: !sessionId || busy || ending ? "not-allowed" : "pointer",
            background: "white",
            color: "#0f172a",
            opacity: !sessionId || busy || ending ? 0.6 : 1,
          }}
        >
          End
        </button>

        <button
          onClick={clearModal}
          disabled={busy || ending}
          title="Clear the modal view (does not delete database history)"
          style={{
            borderRadius: 999,
            border: "1px solid rgba(15,23,42,.18)",
            padding: "12px 14px",
            fontWeight: 700,
            cursor: busy || ending ? "not-allowed" : "pointer",
            background: "white",
            color: "#0f172a",
            opacity: busy || ending ? 0.6 : 1,
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(15,23,42,.7)" }}>
        <a
          href={LIMITS_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(15,23,42,.7)", textDecoration: "underline" }}
        >
          Usage limits
        </a>
        <span> — please keep messages short for best reliability.</span>
      </div>
    </div>
  );
}
