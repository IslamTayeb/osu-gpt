import { NextResponse } from "next/server";
import { STATE_COOKIE, encodeSignedPayload } from "@/lib/auth";
import { createSpotifyAuthUrl, createState } from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET() {
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
