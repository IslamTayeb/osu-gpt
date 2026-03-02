import { NextResponse } from "next/server";
import { getSpotifyImportStatus } from "@/lib/spotifyImportJob";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ status: getSpotifyImportStatus() });
}
