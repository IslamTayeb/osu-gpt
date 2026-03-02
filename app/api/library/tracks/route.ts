import { NextRequest, NextResponse } from "next/server";
import type { Track, TrackMatchSnapshot } from "@/lib/types";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;

type MatchFilter = "all" | "matched" | "unmatched" | "generated";
type ProviderFilter = "all" | Track["provider"];
type SourceFilter = "all" | Track["source"];

function toPositiveInt(input: string | null, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeQuery(input: string | null) {
  return (input ?? "").trim().toLowerCase();
}

function filterTrack(
  track: Track,
  filters: {
    query: string;
    provider: ProviderFilter;
    source: SourceFilter;
    match: MatchFilter;
  },
  matchesByTrackId: Record<string, TrackMatchSnapshot>,
  completedTrackIds: Set<string>,
) {
  if (filters.provider !== "all" && track.provider !== filters.provider) {
    return false;
  }
  if (filters.source !== "all" && track.source !== filters.source) {
    return false;
  }

  const snapshot = matchesByTrackId[track.id];
  if (filters.match === "matched" && (!snapshot || snapshot.matches.length === 0)) {
    return false;
  }
  if (
    filters.match === "unmatched" &&
    (!snapshot || Boolean(snapshot.error) || snapshot.matches.length > 0)
  ) {
    return false;
  }
  if (filters.match === "generated" && !completedTrackIds.has(track.id)) {
    return false;
  }

  if (!filters.query) {
    return true;
  }
  const haystack = [track.title, track.artists.join(" "), track.album, track.sourceLabel]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.query);
}

export async function GET(request: NextRequest) {
  const store = readStore();
  const params = request.nextUrl.searchParams;

  const page = toPositiveInt(params.get("page"), 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, toPositiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE));
  const query = normalizeQuery(params.get("query"));
  const provider = (params.get("provider") ?? "all") as ProviderFilter;
  const source = (params.get("source") ?? "all") as SourceFilter;
  const match = (params.get("match") ?? "all") as MatchFilter;

  const completedTrackIds = new Set(
    store.jobs.filter((job) => job.status === "completed").map((job) => job.trackId),
  );

  const filteredTracks = store.tracks.filter((track) =>
    filterTrack(track, { query, provider, source, match }, store.matchesByTrackId, completedTrackIds),
  );

  const total = filteredTracks.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const tracks = filteredTracks.slice(start, start + pageSize);

  const pageMatchesByTrackId: Record<string, TrackMatchSnapshot> = {};
  for (const track of tracks) {
    const snapshot = store.matchesByTrackId[track.id];
    if (snapshot) {
      pageMatchesByTrackId[track.id] = snapshot;
    }
  }

  return NextResponse.json({
    tracks,
    matchesByTrackId: pageMatchesByTrackId,
    totalTracks: store.tracks.length,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      start: total === 0 ? 0 : start + 1,
      end: Math.min(start + tracks.length, total),
    },
  });
}
