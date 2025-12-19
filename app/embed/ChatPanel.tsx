// C:\Users\Usuario\Projects\convergo\app\embed\ChatPanel.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type UiMsg = { id?: string; who: "author" | "ai"; text: string };

type MessagesApiResponse = {
  ok?: boolean;
  site?: string;
  conversationId?: string;
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

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text(); // read once

  if (!res.ok) {
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
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 400);
    throw new Error(`Invalid JSON returned by server. Body: ${snippet}`);
  }
}

export default function ChatPanel() {
  const sp = useSearchParams();

  const site = useMemo(() => sp.get("site") || "default", [sp]);
  const author = useMemo(() => sp.get("author") || "the author", [sp]);

  const [input, setInput] = useState<string>("");
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ending, setEnding] = useState<boolean>(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const DEFAULT_GREETING: UiMsg = useMemo(
    () => ({ who: "ai", text: "Ready when you are! Say hello and we’ll start." }),
    []
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, busy, loadingHistory, ending]);

  // Load history on mount / site change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingHistory(true);
      setSessionId(null); // reset session when site changes

      try {
        const res = await fetch(`/api/messages?site=${encodeURIComponent(site)}`, {
          cache: "no-store",
        });

        const parsed = await readJsonOrThrow<MessagesApiResponse>(res);

        // IMPORTANT: ensure 'who' is typed as the UiMsg union ("author" | "ai"),
        // not a generic string. This prevents the build error you hit.
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

  // Start session (called automatically on first send)
  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;

    const res = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site }),
    });

    const parsed = await readJsonOrThrow<SessionStartResponse>(res);
    setSessionId(parsed.sessionId);
    return parsed.sessionId;
  }

  // End session and create WP draft
  async function endSession(): Promise<void> {
    if (!sessionId || busy || ending) return;

    setEnding(true);
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId, mode: "article" }),
      });

      const parsed = await readJsonOrThrow<SessionEndResponse>(res);

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
    } finally {
      setEnding(false);
    }
  }

  // Author-safe: clears ONLY the UI, does NOT touch DB, does NOT call API.
  function clearModal(): void {
    if (busy || ending) return;
    setInput("");
    setSessionId(null);
    setMsgs([DEFAULT_GREETING]);
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || busy || ending) return;

    setInput("");
    setBusy(true);

    // Optimistic user message
    setMsgs((prev) => [...prev, { who: "author", text }]);

    try {
      // Ensure session started
      const sid = await ensureSession();

      // Call chat with sessionId so BOTH user + assistant messages are in the session
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId: sid, message: text }),
      });

      const parsed = await readJsonOrThrow<ChatApiResponse>(res);

      setMsgs((prev) => [...prev, { who: "ai", text: parsed.reply ?? "…" }]);
    } catch (err: unknown) {
      setMsgs((prev) => [...prev, { who: "ai", text: `⚠️ ${errorMessage(err)}` }]);
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
            Session active • <code>{sessionId}</code>
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

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
    </div>
  );
}
