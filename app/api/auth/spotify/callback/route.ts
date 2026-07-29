import { NextRequest, NextResponse } from "next/server";
import { decodeSignedPayload, encodeSignedPayload, STATE_COOKIE, TOKEN_COOKIE } from "@/lib/auth";
import { exchangeCodeForToken } from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Redirect targets must stay on the host the browser is actually on: in dev
  // request.url reports the bind host (localhost), and sending the browser
  // there would strand it on an origin that never got the session cookie.
  const home = (params: Record<string, string>) => {
    const target = new URL("/", request.url);
    const host = request.headers.get("host");
    if (host) target.host = host;
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return target;
  };

  const rawStateCookie = request.cookies.get(STATE_COOKIE)?.value;
  const cookieState = decodeSignedPayload<{ state: string }>(rawStateCookie);

  if (!code || !state || !cookieState || cookieState.state !== state) {
    return NextResponse.redirect(home({ error: "spotify_oauth" }));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const target = home({ spotify: "connected" });
    const response = NextResponse.redirect(target);

    response.cookies.set({
      name: TOKEN_COOKIE,
      value: encodeSignedPayload(token),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });

    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch {
    return NextResponse.redirect(home({ error: "spotify_token" }));
  }
}
