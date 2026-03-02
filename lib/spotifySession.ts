import { cookies } from "next/headers";
import { decodeSignedPayload, encodeSignedPayload, SpotifySession, TOKEN_COOKIE } from "./auth";
import { refreshSpotifyToken } from "./spotify";

export async function getSpotifySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOKEN_COOKIE)?.value;
  const session = decodeSignedPayload<SpotifySession>(raw);
  return session;
}

export async function getValidSpotifyAccessToken() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOKEN_COOKIE)?.value;
  const session = decodeSignedPayload<SpotifySession>(raw);

  if (!session) {
    return { accessToken: null as string | null, updatedCookie: null as string | null };
  }

  if (session.expiresAt > Date.now() + 60_000) {
    return { accessToken: session.accessToken, updatedCookie: null as string | null };
  }

  if (!session.refreshToken) {
    return { accessToken: null as string | null, updatedCookie: null as string | null };
  }

  const refreshed = await refreshSpotifyToken(session.refreshToken);
  const cookieValue = encodeSignedPayload(refreshed);
  return { accessToken: refreshed.accessToken, updatedCookie: cookieValue };
}
