// app/api/chat/route.ts
import { NextResponse } from "next/server";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();

    const parsed = body as { site?: string; messages?: Msg[] };
    const site = parsed.site ?? "default";
    const messages = parsed.messages ?? [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const system: Msg = {
      role: "system",
      content:
        `You are an AI diary companion inside ConVergo. ` +
        `You are speaking to the author of the site. ` +
        `Be warm, concise, and helpful. ` +
        `Avoid sensitive personal data. ` +
        `Site=${site}.`,
    };

    const payload = {
      model: "gpt-5.2",
      messages: [system, ...messages],
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json(
        { error: "OpenAI error", detail },
        { status: 500 }
      );
    }

    const data: unknown = await r.json();
    const d = data as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply =
      d.choices?.[0]?.message?.content?.trim() ?? "Sorry — no reply returned.";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Server error", detail: errorMessage(err) },
      { status: 500 }
    );
  }
}
