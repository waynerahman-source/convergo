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
  const text = await res.text();

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

  return JSON.parse(text) as T;
}

export default function ChatPanel() {
  const sp = useSearchParams();

  const site = useMemo(() => sp.get("site") || "default", [sp]);
  const author = useMemo(() => sp.get("author") || "the author", [sp]);

  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

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

        const parsed = await readJsonOrThrow<MessagesApiResponse>(res);

        const loaded =
          parsed.messages?.map((m) => ({
            id: m.id,
            who: m.role === "assistant" ? "ai" : "author",
            text: m.content,
          })) ?? [];

        if (!cancelled) {
          setMsgs(
            loaded.length
              ? loaded
              : [{ who: "ai", text: "Ready when you are!" }]
          );
        }
      } catch (err) {
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
  }, [site]);

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

      setMsgs((prev) => [
        ...prev,
        {
          who: "ai",
          text: `✅ Session ended. ${
            parsed.wpLink ? `Draft created: ${parsed.wpLink}` : "Draft created."
          }`,
        },
      ]);

      setSessionId(null);
    } catch (err) {
      setMsgs((prev) => [...prev, { who: "ai", text: `⚠️ End session failed: ${errorMessage(err)}` }]);
    } finally {
      setEnding(false);
    }
  }

  function clearModal(): void {
    setMsgs([{ who: "ai", text: "🆕 New session started. Ready when you are!." }]);
    setSessionId(null);
    setInput("");
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || busy || ending) return;

    setInput("");
    setBusy(true);
    setMsgs((prev) => [...prev, { who: "author", text }]);

    try {
      const sid = await ensureSession();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId: sid, message: text }),
      });

      const parsed = await readJsonOrThrow<ChatApiResponse>(res);
      setMsgs((prev) => [...prev, { who: "ai", text: parsed.reply ?? "…" }]);
    } catch (err) {
      setMsgs((prev) => [...prev, { who: "ai", text: `⚠️ ${errorMessage(err)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: "46rem" }}>
      <div ref={scrollerRef} style={{ height: "54vh", overflowY: "auto" }}>
        {msgs.map((m, i) => (
          <div key={i}>{m.text}</div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
        />

        <button onClick={send} disabled={busy || ending}>Send</button>
        <button onClick={endSession} disabled={!sessionId || busy || ending}>End</button>
        <button onClick={clearModal} disabled={busy || ending}>Clear</button>
      </div>
    </div>
  );
}
