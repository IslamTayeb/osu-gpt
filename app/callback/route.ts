import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const incoming = new URL(request.url);
  const target = new URL("/api/auth/spotify/callback", request.url);
  for (const [key, value] of incoming.searchParams.entries()) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}
