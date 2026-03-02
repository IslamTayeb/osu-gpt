import crypto from "node:crypto";
import { NextRequest } from "next/server";

export const OSU_RUNTIME_COOKIE = "osu_runtime_session";

export type OsuRuntimeSession = {
  clientId: string;
  clientSecret: string;
  updatedAt: string;
};

function secretKey() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

export function normalizeOsuRuntimeSessionInput(input: { clientId?: string; clientSecret?: string }) {
  const clientId = (input.clientId ?? "").trim();
  const clientSecret = (input.clientSecret ?? "").trim();
  if (!clientId) {
    throw new Error("clientId is required");
  }
  if (!clientSecret) {
    throw new Error("clientSecret is required");
  }
  return {
    clientId,
    clientSecret,
    updatedAt: new Date().toISOString(),
  };
}

export function encodeOsuRuntimeSession(session: OsuRuntimeSession) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const payload = Buffer.from(JSON.stringify(session), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(".");
}

export function decodeOsuRuntimeSession(cookieValue: string | undefined) {
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
    const parsed = JSON.parse(plain.toString("utf8")) as OsuRuntimeSession;
    if (!parsed?.clientId || !parsed?.clientSecret) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function maskOsuRuntimeSession(session: OsuRuntimeSession) {
  return {
    configured: true,
    clientIdHint: session.clientId.length > 2 ? `${session.clientId.slice(0, 2)}****` : "****",
    updatedAt: session.updatedAt,
  };
}

export function getOsuRuntimeSessionFromRequest(request: NextRequest) {
  return decodeOsuRuntimeSession(request.cookies.get(OSU_RUNTIME_COOKIE)?.value);
}
