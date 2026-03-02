import crypto from "node:crypto";

const TOKEN_COOKIE = "spotify_session";
const STATE_COOKIE = "spotify_oauth_state";

export type SpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return secret;
}

function toBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function encodeSignedPayload<T>(value: T): string {
  const payload = toBase64Url(JSON.stringify(value));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function decodeSignedPayload<T>(value: string | undefined): T | null {
  if (!value || !value.includes(".")) {
    return null;
  }
  const [payload, sig] = value.split(".");
  if (!payload || !sig || sign(payload) !== sig) {
    return null;
  }
  return JSON.parse(fromBase64Url(payload)) as T;
}

export { TOKEN_COOKIE, STATE_COOKIE };
