// C:\Users\Usuario\Projects\convergo\app\api\messages\route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "user" | "assistant";

function toRole(role: string): Role {
  return role === "assistant" ? "assistant" : "user";
}

function okEmpty(site: string, warning: string) {
  // Return 200 so clients can render gracefully (no modal errors)
  return NextResponse.json({
    ok: false,
    site,
    conversationId: null,
    messages: [],
    warning,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = (searchParams.get("site") ?? "default").trim();

  try {
    const convo = await prisma.conversation.upsert({
      where: { site },
      update: {},
      create: { site },
    });

    const rows = await prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      site,
      conversationId: convo.id,
      messages: rows.map((m) => ({
        id: m.id,
        role: toRole(m.role),
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return okEmpty(site, `DB unavailable: ${String(err)}`);
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 200 });
  }

  const site = String(body?.site ?? "default").trim();
  const roleRaw = String(body?.role ?? "").trim();
  const content = String(body?.content ?? "").trim();

  // Always respond 200 (fail-soft)
  if (!site) {
    return NextResponse.json({ ok: false, error: "site is required." }, { status: 200 });
  }
  if (roleRaw !== "user" && roleRaw !== "assistant") {
    return NextResponse.json({ ok: false, error: 'role must be "user" or "assistant".' }, { status: 200 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "content is required." }, { status: 200 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ ok: false, error: "content too long (max 20000 chars)." }, { status: 200 });
  }

  try {
    const convo = await prisma.conversation.upsert({
      where: { site },
      update: {},
      create: { site },
    });

    const msg = await prisma.message.create({
      data: { conversationId: convo.id, role: roleRaw, content },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      site,
      conversationId: convo.id,
      message: {
        id: msg.id,
        role: toRole(msg.role),
        content: msg.content,
        createdAt: msg.createdAt,
      },
    });
  } catch (err) {
    // DB not writable/available in prod: do not break client
    return NextResponse.json({ ok: false, warning: `DB unavailable: ${String(err)}` }, { status: 200 });
  }
}
