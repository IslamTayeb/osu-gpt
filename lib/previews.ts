import fs from "node:fs";
import path from "node:path";
import { resolveAudioCacheDir } from "./store";
import { Track } from "./types";

/**
 * Spotify stopped serving preview_url to new apps in November 2024, so previews
 * come from Deezer (matched by ISRC where possible, which is exact) with iTunes
 * as a fallback. Preview URLs carry expiring tokens, so the bytes are cached,
 * not the URL.
 */
const DURATION_TOLERANCE_S = 5;

export function previewPath(track: Track) {
  const dir = path.join(resolveAudioCacheDir(), "previews");
  return {
    dir,
    file: path.join(dir, `${track.provider}-${track.providerTrackId}.mp3`),
  };
}

export function hasPreview(track: Track) {
  return fs.existsSync(previewPath(track).file);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": "osu-gpt/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

type DeezerTrack = { preview?: string; duration?: number; title?: string };

async function deezerByIsrc(isrc: string): Promise<string | null> {
  try {
    const data = (await fetchJson(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
    )) as DeezerTrack & { error?: unknown };
    if (!data || data.error || !data.preview) return null;
    return data.preview;
  } catch {
    return null;
  }
}

async function deezerBySearch(track: Track): Promise<string | null> {
  try {
    const query = `${track.artists.join(" ")} ${track.title}`.trim();
    const data = (await fetchJson(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
    )) as { data?: DeezerTrack[] };
    const target = track.durationMs / 1000;
    const hit = data.data?.find(
      (candidate) =>
        candidate.preview &&
        Math.abs((candidate.duration ?? 0) - target) <= DURATION_TOLERANCE_S,
    );
    return hit?.preview ?? null;
  } catch {
    return null;
  }
}

async function itunesSearch(track: Track): Promise<string | null> {
  try {
    const query = `${track.artists.join(" ")} ${track.title}`.trim();
    const data = (await fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&media=music`,
    )) as { results?: { previewUrl?: string; trackTimeMillis?: number }[] };
    const hit = data.results?.find(
      (candidate) =>
        candidate.previewUrl &&
        Math.abs((candidate.trackTimeMillis ?? 0) - track.durationMs) <=
          DURATION_TOLERANCE_S * 1000,
    );
    return hit?.previewUrl ?? data.results?.find((r) => r.previewUrl)?.previewUrl ?? null;
  } catch {
    return null;
  }
}

/** Return a cached preview clip for a track, fetching it on first use. */
export async function ensurePreview(track: Track): Promise<string | null> {
  const { dir, file } = previewPath(track);
  if (fs.existsSync(file)) return file;

  const url =
    (track.isrc ? await deezerByIsrc(track.isrc) : null) ??
    (await deezerBySearch(track)) ??
    (await itunesSearch(track));
  if (!url) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    return file;
  } catch {
    return null;
  }
}
