// app/page.tsx
import { getBaseUrl } from "../lib/baseUrl";

type ConversationUnit = {
  id: string;
  timestamp: string;
  speaker: "H" | "A";
  text: string;
  category: string[];
  tags: {
    emotion?: string;
    intent?: string;
    topic?: string;
    tone?: string;
  };
  meta: {
    sequence: number;
    token_count?: number;
  };
};

type FeedResponse = {
  version: string;
  stream_id: string;
  mode: string;
  data: ConversationUnit[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const baseUrl = getBaseUrl();

  let feed: FeedResponse | null = null;

  try {
    const res = await fetch(`${baseUrl}/api/feed`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to load feed:", res.status, res.statusText);
    } else {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        feed = (await res.json()) as FeedResponse;
      } else {
        console.error("Unexpected content-type for feed:", contentType);
      }
    }
  } catch (err: unknown) {
    console.error("Error loading feed:", err);
  }

  if (!feed) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center px-4 py-10">
        <h1 className="text-3xl md:text-4xl font-semibold mb-4">
          ConVergo<span className="text-teal-400">™</span>
        </h1>
        <p className="text-slate-300 mb-4 text-center max-w-xl">
          The Human–AI Conversation Engine.
        </p>
        <p className="text-slate-400 text-sm text-center max-w-md">
          The live demo feed is temporarily unavailable. Please try again in a
          moment.
        </p>
        <div className="mt-8 text-xs text-slate-400 border border-slate-800 rounded-full px-3 py-1">
          Powered by <span className="text-teal-400 font-semibold">ConVergo™</span>{" "}
          & ChatGPT
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-semibold mb-2">
        ConVergo<span className="text-teal-400">™</span>
      </h1>
      <p className="text-slate-300 mb-8 text-center max-w-xl">
        The Human–AI Conversation Engine. Below is the live demo feed from{" "}
        <span className="font-semibold">/api/feed</span>.
      </p>

      <section className="w-full max-w-3xl space-y-4">
        {feed.data.map((cu) => (
          <article
            key={cu.id}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>
                {cu.speaker === "H" ? "Human" : "AI"} • #{cu.meta.sequence}
              </span>
              <span>
                {new Date(cu.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-sm leading-relaxed">{cu.text}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 text-xs text-slate-400 border border-slate-800 rounded-full px-3 py-1">
        Powered by <span className="text-teal-400 font-semibold">ConVergo™</span>{" "}
        & ChatGPT
      </div>
    </main>
  );
}
