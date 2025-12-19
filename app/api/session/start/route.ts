// C:\Users\Usuario\Projects\convergo\app\api\session\start\route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { site?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const site = (body.site ?? "default").trim();

  const convo = await prisma.conversation.upsert({
    where: { site },
    update: {},
    create: { site },
  });

  const session = await prisma.session.create({
    data: { conversationId: convo.id },
    select: { id: true, startedAt: true },
  });

  return NextResponse.json({
    ok: true,
    site,
    conversationId: convo.id,
    sessionId: session.id,
    startedAt: session.startedAt,
  });
}
