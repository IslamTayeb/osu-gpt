import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Spotify redirects here because that is the URI registered on the app
 * (SPOTIFY_REDIRECT_URI). Forward to the real handler, preserving the code and
 * state params.
 */
export async function GET(request: NextRequest) {
  // Stay on the exact host the browser used. Spotify's loopback URI is
  // 127.0.0.1, and redirecting to localhost would be a different origin, so the
  // signed state cookie set at login would not come back with the request.
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) target.host = host;
  target.pathname = "/api/auth/spotify/callback";
  return NextResponse.redirect(target);
}
