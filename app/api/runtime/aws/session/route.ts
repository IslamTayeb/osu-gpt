import { NextRequest, NextResponse } from "next/server";
import {
  AWS_RUNTIME_COOKIE,
  decodeAwsRuntimeSession,
  encodeAwsRuntimeSession,
  maskAwsRuntimeSession,
  normalizeAwsRuntimeSessionInput,
} from "@/lib/awsSession";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = decodeAwsRuntimeSession(request.cookies.get(AWS_RUNTIME_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json(maskAwsRuntimeSession(session));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
      region?: string;
      batchQueue?: string;
      batchJobDefinition?: string;
      s3Bucket?: string;
      s3Prefix?: string;
      cloudWatchLogGroup?: string;
    };
    const session = normalizeAwsRuntimeSessionInput(body);
    const cookieValue = encodeAwsRuntimeSession(session);
    const response = NextResponse.json(maskAwsRuntimeSession(session));
    response.cookies.set({
      name: AWS_RUNTIME_COOKIE,
      value: cookieValue,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save AWS runtime session." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, configured: false });
  response.cookies.set({
    name: AWS_RUNTIME_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
