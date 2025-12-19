// C:\Users\Usuario\Projects\convergo\app\api\messages\route.ts
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

type PostBody = {
  site?: string;
  sessionId?: string;
  role?: "user" | "assistant" | string;
  content?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = (searchParams.get("site") ?? "default").trim();
  const sessionId = (searchParams.get("sessionId") ?? "").trim();

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  // If sessionId provided, validate it belongs to this conversation
  let sessionFilter: { sessionId?: string } = {};
  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, conversationId: true },
    });

    if (!session || session.conversationId !== convo.id) {
      return NextResponse.json(
        { ok: false, error: "Invalid sessionId for this site" },
        { status: 400 }
      );
    }

    sessionFilter = { sessionId: session.id };
  }

  const messages: ApiMsg[] = await prisma.message.findMany({
    where: { conversationId: convo.id, ...sessionFilter },
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
    ok: true,
    site,
    conversationId: convo.id,
    sessionId: sessionId || null,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;

  const site = (body.site ?? "default").trim();
  const content = (body.content ?? "").toString().trim();
  const roleRaw = (body.role ?? "user").toString().trim();
  const role = roleRaw === "assistant" ? "assistant" : "user"; // normalize
  const sessionId = body.sessionId ? String(body.sessionId).trim() : "";

  if (!content) {
    return NextResponse.json({ ok: false, error: "Missing content" }, { status: 400 });
  }

  // ensure conversation exists
  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  // if sessionId provided, verify it belongs to this conversation
  let sessionIdToUse: string | undefined = undefined;

  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, conversationId: true, endedAt: true },
    });

    if (!session || session.conversationId !== convo.id) {
      return NextResponse.json(
        { ok: false, error: "Invalid sessionId for this site" },
        { status: 400 }
      );
    }

    // MVP rule: don’t allow writing into a closed session
    if (session.endedAt) {
      return NextResponse.json(
        { ok: false, error: "Session already ended" },
        { status: 400 }
      );
    }

    sessionIdToUse = session.id;
  }

  const message = await prisma.message.create({
    data: {
      conversationId: convo.id,
      sessionId: sessionIdToUse,
      role,
      content,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    site,
    conversationId: convo.id,
    message,
  });
}
