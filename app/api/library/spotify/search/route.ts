import { NextRequest, NextResponse } from "next/server";
import { getValidSpotifyAccessToken } from "@/lib/spotifySession";
import { fetchSpotifyTracksByIds, searchSpotifyTracks } from "@/lib/spotifySearch";
import { readStore, updateStore } from "@/lib/store";
import { TOKEN_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_RESULTS = 25;

/** Refreshing the token mid-request has to ride back out on the response. */
function withRefreshedToken(response: NextResponse, updatedCookie: string | null | undefined) {
  if (updatedCookie) {
    response.cookies.set({
      name: TOKEN_COOKIE,
      value: updatedCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return response;
}

/** Search the Spotify catalogue. Nothing is written to the library here. */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ tracks: [] });

  const { accessToken, updatedCookie } = await getValidSpotifyAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Connect Spotify to search." }, { status: 401 });
  }

  try {
    const tracks = await searchSpotifyTracks(accessToken, query, MAX_RESULTS);
    // Flag the ones already saved so the UI can say "in library" rather than
    // offering to add a track the user already has.
    const known = new Set(readStore().tracks.map((track) => track.id));
    return withRefreshedToken(
      NextResponse.json({
        tracks: tracks.map((track) => ({ ...track, inLibrary: known.has(track.id) })),
      }),
      updatedCookie,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Spotify search failed." },
      { status: 502 },
    );
  }
}

/** Add chosen results to the library. Takes ids only; data comes from Spotify. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { providerTrackIds?: string[] };
  const ids = Array.isArray(body.providerTrackIds) ? body.providerTrackIds : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Pick at least one track." }, { status: 400 });
  }

  const { accessToken, updatedCookie } = await getValidSpotifyAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Connect Spotify to add tracks." }, { status: 401 });
  }

  let added: Awaited<ReturnType<typeof fetchSpotifyTracksByIds>>;
  try {
    added = await fetchSpotifyTracksByIds(accessToken, ids);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read those tracks." },
      { status: 502 },
    );
  }

  updateStore((store) => {
    const known = new Set(store.tracks.map((track) => track.id));
    // Newest first, matching how the import leaves the list.
    store.tracks.unshift(...added.filter((track) => !known.has(track.id)));
  });

  return withRefreshedToken(NextResponse.json({ tracks: added }), updatedCookie);
}
