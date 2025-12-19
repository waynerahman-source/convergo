// C:\Users\Usuario\Projects\convergo\app\api\chat\route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Incoming = {
  site?: string;
  sessionId?: string;
  message?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

// Fix common mojibake + normalize smart punctuation to plain ASCII
function sanitizeText(input: string): string {
  if (!input) return input;

  let s = input;

  // Attempt latin1->utf8 repair if mojibake markers present
  if (/[Ãâ]/.test(s)) {
    try {
      const repaired = Buffer.from(s, "latin1").toString("utf8");
      const score = (t: string) => (t.match(/[Ãâ]/g) ?? []).length;
      if (score(repaired) < score(s)) s = repaired;
    } catch {
      // ignore
    }
  }

  // Normalize typography to plain ASCII
  s = s
    .replace(/[\u2018\u2019]/g, "'") // ‘ ’
    .replace(/[\u201C\u201D]/g, '"') // “ ”
    .replace(/[\u2013\u2014]/g, "-") // – —
    .replace(/\u2026/g, "..."); // …

  // Belt + braces for common mojibake sequences
  s = s
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€¦/g, "...");

  return s;
}

function getOrigin(req: Request) {
  return new URL(req.url).origin; // works on Vercel + local
}

// FAIL-SOFT: never throw, never block chat if persistence fails
async function saveMessage(
  origin: string,
  site: string,
  role: "user" | "assistant",
  content: string,
  sessionId?: string
) {
  try {
    await fetch(`${origin}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, role, content, sessionId }),
      cache: "no-store",
    });
  } catch {
    // ignore (prod may not have writable DB)
  }
}

export async function POST(req: Request) {
  try {
    const origin = getOrigin(req);

    const body = (await req.json()) as Incoming;
    const site = (body.site ?? "default").trim();
    const sessionId = body.sessionId ? String(body.sessionId).trim() : "";
    const userText = (body.message ?? "").trim();
    if (!userText) return badRequest("Missing message");

    // Persist USER message (fail-soft)
    await saveMessage(origin, site, "user", sanitizeText(userText), sessionId || undefined);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const reply = "Message saved. Set OPENAI_API_KEY to enable AI replies.";
      await saveMessage(origin, site, "assistant", reply, sessionId || undefined);
      return NextResponse.json({ reply });
    }

    // Load history (fail-soft)
    let historyData: any = { messages: [] };
    try {
      const url =
        `${origin}/api/messages?site=${encodeURIComponent(site)}` +
        (sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : "");

      const historyRes = await fetch(url, { cache: "no-store" });
      if (historyRes.ok) {
        historyData = await historyRes.json();
      }
    } catch {
      // ignore
    }

    const messages = [
      {
        role: "system" as const,
        content:
          "You are an AI diary companion. Be warm, concise, and helpful. Keep responses short unless asked for detail. Use plain ASCII punctuation.",
      },
      ...((historyData?.messages ?? []) as any[]).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: userText },
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      const reply = sanitizeText(`OpenAI error: ${detail}`);
      await saveMessage(origin, site, "assistant", reply, sessionId || undefined);
      return NextResponse.json({ reply });
    }

    const data = await r.json();
    const rawReply =
      data?.choices?.[0]?.message?.content?.trim() ?? "Sorry - no reply returned.";

    const reply = sanitizeText(rawReply);

    // Persist ASSISTANT reply (fail-soft)
    await saveMessage(origin, site, "assistant", reply, sessionId || undefined);

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}
