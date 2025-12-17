// app/embed/ChatPanel.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type UiMsg = { id?: string; who: "author" | "ai"; text: string };

type MessagesApiResponse = {
  site?: string;
  conversationId?: string;
  messages?: Array<{ id: string; role: "user" | "assistant" | string; content: string }>;
};

type ChatApiResponse = { reply?: string; detail?: string; error?: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text(); // read once

  if (!res.ok) {
    // Include body snippet when server sends HTML or plain text
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

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, busy, loadingHistory]);

  // Load history on mount / site change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/messages?site=${encodeURIComponent(site)}`, {
          cache: "no-store",
        });

        const parsed = await readJsonOrThrow<MessagesApiResponse>(res);

        const loaded =
          parsed.messages?.map((m) => ({
            id: m.id,
            who: m.role === "assistant" ? ("ai" as const) : ("author" as const),
            text: m.content,
          })) ?? [];

        if (!cancelled) {
          setMsgs(
            loaded.length
              ? loaded
              : [{ who: "ai", text: "I’m here. Say hello and we’ll start." }]
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setMsgs([
            {
              who: "ai",
              text: `⚠️ Failed to load history: ${errorMessage(err)}`,
            },
          ]);
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

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);

    // Optimistic user message
    setMsgs((prev) => [...prev, { who: "author", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, message: text }),
      });

      const parsed = await readJsonOrThrow<ChatApiResponse>(res);

      setMsgs((prev) => [...prev, { who: "ai", text: parsed.reply ?? "…" }]);
    } catch (err: unknown) {
      setMsgs((prev) => [
        ...prev,
        { who: "ai", text: `⚠️ ${errorMessage(err)}` },
      ]);
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
                background:
                  m.who === "author"
                    ? "rgba(107,15,46,.10)"
                    : "rgba(15,23,42,.06)",
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

        {busy && (
          <div style={{ fontSize: 12, opacity: 0.6, padding: "6px 4px" }}>
            AI is typing…
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
          disabled={busy}
          style={{
            borderRadius: 999,
            border: 0,
            padding: "12px 16px",
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            background: "#6b0f2e",
            color: "white",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
