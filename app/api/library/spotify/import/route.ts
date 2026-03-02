import { NextResponse } from "next/server";
import { getValidSpotifyAccessToken } from "@/lib/spotifySession";
import { TOKEN_COOKIE } from "@/lib/auth";
import { startSpotifyImportJob } from "@/lib/spotifyImportJob";

export const runtime = "nodejs";

export async function POST() {
  const { accessToken, updatedCookie } = await getValidSpotifyAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Spotify." }, { status: 401 });
  }

  try {
    const status = startSpotifyImportJob(accessToken);

    const response = NextResponse.json({ ok: true, status });
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Spotify import failed." },
      { status: 500 },
    );
  }
}
