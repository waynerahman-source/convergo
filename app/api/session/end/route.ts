// C:\Users\Usuario\Projects\convergo\app\api\session\end\route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createWpDraftFromSession } from "../../../../lib/engines/wpDraftEngine";
import { createWpArticleDraftFromSession } from "../../../../lib/engines/wpArticleEngine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  site?: string;
  sessionId?: string;
  mode?: "transcript" | "article";
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const site = (body.site ?? "default").trim();
  const sessionId = (body.sessionId ?? "").trim();
  const mode = body.mode === "article" ? "article" : "transcript";

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  }

  const convo = await prisma.conversation.findUnique({ where: { site } });
  if (!convo) {
    return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, startedAt: true, endedAt: true, conversationId: true },
  });

  if (!session || session.conversationId !== convo.id) {
    return NextResponse.json({ ok: false, error: "Session not found for site" }, { status: 404 });
  }

  // mark session ended (idempotent-ish: always set endedAt to now)
  const ended = await prisma.session.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
    select: { startedAt: true, endedAt: true },
  });

  // pull messages for this session
  const msgs = await prisma.message.findMany({
    where: { conversationId: convo.id, sessionId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, createdAt: true },
  });

  const normalized = msgs.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt,
  }));

  // create WP draft
  const wp =
    mode === "article"
      ? await createWpArticleDraftFromSession({ site, startedAt: ended.startedAt, messages: normalized })
      : await createWpDraftFromSession({ site, startedAt: ended.startedAt, messages: normalized });

  return NextResponse.json({
    ok: true,
    site,
    sessionId,
    mode,
    startedAt: ended.startedAt,
    endedAt: ended.endedAt,
    messageCount: msgs.length,
    wpPostId: wp.id,
    wpLink: wp.link ?? null,
  });
}
