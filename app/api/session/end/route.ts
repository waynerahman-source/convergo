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

type ErrorPayload = {
  ok: false;
  error: string;
  message?: string;
  requestId: string;
  site?: string;
  sessionId?: string;
};

function makeRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ARTICLE-FIRST DEFAULT:
// - If mode === "transcript" => transcript
// - Else => article
function resolveMode(mode?: Body["mode"]): "transcript" | "article" {
  return mode === "transcript" ? "transcript" : "article";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function extractWpAuthStatus(err: unknown): number | null {
  if (!isRecord(err)) return null;

  const status = err["status"];
  const statusCode = err["statusCode"];

  const direct = Number(
    typeof status === "number" ? status : typeof statusCode === "number" ? statusCode : NaN
  );
  if (Number.isFinite(direct) && direct > 0) return direct;

  const response = err["response"];
  if (isRecord(response)) {
    const respStatus = Number(typeof response["status"] === "number" ? response["status"] : NaN);
    if (Number.isFinite(respStatus) && respStatus > 0) return respStatus;
  }

  const msg = String(err["message"] ?? "");
  const m = msg.match(/\bWP error\s+(\d{3})\b/i) || msg.match(/\bstatus\s+(\d{3})\b/i);
  if (m?.[1]) return Number(m[1]);

  return null;
}

function jsonError(status: number, payload: Omit<ErrorPayload, "ok"> & { ok?: false }) {
  return NextResponse.json({ ok: false, ...payload }, { status });
}

export async function POST(req: Request) {
  const requestId = makeRequestId();

  let site = "default";
  let sessionId = "";
  let mode: "transcript" | "article" = "article";

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    site = (body.site ?? "default").trim() || "default";
    sessionId = (body.sessionId ?? "").trim();
    mode = resolveMode(body.mode);

    if (!sessionId) {
      return jsonError(400, {
        error: "MISSING_SESSION_ID",
        message: "Missing sessionId",
        requestId,
        site,
      });
    }

    const convo = await prisma.conversation.findUnique({ where: { site } });
    if (!convo) {
      return jsonError(404, {
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
        requestId,
        site,
        sessionId,
      });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, startedAt: true, endedAt: true, conversationId: true },
    });

    if (!session || session.conversationId !== convo.id) {
      return jsonError(404, {
        error: "SESSION_NOT_FOUND",
        message: "Session not found for site",
        requestId,
        site,
        sessionId,
      });
    }

    const now = new Date();
    const ended = await prisma.session.update({
      where: { id: sessionId },
      data: { endedAt: session.endedAt ?? now },
      select: { startedAt: true, endedAt: true },
    });

    const msgs = await prisma.message.findMany({
      where: { conversationId: convo.id, sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });

    const normalized = msgs.map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      return {
        role,
        content: m.content,
        createdAt: m.createdAt,
      } as const;
    });

    if (normalized.length === 0) {
      return jsonError(400, {
        error: "NO_MESSAGES",
        message: "No messages found for this session",
        requestId,
        site,
        sessionId,
      });
    }

    let wp: { id: number | string; link?: string | null };

    try {
      wp =
        mode === "transcript"
          ? await createWpDraftFromSession({
              site,
              startedAt: ended.startedAt,
              messages: normalized,
            })
          : await createWpArticleDraftFromSession({
              site,
              startedAt: ended.startedAt,
              messages: normalized,
            });
    } catch (err) {
      const status = extractWpAuthStatus(err);

      if (status === 401) {
        return jsonError(502, {
          error: "WP_AUTH_FAILED",
          message:
            "WordPress rejected post creation (401 Unauthorized). Check WP_USERNAME / WP_APP_PASSWORD and Application Password settings.",
          requestId,
          site,
          sessionId,
        });
      }

      if (status === 403) {
        return jsonError(502, {
          error: "WP_FORBIDDEN",
          message:
            "WordPress rejected post creation (403 Forbidden). Check WP user role/capabilities and REST permissions.",
          requestId,
          site,
          sessionId,
        });
      }

      console.error(`[session:end][${requestId}] WP draft creation failed`, {
        site,
        sessionId,
        mode,
        message: safeMessage(err),
      });

      return jsonError(502, {
        error: "WP_DRAFT_FAILED",
        message: safeMessage(err),
        requestId,
        site,
        sessionId,
      });
    }

    console.info(`[session:end][${requestId}] Draft created`, {
      site,
      sessionId,
      mode,
      messageCount: normalized.length,
      wpPostId: wp.id,
      wpLink: wp.link ?? null,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      site,
      sessionId,
      mode,
      startedAt: ended.startedAt,
      endedAt: ended.endedAt,
      messageCount: normalized.length,
      wpPostId: wp.id,
      wpLink: wp.link ?? null,
    });
  } catch (err) {
    console.error(`[session:end][${requestId}] Unhandled error`, {
      site,
      sessionId,
      mode,
      message: safeMessage(err),
    });

    return jsonError(500, {
      error: "END_SESSION_FAILED",
      message: safeMessage(err),
      requestId,
      site,
      sessionId,
    });
  }
}
