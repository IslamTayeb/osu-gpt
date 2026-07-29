import { cookies } from "next/headers";
import { decodeSignedPayload, encodeSignedPayload, SpotifySession, TOKEN_COOKIE } from "./auth";
import { refreshSpotifyToken } from "./spotify";
import { readStore, updateStore } from "./store";

export async function getSpotifySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOKEN_COOKIE)?.value;
  const session = decodeSignedPayload<SpotifySession>(raw);
  return session;
}

/** One login should last: the refresh token also lives in the local store. */
export function rememberRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) return;
  updateStore((store) => {
    store.spotifyRefreshToken = refreshToken;
  });
}

/**
 * Access token from the cookie when it is fresh; otherwise refresh — via the
 * cookie's refresh token, or, when the cookie is gone entirely (new browser,
 * cleared cookies, the localhost/127.0.0.1 hop), the one remembered in the
 * store. Callers must set `updatedCookie` on their response when present.
 */
export async function getValidSpotifyAccessToken() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TOKEN_COOKIE)?.value;
  const session = decodeSignedPayload<SpotifySession>(raw);

  if (session && session.expiresAt > Date.now() + 60_000) {
    return { accessToken: session.accessToken, updatedCookie: null as string | null };
  }

  const refreshToken = session?.refreshToken ?? readStore().spotifyRefreshToken;
  if (!refreshToken) {
    return { accessToken: null as string | null, updatedCookie: null as string | null };
  }

  try {
    const refreshed = await refreshSpotifyToken(refreshToken);
    rememberRefreshToken(refreshed.refreshToken);
    return { accessToken: refreshed.accessToken, updatedCookie: encodeSignedPayload(refreshed) };
  } catch {
    return { accessToken: null as string | null, updatedCookie: null as string | null };
  }
}
