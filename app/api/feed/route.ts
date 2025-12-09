// app/api/feed/route.ts
import { NextResponse } from "next/server";
import { getFeed, ConvergoCategory } from "../../../lib/convergoStore";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const channelParam = url.searchParams.get("channel") as ConvergoCategory | null;

  const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 50;

  const feed = getFeed(limit, channelParam ?? undefined);
  return NextResponse.json(feed);
}
