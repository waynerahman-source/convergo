// app/embed/EmbedClient.tsx
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ChatPanel from "./ChatPanel";

function safeUrl(url: string, fallback: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

export default function EmbedClient() {
  const sp = useSearchParams();

  const author = useMemo(() => {
    const v = sp.get("author");
    return (v && v.trim()) || "the author";
  }, [sp]);

  const learnMore = useMemo(() => {
    const v = sp.get("learnMore");
    const raw = (v && v.trim()) || "https://convergo.live";
    return safeUrl(raw, "https://convergo.live");
  }, [sp]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "2rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        You’re viewing an ongoing conversation
      </h1>

      <p
        style={{
          fontSize: "0.95rem",
          color: "rgba(15, 23, 42, 0.75)",
          marginBottom: "1.0rem",
          maxWidth: "46rem",
          lineHeight: 1.5,
        }}
      >
        between <span style={{ fontWeight: 600 }}>{author}</span> and an AI diary
        companion{" "}
        <a
          href={learnMore}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "rgba(107, 15, 46, 0.95)",
            fontWeight: 600,
            textDecoration: "none",
            marginLeft: 6,
          }}
        >
          [learn more]
        </a>
        .
      </p>

      <ChatPanel />

      <div
        id="convergo-badge"
        style={{
          marginTop: "0.85rem",
          fontSize: "0.8rem",
          color: "rgba(15, 23, 42, 0.65)",
        }}
      />
    </main>
  );
}
