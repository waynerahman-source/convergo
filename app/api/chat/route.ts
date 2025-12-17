// C:\Users\Usuario\Projects\convergo\app\api\chat\route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Incoming = {
  site?: string;
  message?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

// Fix common “mojibake” (â€™ etc) + normalize smart punctuation to plain ASCII
function sanitizeText(input: string): string {
  if (!input) return input;

  let s = input;

  // 1) Try latin1->utf8 repair if mojibake markers are present
  if (/[Ãâ]/.test(s)) {
    try {
      const repaired = Buffer.from(s, "latin1").toString("utf8");
      // Use repaired only if it looks better (fewer mojibake markers)
      const score = (t: string) => (t.match(/[Ãâ]/g) ?? []).length;
      if (score(repaired) < score(s)) s = repaired;
    } catch {
      // ignore
    }
  }

  // 2) Normalize typographic punctuation to ASCII (keeps PowerShell happy)
  s = s
    .replace(/[\u2018\u2019]/g, "'") // ‘ ’
    .replace(/[\u201C\u201D]/g, '"') // “ ”
    .replace(/[\u2013\u2014]/g, "-") // – —
    .replace(/\u2026/g, "..."); // …

  // 3) Extra common mojibake sequences (belt + braces)
  s = s
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\x9d/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€¦/g, "...");

  return s;
}

async function saveMessage(site: string, role: "user" | "assistant", content: string) {
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site, role, content }),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Incoming;

    const site = (body.site ?? "default").trim();
    const userText = (body.message ?? "").trim();

    if (!userText) return badRequest("Missing message");

    // Persist USER message
    await saveMessage(site, "user", sanitizeText(userText));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const reply = "Message saved. Set OPENAI_API_KEY to enable AI replies.";
      await saveMessage(site, "assistant", reply);
      return NextResponse.json({ reply });
    }

    // Fetch history
    const historyRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/messages?site=${encodeURIComponent(site)}`
    );
    const historyData = await historyRes.json();

    const messages = [
      {
        role: "system" as const,
        content:
          "You are an AI diary companion. Be warm, concise, and helpful. Keep responses short unless asked for detail. Use plain ASCII punctuation.",
      },
      ...(historyData.messages ?? []).map((m: any) => ({
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
      const detail = await r.text();
      const reply = sanitizeText(`OpenAI error: ${detail}`);
      await saveMessage(site, "assistant", reply);
      return NextResponse.json({ reply });
    }

    const data = await r.json();
    const rawReply =
      data?.choices?.[0]?.message?.content?.trim() ?? "Sorry - no reply returned.";

    const reply = sanitizeText(rawReply);

    await saveMessage(site, "assistant", reply);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}
