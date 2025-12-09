// app/embed/page.tsx
import Script from "next/script";

export default function EmbedDemo() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "2rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        ConVergo™ Widget Demo
      </h1>
      <p style={{ fontSize: "0.9rem", opacity: 0.8, marginBottom: "1.5rem" }}>
        This page uses the embeddable script at <code>/widget/script</code> to
        render the live feed into a plain <code>&lt;div&gt;</code>.
      </p>

      <div
        id="convergo-feed"
        style={{
          borderRadius: "0.75rem",
          border: "1px solid #1f2937",
          padding: "1rem",
          background: "#020617",
          maxWidth: "40rem",
        }}
      ></div>

      <div
        id="convergo-badge"
        style={{
          marginTop: "0.75rem",
          fontSize: "0.75rem",
          opacity: 0.8,
        }}
      ></div>

      {/* This is the same script partners will embed */}
      <Script src="/widget/script" strategy="afterInteractive" />
    </main>
  );
}
