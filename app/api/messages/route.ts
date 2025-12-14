// app/api/messages/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = searchParams.get("site") ?? "default";

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({
    site,
    conversationId: convo.id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role, // "user" | "assistant"
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
