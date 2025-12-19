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

function json(ok: boolean, data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

function isAuthorRequest(searchParams: URLSearchParams): boolean {
  const all = (searchParams.get("all") ?? "").trim() === "1";
  if (!all) return false;

  const provided = (searchParams.get("authorKey") ?? "").trim();
  const expected = (process.env.CONVERGO_AUTHOR_KEY ?? "").trim();

  // If no key configured, author/all mode is disabled by default (safer).
  if (!expected) return false;

  return provided.length > 0 && provided === expected;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const site = (searchParams.get("site") ?? "default").trim();
  const requestedSessionId = (searchParams.get("sessionId") ?? "").trim();

  // Ensure conversation exists
  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  // 1) If explicit sessionId provided: validate and return that session's messages (author or visitor)
  if (requestedSessionId) {
    const session = await prisma.session.findUnique({
      where: { id: requestedSessionId },
      select: { id: true, conversationId: true },
    });

    if (!session || session.conversationId !== convo.id) {
      return json(false, { error: "Invalid sessionId for this site" }, 400);
    }

    const messages: ApiMsg[] = await prisma.message.findMany({
      where: { conversationId: convo.id, sessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return json(true, {
      site,
      conversationId: convo.id,
      sessionId: session.id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  }

  // 2) Author-only: allow "all history across sessions"
  if (isAuthorRequest(searchParams)) {
    const messages: ApiMsg[] = await prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return json(true, {
      site,
      conversationId: convo.id,
      sessionId: null,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      scope: "all",
    });
  }

  // 3) Default (visitor-safe): return ONLY the latest session messages (if any)
  const latest = await prisma.session.findFirst({
    where: { conversationId: convo.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });

  if (!latest) {
    return json(true, {
      site,
      conversationId: convo.id,
      sessionId: null,
      messages: [],
      scope: "latest",
    });
  }

  const messages: ApiMsg[] = await prisma.message.findMany({
    where: { conversationId: convo.id, sessionId: latest.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return json(true, {
    site,
    conversationId: convo.id,
    sessionId: latest.id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    scope: "latest",
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
    return json(false, { error: "Missing content" }, 400);
  }

  // Ensure conversation exists
  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  // If sessionId provided, verify it belongs to this conversation
  let sessionIdToUse: string | undefined = undefined;

  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, conversationId: true, endedAt: true },
    });

    if (!session || session.conversationId !== convo.id) {
      return json(false, { error: "Invalid sessionId for this site" }, 400);
    }

    // MVP rule: don’t allow writing into a closed session
    if (session.endedAt) {
      return json(false, { error: "Session already ended" }, 400);
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

  return json(true, {
    site,
    conversationId: convo.id,
    message,
  });
}
