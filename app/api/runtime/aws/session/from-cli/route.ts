import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import {
  AWS_RUNTIME_COOKIE,
  encodeAwsRuntimeSession,
  maskAwsRuntimeSession,
  normalizeAwsRuntimeSessionInput,
} from "@/lib/awsSession";
import { autoDetectAwsRuntimeResources, detectAwsBatchGpuHint } from "@/lib/awsAutoConfig";

const execFileAsync = promisify(execFile);

type AwsCliCredentialProcessOutput = {
  Version?: number;
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
  Expiration?: string;
};

type AwsFromCliBody = {
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

async function runAwsCli(args: string[]) {
  try {
    const { stdout } = await execFileAsync("aws", args, {
      timeout: 15_000,
      maxBuffer: 1024 * 1024 * 2,
    });
    return stdout.trim();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      throw new Error("AWS CLI not found. Install AWS CLI v2, then run `aws configure sso` or `aws configure`.");
    }
    const stderr =
      typeof error === "object" && error && "stderr" in error ? String((error as { stderr?: string }).stderr ?? "").trim() : "";
    throw new Error(stderr || "AWS CLI command failed.");
  }
}

async function readRegionFromCli(profile: string) {
  try {
    const region = await runAwsCli(["configure", "get", "region", "--profile", profile]);
    if (region) {
      return region;
    }
  } catch {
    // Ignore and fallback to env vars.
  }
  return process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "";
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AwsFromCliBody;
    const profile = normalizeProfile(body.profile);

    const raw = await runAwsCli(["configure", "export-credentials", "--profile", profile, "--format", "process"]);
    const parsed = JSON.parse(raw) as AwsCliCredentialProcessOutput;
    if (!parsed.AccessKeyId || !parsed.SecretAccessKey) {
      throw new Error("AWS CLI did not return credentials for that profile.");
    }

    const region = (body.region ?? "").trim() || (await readRegionFromCli(profile));
    if (!region) {
      throw new Error("Could not determine AWS region. Set Region in the form or configure AWS_REGION.");
    }
    const resources = await autoDetectAwsRuntimeResources({
      region,
      credentials: {
        accessKeyId: parsed.AccessKeyId,
        secretAccessKey: parsed.SecretAccessKey,
        sessionToken: parsed.SessionToken,
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
        accessKeyId: parsed.AccessKeyId,
        secretAccessKey: parsed.SecretAccessKey,
        sessionToken: parsed.SessionToken,
      },
      batchQueue: resources.batchQueue,
      batchJobDefinition: resources.batchJobDefinition,
    });
    const session = normalizeAwsRuntimeSessionInput({
      accessKeyId: parsed.AccessKeyId,
      secretAccessKey: parsed.SecretAccessKey,
      sessionToken: parsed.SessionToken,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load AWS session from AWS CLI." },
      { status: 400 },
    );
  }
}
