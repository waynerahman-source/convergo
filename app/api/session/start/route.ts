// app/api/session/start/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Incoming = {
  site?: string;
};

function json(ok: boolean, body: any, status = 200) {
  return NextResponse.json({ ok, ...body }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Incoming;
    const site = String(body.site ?? "default").trim() || "default";

    // MVP1: Session is simply a UUID; persistence happens via /api/messages with (site, sessionId)
    const sessionId = crypto.randomUUID();

    return json(true, { site, sessionId });
  } catch (err: any) {
    return json(false, { error: "START_SESSION_FAILED", message: String(err) }, 500);
  }
}
