// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Incoming = {
  site?: string;
  message?: string;
};

function getErrMsg(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Incoming;

    const site = body.site ?? "default";
    const userText = (body.message ?? "").trim();

    if (!userText) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Ensure conversation exists
    const convo = await prisma.conversation.upsert({
      where: { site },
      update: {},
      create: { site },
    });

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        role: "user",
        content: userText,
      },
    });

    // If OpenAI key not set yet, reply with a helpful placeholder (still persisted)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const reply =
        "✅ Message saved. Next step: set OPENAI_API_KEY in .env.local (and later in Vercel) to enable AI replies.";

      await prisma.message.create({
        data: {
          conversationId: convo.id,
          role: "assistant",
          content: reply,
        },
      });

      return NextResponse.json({ reply });
    }

    // Build context from the last 30 messages
    const history = await prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    const messages = [
      {
        role: "system",
        content:
          "You are an AI diary companion. Be warm, concise, and helpful. Keep responses short unless asked for detail.",
      },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
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
      const reply = `⚠️ OpenAI error: ${detail}`;

      await prisma.message.create({
        data: {
          conversationId: convo.id,
          role: "assistant",
          content: reply,
        },
      });

      return NextResponse.json({ reply });
    }

    const data = (await r.json()) as any;
    const reply =
      (data?.choices?.[0]?.message?.content as string | undefined)?.trim() ??
      "Sorry — no reply returned.";

    // Save assistant reply
    await prisma.message.create({
      data: {
        conversationId: convo.id,
        role: "assistant",
        content: reply,
      },
    });

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Server error", detail: getErrMsg(err) },
      { status: 500 }
    );
  }
}
