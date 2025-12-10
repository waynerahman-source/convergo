// app/api/capture/route.ts
import { NextResponse } from "next/server";
import { addMessage, ConversationUnit } from "../../../lib/convergoStore";

type CaptureBody = {
  speaker: "H" | "A";
  text: string;
  // Align with the store type
  category?: ConversationUnit["category"];
  tags?: ConversationUnit["tags"];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CaptureBody>;

    if (!body.speaker || !body.text) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "speaker and text are required",
          },
        },
        { status: 400 }
      );
    }

    if (body.speaker !== "H" && body.speaker !== "A") {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "speaker must be 'H' or 'A'",
          },
        },
        { status: 400 }
      );
    }

    const cu = addMessage({
      speaker: body.speaker,
      text: body.text,
      // Explicitly assert the type so TS is happy
      category: body.category as ConversationUnit["category"],
      tags: body.tags,
    });

    return NextResponse.json(
      {
        status: "ok",
        data: cu,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Capture error", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to capture message",
        },
      },
      { status: 500 }
    );
  }
}
