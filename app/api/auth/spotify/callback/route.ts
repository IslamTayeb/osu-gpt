import { NextRequest, NextResponse } from "next/server";
import { decodeSignedPayload, encodeSignedPayload, STATE_COOKIE, TOKEN_COOKIE } from "@/lib/auth";
import { exchangeCodeForToken } from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const rawStateCookie = request.cookies.get(STATE_COOKIE)?.value;
  const cookieState = decodeSignedPayload<{ state: string }>(rawStateCookie);

  if (!code || !state || !cookieState || cookieState.state !== state) {
    return NextResponse.redirect(new URL("/?error=spotify_oauth", request.url));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const target = new URL("/", request.url);
    target.searchParams.set("spotify", "connected");
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
    return NextResponse.redirect(new URL("/?error=spotify_token", request.url));
  }
}
