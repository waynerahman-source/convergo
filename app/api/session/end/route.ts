// app/api/session/end/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createWpDraftFromSession } from "../../../../lib/engines/wpDraftEngine";
import { createWpArticleDraftFromSession, WpError } from "../../../../lib/engines/wpArticleEngine";

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

/**
 * Extracts meaningful WP status when downstream throws WpError or other shapes.
 */
function extractWpAuthStatus(err: unknown): number | null {
  if (!isRecord(err)) return null;

  if (err instanceof WpError && typeof err.status === "number") return err.status;

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
  const t0 = Date.now();

  let site = "default";
  let sessionId = "";
  let mode: "transcript" | "article" = "article";

  // Day-1 stability caps (prevents WP / OpenAI payload blowups)
  const MAX_MSGS = Number(process.env.END_SESSION_MAX_MSGS ?? "120"); // safe default
  const MAX_CHARS = Number(process.env.END_SESSION_MAX_CHARS ?? "120000"); // ~120 KB text

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

    console.info(`[session:end][${requestId}] start`, { site, sessionId, mode });

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

    // Try to load session. IMPORTANT: For MVP1, we do NOT hard-fail if missing.
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, startedAt: true, endedAt: true, conversationId: true },
    });

    const sessionBelongsToSite = !!session && session.conversationId === convo.id;

    // Mark endedAt if session exists + belongs (idempotent). Otherwise skip.
    const now = new Date();
    const startedAtFallback = now;

    const ended = sessionBelongsToSite
      ? await prisma.session.update({
          where: { id: sessionId },
          data: { endedAt: session!.endedAt ?? now },
          select: { startedAt: true, endedAt: true },
        })
      : { startedAt: startedAtFallback, endedAt: now };

    if (!sessionBelongsToSite) {
      console.warn(`[session:end][${requestId}] session missing or not linked; proceeding fail-soft`, {
        site,
        sessionId,
      });
    }

    const tMsgs0 = Date.now();
    const msgs = await prisma.message.findMany({
      where: { conversationId: convo.id, sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });
    console.info(`[session:end][${requestId}] fetched messages`, {
      count: msgs.length,
      ms: Date.now() - tMsgs0,
    });

    const normalizedAll = msgs.map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      return { role, content: m.content, createdAt: m.createdAt } as const;
    });

    if (normalizedAll.length === 0) {
      return jsonError(400, {
        error: "NO_MESSAGES",
        message: "No messages found for this session",
        requestId,
        site,
        sessionId,
      });
    }

    // Apply caps (last N messages + last N chars)
    const normalizedWindow = normalizedAll.slice(-Math.max(1, MAX_MSGS));

    // Char cap (walk backwards to keep the most recent content)
    let totalChars = 0;
    const normalized: typeof normalizedWindow = [];
    for (let i = normalizedWindow.length - 1; i >= 0; i--) {
      const m = normalizedWindow[i];
      const add = (m.content?.length ?? 0) + 32;
      if (normalized.length > 0 && totalChars + add > MAX_CHARS) break;
      normalized.unshift(m);
      totalChars += add;
    }

    console.info(`[session:end][${requestId}] normalized`, {
      originalCount: normalizedAll.length,
      cappedCount: normalized.length,
      approxChars: totalChars,
      mode,
    });

    let wp: { id: number | string; link?: string | null };

    const tWp0 = Date.now();
    try {
      wp =
        mode === "transcript"
          ? await createWpDraftFromSession({
              site,
              startedAt: ended.startedAt,
              messages: normalized,
              requestId,
            })
          : await createWpArticleDraftFromSession({
              site,
              startedAt: ended.startedAt,
              messages: normalized,
              requestId,
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
        msInWpStep: Date.now() - tWp0,
        messageCount: normalized.length,
        approxChars: totalChars,
        status,
        message: safeMessage(err),
        wpBodyHead: err instanceof WpError ? err.bodyText.slice(0, 300) : undefined,
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
      approxChars: totalChars,
      wpPostId: wp.id,
      wpLink: wp.link ?? null,
      msWpStep: Date.now() - tWp0,
      msTotal: Date.now() - t0,
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
      msTotal: Date.now() - t0,
      note: sessionBelongsToSite ? undefined : "session_end_fail_soft_no_session_row",
    });
  } catch (err) {
    console.error(`[session:end][${requestId}] Unhandled error`, {
      site,
      sessionId,
      mode,
      message: safeMessage(err),
      msTotal: Date.now() - t0,
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
