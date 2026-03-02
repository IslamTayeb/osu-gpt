import { NextRequest, NextResponse } from "next/server";
import {
  OSU_RUNTIME_COOKIE,
  decodeOsuRuntimeSession,
  encodeOsuRuntimeSession,
  maskOsuRuntimeSession,
  normalizeOsuRuntimeSessionInput,
} from "@/lib/osuSession";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = decodeOsuRuntimeSession(request.cookies.get(OSU_RUNTIME_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json(maskOsuRuntimeSession(session));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { clientId?: string; clientSecret?: string };
    const session = normalizeOsuRuntimeSessionInput(body);
    const cookieValue = encodeOsuRuntimeSession(session);
    const response = NextResponse.json(maskOsuRuntimeSession(session));
    response.cookies.set({
      name: OSU_RUNTIME_COOKIE,
      value: cookieValue,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save osu runtime session." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, configured: false });
  response.cookies.set({
    name: OSU_RUNTIME_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
