// C:\Users\Usuario\Projects\convergo\app\api\messages\route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status: 400 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = (searchParams.get("site") ?? "default").trim();

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  const messages: ApiMsg[] = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    site,
    conversationId: convo.id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

/**
 * POST body (JSON):
 * {
 *   "site": "app.convergo.live",
 *   "role": "user" | "assistant",
 *   "content": "text..."
 * }
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const site = String(body?.site ?? "default").trim();
  const role = String(body?.role ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!site) return badRequest("site is required.");
  if (role !== "user" && role !== "assistant") return badRequest('role must be "user" or "assistant".');
  if (!content) return badRequest("content is required.");
  if (content.length > 20000) return badRequest("content too long (max 20000 chars).");

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  const msg = await prisma.message.create({
    data: {
      conversationId: convo.id,
      role,
      content,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    site,
    conversationId: convo.id,
    message: msg,
  });
}
