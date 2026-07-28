import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { ensurePreview } from "@/lib/previews";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await context.params;
  const track = readStore().tracks.find((item) => item.id === trackId);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const file = await ensurePreview(track);
  if (!file) {
    return NextResponse.json({ error: "No preview available for this track." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fs.statSync(file).size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
