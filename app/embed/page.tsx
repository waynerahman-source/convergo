// app/embed/page.tsx
import { Suspense } from "react";
import EmbedClient from "./EmbedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <EmbedClient />
    </Suspense>
  );
}

function Fallback() {
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
          marginBottom: "1.25rem",
          maxWidth: "46rem",
          lineHeight: 1.5,
        }}
      >
        Loading…
      </p>

      <div
        style={{
          borderRadius: "0.9rem",
          border: "1px solid rgba(15, 23, 42, 0.12)",
          padding: "1rem",
          background: "rgba(248, 250, 252, 0.9)",
          maxWidth: "46rem",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          minHeight: 120,
        }}
      />
    </main>
  );
}
