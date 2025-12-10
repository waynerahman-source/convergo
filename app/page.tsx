// app/page.tsx

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

export default async function Home() {
  const res = await fetch("/api/feed", {
    cache: "no-store",
  });

  const feed: FeedResponse = await res.json();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-semibold mb-2">
        ConVergo<span className="text-teal-400">™</span>
      </h1>
      <p className="text-slate-300 mb-8 text-center max-w-xl">
        The Human–AI Conversation Engine. Below is the live demo feed from
        <span className="font-semibold"> /api/feed</span>.
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
