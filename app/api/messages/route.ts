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

function makeRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function json(ok: boolean, data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok, ...data }, { status });
}

function jsonError(
  status: number,
  payload: { requestId: string } & Record<string, unknown>
) {
  return NextResponse.json({ ok: false, ...payload }, { status });
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

function clampSite(raw: string): string {
  // prevent weirdly long/untrusted input
  const s = (raw ?? "default").toString().trim() || "default";
  return s.length > 80 ? s.slice(0, 80) : s;
}

function normalizeRole(roleRaw: string): "user" | "assistant" {
  const r = (roleRaw ?? "user").toString().trim();
  return r === "assistant" ? "assistant" : "user";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const site = clampSite(searchParams.get("site") ?? "default");
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
  const requestId = makeRequestId();

  // Limits (server-enforced). Keep these simple + configurable.
  const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS ?? "4000");
  const MAX_MESSAGES_PER_SESSION = Number(process.env.MAX_MESSAGES_PER_SESSION ?? "80");

  const body = (await req.json().catch(() => ({}))) as PostBody;

  const site = clampSite(body.site ?? "default");
  const content = (body.content ?? "").toString().trim();
  const role = normalizeRole(body.role ?? "user");
  const sessionId = body.sessionId ? String(body.sessionId).trim() : "";

  if (!content) {
    return jsonError(400, {
      requestId,
      error: "MISSING_CONTENT",
      message: "Missing content",
      site,
    });
  }

  if (Number.isFinite(MAX_MESSAGE_CHARS) && MAX_MESSAGE_CHARS > 0 && content.length > MAX_MESSAGE_CHARS) {
    return jsonError(413, {
      requestId,
      error: "MESSAGE_TOO_LONG",
      message: `Message too long (${content.length} chars). Max is ${MAX_MESSAGE_CHARS}. Please shorten or split your text. See /limits.`,
      site,
      maxChars: MAX_MESSAGE_CHARS,
      actualChars: content.length,
    });
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
      return jsonError(400, {
        requestId,
        error: "INVALID_SESSION",
        message: "Invalid sessionId for this site",
        site,
        sessionId,
      });
    }

    // MVP rule: don’t allow writing into a closed session
    if (session.endedAt) {
      return jsonError(400, {
        requestId,
        error: "SESSION_ENDED",
        message: "Session already ended",
        site,
        sessionId,
      });
    }

    // Session message count guardrail (prevents runaway DB growth and abuse)
    if (Number.isFinite(MAX_MESSAGES_PER_SESSION) && MAX_MESSAGES_PER_SESSION > 0) {
      const count = await prisma.message.count({
        where: { conversationId: convo.id, sessionId: session.id },
      });

      if (count >= MAX_MESSAGES_PER_SESSION) {
        return jsonError(429, {
          requestId,
          error: "SESSION_MESSAGE_LIMIT_REACHED",
          message: `This session has reached the message limit (${MAX_MESSAGES_PER_SESSION}). Please end the session and start a new one. See /limits.`,
          site,
          sessionId,
          maxMessagesPerSession: MAX_MESSAGES_PER_SESSION,
          currentCount: count,
        });
      }
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
