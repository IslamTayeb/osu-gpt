import { MatchResult, Track } from "./types";

type OsuSearchResponse = {
  beatmapsets: Array<{
    id: number;
    artist: string;
    title: string;
    status: string;
  }>;
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

export async function findOsuMatches(track: Track): Promise<MatchResult[]> {
  const queries = Array.from(new Set([track.title.trim(), `${track.artists.join(" ")} ${track.title}`.trim()])).filter(
    Boolean,
  );
  const foundSets: OsuSearchResponse["beatmapsets"] = [];
  const seenSetIds = new Set<number>();

  for (const query of queries) {
    const url = `https://osu.ppy.sh/beatmapsets/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`osu search failed (${response.status})`);
    }

    const data = (await response.json()) as OsuSearchResponse;
    for (const set of data.beatmapsets ?? []) {
      if (seenSetIds.has(set.id)) {
        continue;
      }
      seenSetIds.add(set.id);
      foundSets.push(set);
    }
  }

  const allowedStatuses = new Set(["ranked", "loved"]);

  const matches = foundSets
    .filter((set) => allowedStatuses.has(set.status))
    .filter(
      (set) => normalizedSubstringMatch(track.title, set.title) && artistSubstringMatch(track.artists, set.artist),
    )
    .map((set) => {
      const rationale = "title substring exact match (required), artist substring exact match (required)";

      return {
        beatmapsetId: set.id,
        title: set.title,
        artist: set.artist,
        status: set.status as "ranked" | "loved",
        url: `https://osu.ppy.sh/beatmapsets/${set.id}`,
        confidence: 0.99,
        rationale,
        durationDeltaMs: 0,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return matches;
}

export function hasStrongMatch(matches: MatchResult[]) {
  return matches.some((m) => m.confidence >= 0.72);
}
