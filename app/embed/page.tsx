// app/embed/page.tsx
import Script from "next/script";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmbedPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function getParam(
  value: string | string[] | undefined,
  fallback: string
): string {
  if (!value) return fallback;
  return Array.isArray(value) ? value[0] ?? fallback : value;
}

function safeUrl(url: string, fallback: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

export default function EmbedDemo({ searchParams }: EmbedPageProps) {
  noStore(); // ✅ ensures query params are honored (no caching)

  const author = getParam(searchParams?.author, "the author");
  const learnMoreRaw = getParam(searchParams?.learnMore, "https://convergo.live");
  const learnMore = safeUrl(learnMoreRaw, "https://convergo.live");

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

      <div
        id="convergo-feed"
        style={{
          borderRadius: "0.9rem",
          border: "1px solid rgba(15, 23, 42, 0.12)",
          padding: "1rem",
          background: "rgba(248, 250, 252, 0.9)",
          maxWidth: "46rem",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}
      ></div>

      <div
        id="convergo-badge"
        style={{
          marginTop: "0.85rem",
          fontSize: "0.8rem",
          color: "rgba(15, 23, 42, 0.65)",
        }}
      ></div>

      <Script src="/widget/script" strategy="afterInteractive" />
    </main>
  );
}
