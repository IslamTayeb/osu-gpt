import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { ensureTrackAudio } from "@/lib/audio";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Previews play the exact file generation will map: the same
 * spotdl → yt-dlp → loudnorm pipeline, same cache. What you hear is what the
 * model gets — and a previewed track generates instantly later because its
 * audio is already down.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await context.params;
  const store = readStore();
  const track = store.tracks.find((item) => item.id === trackId);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  // Same gate as generation: this downloads full audio from public sources.
  if (!store.settings.spotdlAcknowledgedAt) {
    return NextResponse.json(
      { error: "Acknowledge the audio download notice before previewing." },
      { status: 403 },
    );
  }

  try {
    const audio = await ensureTrackAudio(track, () => {}, { timeoutMs: 180_000 });
    return new NextResponse(new Uint8Array(fs.readFileSync(audio.path)), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(fs.statSync(audio.path).size),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch audio." },
      { status: 404 },
    );
  }
}
