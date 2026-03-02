import crypto from "node:crypto";

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

const authBase = "https://accounts.spotify.com";

export const spotifyScopes = ["user-library-read"];

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function spotifyClientId() {
  return requireEnv("SPOTIFY_CLIENT_ID");
}

function spotifyClientSecret() {
  return requireEnv("SPOTIFY_CLIENT_SECRET");
}

export function spotifyRedirectUri() {
  return requireEnv("SPOTIFY_REDIRECT_URI");
}

export function createSpotifyAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: spotifyClientId(),
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    scope: spotifyScopes.join(" "),
    state,
    show_dialog: "false",
  });
  return `${authBase}/authorize?${params.toString()}`;
}

export function createState() {
  return crypto.randomBytes(16).toString("hex");
}

async function tokenRequest(params: URLSearchParams): Promise<SpotifyTokenResponse> {
  const basic = Buffer.from(`${spotifyClientId()}:${spotifyClientSecret()}`).toString("base64");
  const response = await fetch(`${authBase}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token exchange failed: ${text}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function exchangeCodeForToken(code: string) {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
    }),
  );

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

export async function refreshSpotifyToken(refreshToken: string) {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );

  return {
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
