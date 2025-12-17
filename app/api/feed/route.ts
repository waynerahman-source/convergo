// C:\Users\Usuario\Projects\convergo\app\api\feed\route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const limitParam = url.searchParams.get("limit");
  const siteParam = url.searchParams.get("site");

  const limitRaw = limitParam ? Number(limitParam) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

  const site = siteParam ? siteParam.trim() : null;

  const rows = await prisma.message.findMany({
    where: site ? { conversation: { site } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      conversation: { select: { site: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    limit,
    site: site ?? "ALL",
    items: rows.map((r) => ({
      id: r.id,
      site: r.conversation.site,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt,
    })),
  });
}
