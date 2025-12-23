// app/embed/ChatPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Info, Play, Trash2 } from "lucide-react";

type Role = "user" | "assistant";

type Msg = {
  id: string;
  role: Role;
  content: string;
  createdAt?: string;
};

type MessagesApiResponse = {
  ok?: boolean;
  sessionId?: string | null;
  messages?: Array<{ id: string; role: Role; content: string; createdAt?: string }>;
  draftUrl?: string;
  reply?: string;
  error?: string;
  message?: string;
  detail?: string;
};

type Props = {
  site: string;
  debug?: boolean;
};

type ViewMode = "chat" | "about";
type DraftStatus = null | "creating" | "done" | "error";

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response: ${res.status} ${res.statusText} :: ${text.slice(0, 300)}`
    );
  }
}

// Storage keys (scoped by site)
function kSessionId(site: string) {
  return `convergo:${site}:sessionId`;
}
function kCleared(site: string) {
  return `convergo:${site}:cleared`;
}
function kDraftUrl(site: string) {
  return `convergo:${site}:lastDraftUrl`;
}

// Keep UX clean: never show stack traces / prisma internals to authors
function friendlyError(raw: any): string {
  const s = String(raw ?? "").trim();

  if (!s) return "Something went wrong. Please try again.";

  // Empty session / no messages
  if (/No messages found for this session/i.test(s)) {
    return "Nothing to draft yet. Write a message first, then click Draft.";
  }

  // Prisma / DB connectivity noise
  if (/prisma|db\.prisma\.io|Can't reach database/i.test(s)) {
    return "Database temporarily unavailable. Please restart the dev server and try again.";
  }

  // Next.js dev stack traces
  if (s.includes(".next") && s.includes("at ")) {
    return "Server error. Please restart the dev server and try again.";
  }

  // Keep messages short
  return s.length > 220 ? s.slice(0, 220) + "…" : s;
}

function FooterBrand() {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 10,
        borderTop: "1px solid rgba(15,23,42,0.10)",
        fontSize: 12,
        color: "rgba(15,23,42,0.60)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <span>
        Powered by{" "}
        <a
          href="https://convergo.live"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(13,148,136,1)", textDecoration: "none", fontWeight: 600 }}
        >
          ConVergo
        </a>{" "}
        &amp; ChatGPT
      </span>
    </div>
  );
}

export default function ChatPanel({ site, debug = false }: Props) {
  const [view, setView] = useState<ViewMode>("about");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [ending, setEnding] = useState(false);

  const [draftStatus, setDraftStatus] = useState<DraftStatus>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const didInit = useRef(false);
  const sendingRef = useRef(false);

  const storage = useMemo(() => {
    return typeof window !== "undefined" ? window.localStorage : null;
  }, []);

  // ---------- Boot ----------
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const clearedFlag = storage?.getItem(kCleared(site)) === "1";
    const storedSid = storage?.getItem(kSessionId(site));

    const lastDraft = storage?.getItem(kDraftUrl(site));
    if (lastDraft && lastDraft.trim()) setDraftUrl(lastDraft);

    if (storedSid && !clearedFlag) {
      setSessionId(storedSid);
      setView("chat");
      void hydrateFromServer(storedSid);
      return;
    }

    setView("about");
    setSessionId(null);
    setMessages([]);
  }, [site, storage]);

  // ---------- Hydrate (FAIL-SOFT, NEVER clears session) ----------
  async function hydrateFromServer(sid?: string | null) {
    setError(null);

    const effectiveSid = (sid ?? sessionId ?? "").trim();

    try {
      const url =
        `/api/messages?site=${encodeURIComponent(site)}` +
        (effectiveSid ? `&sessionId=${encodeURIComponent(effectiveSid)}` : "");

      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const parsed = (await readJsonOrThrow(res)) as MessagesApiResponse;

      // If messages endpoint is unhappy, do NOT kill the session.
      if (!res.ok || parsed?.ok === false) {
        const msg =
          parsed?.message || parsed?.error || `Messages hydrate failed (${res.status})`;
        setError(friendlyError(msg));
        return;
      }

      if (parsed.sessionId && typeof parsed.sessionId === "string") {
        setSessionId(parsed.sessionId);
        storage?.setItem(kSessionId(site), parsed.sessionId);
      }

      const hydrated =
        parsed.messages?.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })) ?? [];

      setMessages((prev) => {
        if (hydrated.length < prev.length) return prev;
        return hydrated;
      });
    } catch (e: any) {
      setError(friendlyError(e?.message || "Failed to load conversation"));
    }
  }

  // ---------- Actions ----------
  async function startSession() {
    if (busy || ending || sessionId) return;

    setBusy(true);
    setError(null);
    setDraftStatus(null);

    try {
      storage?.removeItem(kCleared(site));

      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site }),
      });

      const parsed = (await readJsonOrThrow(res)) as MessagesApiResponse;

      if (!res.ok || !parsed?.sessionId) {
        throw new Error(parsed?.message || parsed?.error || "Start session failed");
      }

      const sid = String(parsed.sessionId);

      setSessionId(sid);
      storage?.setItem(kSessionId(site), sid);

      setMessages([]);
      setInput("");
      setView("chat");

      await new Promise((r) => setTimeout(r, 100));
      await hydrateFromServer(sid);
    } catch (e: any) {
      setError(friendlyError(e?.message || "Start session failed"));
      setView("about");
      setSessionId(null);
      setMessages([]);
    } finally {
      setBusy(false);
    }
  }

  function clearSessionLocal() {
    storage?.removeItem(kSessionId(site));
    storage?.setItem(kCleared(site), "1");

    setError(null);
    setAiTyping(false);
    setBusy(false);
    setEnding(false);

    setInput("");
    setMessages([]);
    setSessionId(null);
    setView("about");
  }

  async function sendMessage() {
    if (!sessionId || busy || ending) return;

    const text = input.trim();
    if (!text) return;

    if (sendingRef.current) return;
    sendingRef.current = true;

    setBusy(true);
    setAiTyping(true);
    setError(null);

    const userLocal: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userLocal]);
    setInput("");

    try {
      const sid = sessionId;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId: sid, message: text }),
      });

      const parsed: any = await readJsonOrThrow(res);

      if (!res.ok) {
        throw new Error(parsed?.message || parsed?.error || "Send failed");
      }

      const reply =
        typeof parsed?.reply === "string"
          ? parsed.reply
          : typeof parsed?.message === "string"
            ? parsed.message
            : null;

      if (reply) {
        const assistantLocal: Msg = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantLocal]);
      }

      await new Promise((r) => setTimeout(r, 150));
      await hydrateFromServer(sid);
    } catch (e: any) {
      setError(friendlyError(e?.message || "Send failed"));
    } finally {
      sendingRef.current = false;
      setAiTyping(false);
      setBusy(false);
    }
  }

  async function endSessionAndDraft() {
    if (!sessionId || busy || ending) return;

    if (messages.length === 0) {
      setError("Nothing to draft yet. Write a message first, then click Draft.");
      return;
    }

    setEnding(true);
    setError(null);

    setDraftStatus("creating");
    setDraftUrl(null);

    try {
      const sid = sessionId;

      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, sessionId: sid }),
      });

      const parsed = (await readJsonOrThrow(res)) as MessagesApiResponse;

      if (!res.ok || parsed?.ok === false) {
        throw new Error(parsed?.message || parsed?.error || "End session failed");
      }

      if (parsed?.draftUrl && typeof parsed.draftUrl === "string") {
        setDraftUrl(parsed.draftUrl);
        storage?.setItem(kDraftUrl(site), parsed.draftUrl);
      }

      setDraftStatus("done");
      clearSessionLocal();
    } catch (e: any) {
      setDraftStatus("error");
      setError(friendlyError(e?.message || "End session failed"));
    } finally {
      setEnding(false);
    }
  }

  // ---------- UI helpers ----------
  function IconButton(props: {
    onClick: () => void;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        title={props.title}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 34,
          borderRadius: 10,
          border: "1px solid rgba(15,23,42,0.14)",
          background: props.disabled ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.9)",
          cursor: props.disabled ? "not-allowed" : "pointer",
        }}
      >
        {props.children}
      </button>
    );
  }

  // Draft allowed only if session active AND at least 1 message exists
  const canDraft = !!sessionId && messages.length > 0 && !busy && !ending;

  // ---------- Render ----------
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "1.25rem 1.25rem",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          overflow: "hidden",
          background: "rgba(248,250,252,0.9)",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 0.85rem",
            borderBottom: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.92)",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>ConVergo</strong>
            <span style={{ fontSize: 12, color: "rgba(15,23,42,0.65)" }}>
              Embed • {site}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <IconButton
              title="Start session"
              onClick={startSession}
              disabled={busy || ending || !!sessionId}
            >
              <Play size={18} />
            </IconButton>

            <IconButton
              title={messages.length === 0 ? "Write a message first" : "Draft (end session)"}
              onClick={endSessionAndDraft}
              disabled={!canDraft}
            >
              <FileText size={18} />
            </IconButton>

            <IconButton title="Clear (local)" onClick={clearSessionLocal} disabled={busy || ending}>
              <Trash2 size={18} />
            </IconButton>

            <IconButton title="About" onClick={() => setView("about")} disabled={busy || ending}>
              <Info size={18} />
            </IconButton>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "1rem" }}>
          {error && (
            <div
              style={{
                border: "1px solid rgba(220,38,38,0.25)",
                background: "rgba(220,38,38,0.06)",
                color: "rgba(153,27,27,1)",
                borderRadius: 12,
                padding: "0.75rem 0.85rem",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {draftStatus === "creating" && (
            <div
              style={{
                border: "1px solid rgba(13,148,136,0.25)",
                background: "rgba(13,148,136,0.06)",
                borderRadius: 12,
                padding: "0.75rem 0.85rem",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              Creating draft…
            </div>
          )}

          {view === "about" ? (
            <AboutPanel
              site={site}
              sessionId={sessionId}
              draftStatus={draftStatus}
              draftUrl={draftUrl}
            />
          ) : (
            <ChatUI
              messages={messages}
              input={input}
              setInput={setInput}
              sessionId={sessionId}
              busy={busy}
              ending={ending}
              aiTyping={aiTyping}
              onSend={sendMessage}
              debug={debug}
            />
          )}

          {/* NEW: footer appears on both About + Chat */}
          <FooterBrand />
        </div>
      </div>
    </main>
  );
}

function AboutPanel({
  site,
  sessionId,
  draftStatus,
  draftUrl,
}: {
  site: string;
  sessionId: string | null;
  draftStatus: DraftStatus;
  draftUrl: string | null;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.12)",
        background: "rgba(255,255,255,0.85)",
        padding: "1rem",
        lineHeight: 1.55,
      }}
    >
      {draftStatus === "done" && (
        <div
          style={{
            marginBottom: 12,
            border: "1px solid rgba(13,148,136,0.25)",
            background: "rgba(13,148,136,0.06)",
            borderRadius: 12,
            padding: "0.75rem 0.85rem",
            fontSize: 13,
          }}
        >
          <strong>Draft created.</strong>{" "}
          {draftUrl ? (
            <>
              Open it here:{" "}
              <a href={draftUrl} target="_blank" rel="noreferrer">
                WordPress draft
              </a>
            </>
          ) : (
            "Check WordPress drafts."
          )}
        </div>
      )}

      {draftStatus === "error" && (
        <div
          style={{
            marginBottom: 12,
            border: "1px solid rgba(220,38,38,0.25)",
            background: "rgba(220,38,38,0.06)",
            borderRadius: 12,
            padding: "0.75rem 0.85rem",
            fontSize: 13,
          }}
        >
          Draft creation failed. Please try again.
        </div>
      )}

      <h2 style={{ margin: 0, fontSize: 16 }}>About this ConVergo panel</h2>

      <p style={{ marginTop: 8, marginBottom: 10, fontSize: 13, color: "rgba(15,23,42,0.78)" }}>
        This is the author’s workspace: a live Human ↔ AI conversation used to research, think, and draft
        publishable pieces.
      </p>

      <p style={{ marginTop: 0, marginBottom: 10, fontSize: 13, color: "rgba(15,23,42,0.78)" }}>
        On Mdc, the result is a <strong>reflective magazine</strong> — broad “continent” categories (life, tech,
        culture, ideas, creativity), not narrow diary entries.
      </p>

      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "rgba(15,23,42,0.78)" }}>
        <li>
          <strong>Start</strong> begins a new session.
        </li>
        <li>
          <strong>Draft</strong> ends the session and generates a WordPress draft.
        </li>
        <li>
          <strong>Clear</strong> wipes the local panel so the last session won’t reappear.
        </li>
      </ul>

      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(15,23,42,0.62)" }}>
        Tenant: <code>{site}</code>
        {sessionId ? (
          <>
            {" "}
            • Active session: <code>{sessionId}</code>
          </>
        ) : (
          <> • No active session</>
        )}
      </div>
    </div>
  );
}

function ChatUI(props: {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  sessionId: string | null;
  busy: boolean;
  ending: boolean;
  aiTyping: boolean;
  onSend: () => void;
  debug: boolean;
}) {
  const { messages, input, setInput, sessionId, busy, ending, aiTyping, onSend, debug } = props;

  return (
    <>
      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(15,23,42,0.12)",
          background: "rgba(255,255,255,0.85)",
          padding: "0.75rem",
          minHeight: 260,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(15,23,42,0.65)" }}>
            No messages yet. Type something and hit <strong>Send</strong>.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "0.6rem 0.7rem",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.10)",
                  background: m.role === "user" ? "rgba(15,23,42,0.03)" : "rgba(13,148,136,0.06)",
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(15,23,42,0.65)", marginBottom: 4 }}>
                  {m.role === "user" ? "Human" : "AI"}
                  {m.createdAt ? ` • ${new Date(m.createdAt).toLocaleString()}` : ""}
                </div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}

        {aiTyping && (
          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(15,23,42,0.6)" }}>
            AI is typing…
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!sessionId || busy || ending}
          placeholder={!sessionId ? "Click Start to begin…" : "Type a message…"}
          style={{
            flex: 1,
            height: 42,
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,0.16)",
            padding: "0 12px",
            outline: "none",
            background: !sessionId || busy || ending ? "rgba(15,23,42,0.04)" : "#fff",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!sessionId || busy || ending || !input.trim()}
          style={{
            height: 42,
            borderRadius: 12,
            padding: "0 14px",
            border: "1px solid rgba(15,23,42,0.16)",
            background: !sessionId || busy || ending ? "rgba(15,23,42,0.05)" : "rgba(13,148,136,0.14)",
            cursor: !sessionId || busy || ending ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>

      {debug && (
        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(15,23,42,0.6)" }}>
          Debug: sessionId = <code>{sessionId || "null"}</code> • messages = {messages.length}
        </div>
      )}
    </>
  );
}
