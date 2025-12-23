// app/api/session/start/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Incoming = {
  site?: string;
};

function sanitizeSite(raw: string) {
  // Keep it simple + safe for DB keys / slugs
  // Allows letters, numbers, dash, underscore, dot
  const cleaned = (raw || "default").trim().replace(/[^\w.-]/g, "");
  return cleaned || "default";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Incoming;
    const site = sanitizeSite(body.site ?? "default");

    // Always produce a sessionId (even if persistence fails)
    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // OPTIONAL persistence (fail-soft)
    // If you have Prisma + Message model etc, try to write.
    // If it fails, we still return sessionId (MVP-safe).
    try {
      // Lazy import so missing prisma/migrations don't crash the route
      const { prisma } = await import("../../../lib/prisma");

      // If you have a Session table, use it. If not, skip.
      // This is guarded so it won't throw if the model doesn't exist.
      // @ts-ignore
      if (prisma?.session?.create) {
        // @ts-ignore
        await prisma.session.create({
          data: {
            id: sessionId,
            site,
            createdAt: new Date(),
          },
        });
      }
    } catch {
      // ignore persistence failures for MVP1 stability
    }

    return NextResponse.json({ ok: true, site, sessionId });
  } catch (err) {
    // Always JSON, never HTML
    return NextResponse.json(
      { ok: false, error: "SESSION_START_FAILED", detail: String(err) },
      { status: 500 }
    );
  }
}
