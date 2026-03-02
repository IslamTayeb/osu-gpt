import crypto from "node:crypto";
import { NextRequest } from "next/server";

export const AWS_RUNTIME_COOKIE = "aws_runtime_session";
const MISSING_SENTINEL_PREFIX = "__missing__:";

export type AwsRuntimeSession = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  profile?: string;
  region: string;
  batchQueue: string;
  batchJobDefinition: string;
  s3Bucket: string;
  s3Prefix: string;
  cloudWatchLogGroup?: string;
  gpuHint?: string;
  gpuCountPerJob?: number;
  updatedAt: string;
};

export type AwsRuntimeSessionInput = {
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
  gpuHint?: string;
  gpuCountPerJob?: number;
};

function secretKey() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function isSafeToken(input: string) {
  return /^[a-zA-Z0-9:/=+_.-]+$/.test(input);
}

function requireField(value: string | undefined, field: string) {
  const next = (value ?? "").trim();
  if (!next) {
    throw new Error(`${field} is required`);
  }
  return next;
}

type NormalizeOptions = {
  allowPartial?: boolean;
};

function missingSentinel(field: string) {
  return `${MISSING_SENTINEL_PREFIX}${field}`;
}

function isMissingSentinel(value: string | undefined) {
  return Boolean(value && value.startsWith(MISSING_SENTINEL_PREFIX));
}

function cleanResourceField(value: string | undefined, field: string, allowPartial: boolean) {
  const next = (value ?? "").trim();
  if (next) {
    return next;
  }
  if (allowPartial) {
    return missingSentinel(field);
  }
  throw new Error(`${field} is required`);
}

function displayValue(value: string) {
  return isMissingSentinel(value) ? "" : value;
}

export function missingAwsRuntimeSessionFields(session: AwsRuntimeSession | null | undefined) {
  if (!session) {
    return ["accessKeyId", "secretAccessKey", "region", "batchQueue", "batchJobDefinition", "s3Bucket"];
  }

  const missing: string[] = [];
  if (!(session.accessKeyId ?? "").trim()) missing.push("accessKeyId");
  if (!(session.secretAccessKey ?? "").trim()) missing.push("secretAccessKey");
  if (!(session.region ?? "").trim()) missing.push("region");
  if (!(session.batchQueue ?? "").trim() || isMissingSentinel(session.batchQueue)) missing.push("batchQueue");
  if (!(session.batchJobDefinition ?? "").trim() || isMissingSentinel(session.batchJobDefinition)) {
    missing.push("batchJobDefinition");
  }
  if (!(session.s3Bucket ?? "").trim() || isMissingSentinel(session.s3Bucket)) missing.push("s3Bucket");
  return missing;
}

export function isAwsRuntimeSessionConfigured(session: AwsRuntimeSession | null | undefined) {
  return missingAwsRuntimeSessionFields(session).length === 0;
}

export function normalizeAwsRuntimeSessionInput(
  input: AwsRuntimeSessionInput,
  options: NormalizeOptions = {},
): AwsRuntimeSession {
  const allowPartial = Boolean(options.allowPartial);
  const accessKeyId = requireField(input.accessKeyId, "accessKeyId");
  const secretAccessKey = requireField(input.secretAccessKey, "secretAccessKey");
  const region = requireField(input.region, "region");
  const batchQueue = cleanResourceField(input.batchQueue, "batchQueue", allowPartial);
  const batchJobDefinition = cleanResourceField(input.batchJobDefinition, "batchJobDefinition", allowPartial);
  const s3Bucket = cleanResourceField(input.s3Bucket, "s3Bucket", allowPartial);
  const s3Prefix = (input.s3Prefix ?? "osu-gpt").trim() || "osu-gpt";
  const cloudWatchLogGroup = (input.cloudWatchLogGroup ?? "").trim();
  const gpuHint = (input.gpuHint ?? "").trim();
  const gpuCountPerJob =
    typeof input.gpuCountPerJob === "number" &&
    Number.isFinite(input.gpuCountPerJob) &&
    input.gpuCountPerJob > 0
      ? Math.floor(input.gpuCountPerJob)
      : undefined;
  const sessionToken = (input.sessionToken ?? "").trim();
  const profile = (input.profile ?? "").trim();

  if (!isSafeToken(region)) {
    throw new Error("region includes unsupported characters");
  }
  if (!isMissingSentinel(s3Bucket) && !isSafeToken(s3Bucket)) {
    throw new Error("s3Bucket includes unsupported characters");
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken || undefined,
    profile: profile || undefined,
    region,
    batchQueue,
    batchJobDefinition,
    s3Bucket,
    s3Prefix,
    cloudWatchLogGroup: cloudWatchLogGroup || undefined,
    gpuHint: gpuHint || undefined,
    gpuCountPerJob,
    updatedAt: new Date().toISOString(),
  };
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

export function encodeAwsRuntimeSession(session: AwsRuntimeSession) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const payload = Buffer.from(JSON.stringify(session), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(".");
}

export function decodeAwsRuntimeSession(cookieValue: string | undefined) {
  if (!cookieValue) {
    return null;
  }
  const [ivB64, tagB64, dataB64] = cookieValue.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    return null;
  }

  try {
    const iv = base64UrlDecode(ivB64);
    const tag = base64UrlDecode(tagB64);
    const encrypted = base64UrlDecode(dataB64);
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(plain.toString("utf8")) as AwsRuntimeSession;
    if (!parsed?.accessKeyId || !parsed?.secretAccessKey || !parsed?.region) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function maskAwsRuntimeSession(session: AwsRuntimeSession) {
  const missingFields = missingAwsRuntimeSessionFields(session);
  return {
    configured: missingFields.length === 0,
    missingFields,
    profile: session.profile,
    region: session.region,
    batchQueue: displayValue(session.batchQueue),
    batchJobDefinition: displayValue(session.batchJobDefinition),
    s3Bucket: displayValue(session.s3Bucket),
    s3Prefix: session.s3Prefix,
    cloudWatchLogGroup: session.cloudWatchLogGroup ?? null,
    gpuHint: session.gpuHint,
    gpuCountPerJob: session.gpuCountPerJob,
    accessKeyIdHint: session.accessKeyId.length >= 4 ? `****${session.accessKeyId.slice(-4)}` : "****",
    updatedAt: session.updatedAt,
  };
}

export function getAwsRuntimeSessionFromRequest(request: NextRequest) {
  const raw = request.cookies.get(AWS_RUNTIME_COOKIE)?.value;
  return decodeAwsRuntimeSession(raw);
}
