import { NextResponse } from "next/server";
import { getValidSpotifyAccessToken } from "@/lib/spotifySession";
import { TOKEN_COOKIE } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const { accessToken, updatedCookie } = await getValidSpotifyAccessToken();
  const store = readStore();
  const spotifyConnected = Boolean(accessToken);
  const importStatus = store.settings.spotifyImport ?? { status: "idle" as const };

  const response = NextResponse.json({
    spotifyConnected,
    spotdlAcknowledgedAt: store.settings.spotdlAcknowledgedAt ?? null,
    trackCount: store.tracks.length,
    importStatus,
  });
  // A session restored from the stored refresh token rides out as a new cookie.
  if (updatedCookie) {
    response.cookies.set({
      name: TOKEN_COOKIE,
      value: updatedCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return response;
}
