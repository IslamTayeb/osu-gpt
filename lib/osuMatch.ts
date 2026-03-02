import { MatchResult, Track } from "./types";
import { OsuAuthCredentials, searchOsuBeatmapsets } from "./osuApi";

type OsuBeatmapset = {
  id: number;
  artist: string;
  title: string;
  status: string;
};

export type FindOsuMatchesResult = {
  matches: MatchResult[];
  topHit: MatchResult | null;
};

function normalize(input: string) {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSubstringMatch(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left) && Boolean(right) && (left.includes(right) || right.includes(left));
}

function artistSubstringMatch(trackArtists: string[], setArtist: string) {
  const combinedTrackArtist = trackArtists.join(" ");
  if (normalizedSubstringMatch(combinedTrackArtist, setArtist)) {
    return true;
  }
  return trackArtists.some((artist) => normalizedSubstringMatch(artist, setArtist));
}

function tokenSet(input: string) {
  return new Set(normalize(input).split(" ").filter(Boolean));
}

function tokenSimilarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (left.size + right.size);
}

function toMatchResult(set: OsuBeatmapset, confidence: number, rationale: string): MatchResult {
  return {
    beatmapsetId: set.id,
    title: set.title,
    artist: set.artist,
    status: set.status,
    url: `https://osu.ppy.sh/beatmapsets/${set.id}`,
    confidence,
    rationale,
    durationDeltaMs: 0,
  };
}

function looseScore(track: Track, set: OsuBeatmapset) {
  const titleSim = tokenSimilarity(track.title, set.title);
  const artistSim = tokenSimilarity(track.artists.join(" "), set.artist);
  const titleBonus = normalizedSubstringMatch(track.title, set.title) ? 0.35 : 0;
  const artistBonus = artistSubstringMatch(track.artists, set.artist) ? 0.35 : 0;
  return Math.min(1, 0.2 * titleSim + 0.1 * artistSim + titleBonus + artistBonus);
}

export async function findOsuMatches(
  track: Track,
  osuCredentials?: OsuAuthCredentials | null,
): Promise<FindOsuMatchesResult> {
  const queries = Array.from(new Set([track.title.trim(), `${track.artists.join(" ")} ${track.title}`.trim()])).filter(
    Boolean,
  );
  const foundSets: OsuBeatmapset[] = [];
  const seenSetIds = new Set<number>();

  for (const query of queries) {
    const beatmapsets = await searchOsuBeatmapsets(query, osuCredentials);
    for (const set of beatmapsets ?? []) {
      if (seenSetIds.has(set.id)) {
        continue;
      }
      seenSetIds.add(set.id);
      foundSets.push(set);
    }
  }

  const matches = foundSets
    .filter(
      (set) => normalizedSubstringMatch(track.title, set.title) && artistSubstringMatch(track.artists, set.artist),
    )
    .map((set) => toMatchResult(set, 0.99, "title substring exact match (required), artist substring exact match (required)"))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  let topHit: MatchResult | null = null;
  if (matches.length === 0 && foundSets.length > 0) {
    const best = foundSets
      .map((set) => ({ set, score: looseScore(track, set) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0.2) {
      topHit = toMatchResult(
        best.set,
        Math.max(0.35, best.score),
        "closest title/artist hit from osu search (not an exact title+artist substring match)",
      );
    }
  }

  return { matches, topHit };
}

export function hasStrongMatch(matches: MatchResult[]) {
  return matches.some((m) => m.confidence >= 0.72);
}
