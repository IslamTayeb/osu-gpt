import { Track } from "./types";

/**
 * Catalogue search, as opposed to the liked-songs import in ./spotifyImport.
 * Results are not written to the store until the user actually picks one —
 * searching should never quietly grow the library.
 */

type SpotifyImage = { url: string };

type SpotifyTrackObject = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images?: SpotifyImage[] };
  duration_ms: number;
  external_urls: { spotify: string };
  external_ids?: { isrc?: string };
};

async function spotifyGet<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Spotify API failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/**
 * Search results share the `<id>:<source>:<label>` id shape with imported
 * tracks, so a song that is already in the library keeps the same id and the
 * pane shows its existing "generated" badge instead of appearing as new.
 */
export function searchResultToTrack(input: SpotifyTrackObject): Track {
  return {
    id: `${input.id}:search:Spotify`,
    provider: "spotify",
    providerTrackId: input.id,
    title: input.name,
    artists: input.artists.map((artist) => artist.name),
    album: input.album.name,
    durationMs: input.duration_ms,
    artworkUrl: input.album.images?.[0]?.url ?? "",
    externalUrl: input.external_urls.spotify,
    isrc: input.external_ids?.isrc,
    source: "search",
    sourceLabel: "Spotify",
    importedAt: new Date().toISOString(),
  };
}

export async function searchSpotifyTracks(
  accessToken: string,
  query: string,
  limit = 25,
): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url =
    `https://api.spotify.com/v1/search?type=track&limit=${Math.min(50, Math.max(1, limit))}` +
    `&q=${encodeURIComponent(trimmed)}`;
  const data = await spotifyGet<{ tracks?: { items?: SpotifyTrackObject[] } }>(accessToken, url);
  return (data.tracks?.items ?? []).filter(Boolean).map(searchResultToTrack);
}

/**
 * Re-fetch by id rather than trusting track data posted from the browser: the
 * client only ever sends ids, and durations and ISRCs come from Spotify.
 */
export async function fetchSpotifyTracksByIds(
  accessToken: string,
  ids: string[],
): Promise<Track[]> {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return [];
  const data = await spotifyGet<{ tracks?: Array<SpotifyTrackObject | null> }>(
    accessToken,
    `https://api.spotify.com/v1/tracks?ids=${unique.map(encodeURIComponent).join(",")}`,
  );
  return (data.tracks ?? []).filter((t): t is SpotifyTrackObject => Boolean(t)).map(searchResultToTrack);
}
