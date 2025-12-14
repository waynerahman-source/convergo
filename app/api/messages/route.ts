// app/api/messages/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiMsg = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = searchParams.get("site") ?? "default";

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  // ✅ Select only fields we return, and type them to avoid implicit any
  const messages: ApiMsg[] = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    site,
    conversationId: convo.id,
    messages: messages.map((m: ApiMsg) => ({
      id: m.id,
      role: m.role, // "user" | "assistant" (stored)
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
