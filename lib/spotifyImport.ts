import { Track } from "./types";

export type SpotifyImportProgress = {
  phase: string;
  message: string;
  importedCount: number;
  tracksSnapshot?: Track[];
};

type SpotifyImage = { url: string };

type SavedTracksResponse = {
  items: Array<{
    track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images?: SpotifyImage[] };
      duration_ms: number;
      external_urls: { spotify: string };
    };
  }>;
  next: string | null;
};

async function spotifyGet<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify API failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

function asTrack(input: {
  providerTrackId: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  artworkUrl: string;
  externalUrl: string;
  source: "liked";
  sourceLabel: string;
}): Track {
  return {
    id: `${input.providerTrackId}:${input.source}:${input.sourceLabel}`,
    provider: "spotify",
    providerTrackId: input.providerTrackId,
    title: input.title,
    artists: input.artists,
    album: input.album,
    durationMs: input.durationMs,
    artworkUrl: input.artworkUrl,
    externalUrl: input.externalUrl,
    source: input.source,
    sourceLabel: input.sourceLabel,
    importedAt: new Date().toISOString(),
  };
}

export async function importSpotifyLibrary(accessToken: string): Promise<Track[]> {
  return importSpotifyLibraryWithProgress(accessToken);
}

export async function importSpotifyLibraryWithProgress(
  accessToken: string,
  onProgress?: (progress: SpotifyImportProgress) => void,
): Promise<Track[]> {
  const trackMap = new Map<string, Track>();
  let importedCount = 0;

  let savedUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
  onProgress?.({ phase: "liked", message: "Importing liked songs...", importedCount, tracksSnapshot: [] });
  while (savedUrl) {
    const pageUrl = savedUrl;
    const page: SavedTracksResponse = await spotifyGet<SavedTracksResponse>(accessToken, pageUrl);
    for (const row of page.items) {
      const t = row.track;
      if (!t?.id) {
        continue;
      }
      const key = `liked:${t.id}`;
      trackMap.set(
        key,
        asTrack({
          providerTrackId: t.id,
          title: t.name,
          artists: t.artists.map((a) => a.name),
          album: t.album.name,
          durationMs: t.duration_ms,
          artworkUrl: t.album.images?.[0]?.url ?? "",
          externalUrl: t.external_urls.spotify,
          source: "liked",
          sourceLabel: "Liked Songs",
        }),
      );
      importedCount += 1;
    }
    onProgress?.({
      phase: "liked",
      message: `Imported liked songs: ${trackMap.size}`,
      importedCount,
      tracksSnapshot: Array.from(trackMap.values()),
    });
    savedUrl = page.next;
  }

  onProgress?.({
    phase: "done",
    message: `Liked songs import completed: ${trackMap.size} tracks`,
    importedCount,
    tracksSnapshot: Array.from(trackMap.values()),
  });
  return Array.from(trackMap.values());
}
