import { NextRequest, NextResponse } from "next/server";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  AWS_RUNTIME_COOKIE,
  encodeAwsRuntimeSession,
  maskAwsRuntimeSession,
  normalizeAwsRuntimeSessionInput,
} from "@/lib/awsSession";
import { autoDetectAwsRuntimeResources, detectAwsBatchGpuHint } from "@/lib/awsAutoConfig";

export const runtime = "nodejs";

type AwsAutoSessionBody = {
  profile?: string;
  region?: string;
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  cloudWatchLogGroup?: string;
};

function normalizeProfile(raw: string | undefined) {
  const profile = (raw ?? "default").trim() || "default";
  if (!/^[A-Za-z0-9_./=@+-]+$/.test(profile)) {
    throw new Error("Invalid AWS profile name.");
  }
  return profile;
}

function resolveRegion(raw: string | undefined) {
  const region = (raw ?? "").trim() || process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "";
  if (!region) {
    throw new Error("region is required (set Region field or AWS_REGION).");
  }
  return region;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AwsAutoSessionBody;
    const profile = normalizeProfile(body.profile);
    const region = resolveRegion(body.region);

    const credentialProvider = defaultProvider({ profile });
    const credentials = await credentialProvider();
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error("AWS credentials were not resolved. Login with AWS SSO or configure environment credentials first.");
    }

    const resources = await autoDetectAwsRuntimeResources({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
      resources: {
        batchQueue: body.batchQueue,
        batchJobDefinition: body.batchJobDefinition,
        s3Bucket: body.s3Bucket,
        s3Prefix: body.s3Prefix,
        cloudWatchLogGroup: body.cloudWatchLogGroup,
      },
    });

    const gpuHint = await detectAwsBatchGpuHint({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
      batchQueue: resources.batchQueue,
      batchJobDefinition: resources.batchJobDefinition,
    });

    const session = normalizeAwsRuntimeSessionInput({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      profile,
      region,
      batchQueue: resources.batchQueue,
      batchJobDefinition: resources.batchJobDefinition,
      s3Bucket: resources.s3Bucket,
      s3Prefix: resources.s3Prefix,
      cloudWatchLogGroup: resources.cloudWatchLogGroup,
      gpuHint: gpuHint.gpuHint,
      gpuCountPerJob: gpuHint.gpuCountPerJob,
    });

    const cookieValue = encodeAwsRuntimeSession(session);
    const response = NextResponse.json({
      ...maskAwsRuntimeSession(session),
      profile,
    });
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
    const message = error instanceof Error ? error.message : "Could not auto-load AWS runtime session.";
    const hint = /sso|token|credentials/i.test(message)
      ? " If using AWS SSO, run `aws sso login --profile <profile>` first."
      : "";
    return NextResponse.json({ error: `${message}${hint}`.trim() }, { status: 400 });
  }
}
