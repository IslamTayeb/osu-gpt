import { NextRequest, NextResponse } from "next/server";
import {
  AWS_RUNTIME_COOKIE,
  decodeAwsRuntimeSession,
  encodeAwsRuntimeSession,
  isAwsRuntimeSessionConfigured,
  maskAwsRuntimeSession,
  normalizeAwsRuntimeSessionInput,
} from "@/lib/awsSession";
import { detectAwsBatchGpuHint } from "@/lib/awsAutoConfig";

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
      profile?: string;
      region?: string;
      batchQueue?: string;
      batchJobDefinition?: string;
      s3Bucket?: string;
      s3Prefix?: string;
      cloudWatchLogGroup?: string;
    };
    let session = normalizeAwsRuntimeSessionInput(body);
    if (isAwsRuntimeSessionConfigured(session)) {
      try {
        const gpuHint = await detectAwsBatchGpuHint({
          region: session.region,
          credentials: {
            accessKeyId: session.accessKeyId,
            secretAccessKey: session.secretAccessKey,
            sessionToken: session.sessionToken,
          },
          batchQueue: session.batchQueue,
          batchJobDefinition: session.batchJobDefinition,
        });
        session = normalizeAwsRuntimeSessionInput({
          ...session,
          gpuHint: gpuHint.gpuHint,
          gpuCountPerJob: gpuHint.gpuCountPerJob,
        });
      } catch {
        // GPU detection is best-effort.
      }
    }
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

export async function PATCH(request: NextRequest) {
  try {
    const existing = decodeAwsRuntimeSession(request.cookies.get(AWS_RUNTIME_COOKIE)?.value);
    if (!existing) {
      return NextResponse.json({ error: "No AWS session found. Load credentials first." }, { status: 400 });
    }

    const body = (await request.json()) as {
      profile?: string;
      region?: string;
      batchQueue?: string;
      batchJobDefinition?: string;
      s3Bucket?: string;
      s3Prefix?: string;
      cloudWatchLogGroup?: string;
    };

    let session = normalizeAwsRuntimeSessionInput(
      {
        accessKeyId: existing.accessKeyId,
        secretAccessKey: existing.secretAccessKey,
        sessionToken: existing.sessionToken,
        profile: body.profile ?? existing.profile,
        region: body.region ?? existing.region,
        batchQueue: body.batchQueue ?? existing.batchQueue,
        batchJobDefinition: body.batchJobDefinition ?? existing.batchJobDefinition,
        s3Bucket: body.s3Bucket ?? existing.s3Bucket,
        s3Prefix: body.s3Prefix ?? existing.s3Prefix,
        cloudWatchLogGroup: body.cloudWatchLogGroup ?? existing.cloudWatchLogGroup,
        gpuHint: existing.gpuHint,
        gpuCountPerJob: existing.gpuCountPerJob,
      },
      { allowPartial: true },
    );
    if (isAwsRuntimeSessionConfigured(session)) {
      try {
        const gpuHint = await detectAwsBatchGpuHint({
          region: session.region,
          credentials: {
            accessKeyId: session.accessKeyId,
            secretAccessKey: session.secretAccessKey,
            sessionToken: session.sessionToken,
          },
          batchQueue: session.batchQueue,
          batchJobDefinition: session.batchJobDefinition,
        });
        session = normalizeAwsRuntimeSessionInput(
          {
            ...session,
            gpuHint: gpuHint.gpuHint,
            gpuCountPerJob: gpuHint.gpuCountPerJob,
          },
          { allowPartial: true },
        );
      } catch {
        // GPU detection is best-effort.
      }
    }
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
