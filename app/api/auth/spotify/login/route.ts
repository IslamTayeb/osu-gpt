import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, encodeSignedPayload } from "@/lib/auth";
import { createSpotifyAuthUrl, createState, spotifyRedirectUri } from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // OAuth must run on the host Spotify redirects back to (the registered URI
  // uses 127.0.0.1). Browsing on localhost would set the state cookie on a
  // different origin than the callback receives, which can never match — so
  // hop to the canonical host before starting the flow.
  // Compare on the Host header: in dev, request.url always reports the bind
  // host (localhost) whatever the browser typed, which would loop forever.
  const canonical = new URL(spotifyRedirectUri());
  const requestHost = request.headers.get("host");
  if (requestHost && requestHost !== canonical.host) {
    const hop = new URL(request.url);
    hop.protocol = canonical.protocol;
    hop.host = canonical.host;
    return NextResponse.redirect(hop);
  }

  const state = createState();
  const redirect = NextResponse.redirect(createSpotifyAuthUrl(state));

  redirect.cookies.set({
    name: STATE_COOKIE,
    value: encodeSignedPayload({ state }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return redirect;
}
