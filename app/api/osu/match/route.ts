import { NextRequest, NextResponse } from "next/server";
import { findOsuMatches, hasStrongMatch } from "@/lib/osuMatch";
import { readStore, updateStore } from "@/lib/store";

export const runtime = "nodejs";

type MatchRequest = {
  trackId?: string;
  trackIds?: string[];
};

type SuccessfulMatch = {
  trackId: string;
  matches: Awaited<ReturnType<typeof findOsuMatches>>;
  strongMatch: boolean;
  autoGenerate: boolean;
};

type FailedMatch = {
  trackId: string;
  error: string;
  statusCode: number;
};

function normalizeTrackIds(body: MatchRequest) {
  const ids = Array.isArray(body.trackIds) ? body.trackIds : body.trackId ? [body.trackId] : [];
  return Array.from(
    new Set(
      ids
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as MatchRequest;
  const trackIds = normalizeTrackIds(body);
  const legacySingle = Boolean(body.trackId) && !Array.isArray(body.trackIds);

  if (trackIds.length === 0) {
    return NextResponse.json({ error: "trackId or trackIds[] is required" }, { status: 400 });
  }

  const store = readStore();
  const tracksById = new Map(store.tracks.map((track) => [track.id, track]));
  const outcomes: Array<SuccessfulMatch | FailedMatch> = await Promise.all(
    trackIds.map(async (trackId) => {
      const track = tracksById.get(trackId);
      if (!track) {
        return { trackId, error: "Track not found", statusCode: 404 };
      }

      try {
        const matches = await findOsuMatches(track);
        return {
          trackId,
          matches,
          strongMatch: hasStrongMatch(matches),
          autoGenerate: matches.length === 0,
        };
      } catch (error) {
        return {
          trackId,
          error: error instanceof Error ? error.message : "Match failed",
          statusCode: 500,
        };
      }
    }),
  );

  const trackResults: Record<
    string,
    {
      matches: Awaited<ReturnType<typeof findOsuMatches>>;
      strongMatch: boolean;
      autoGenerate: boolean;
      error?: string;
    }
  > = {};

  let matchedCount = 0;
  let unmatchedCount = 0;
  let errorCount = 0;

  const updatedAt = new Date().toISOString();
  updateStore((nextStore) => {
    for (const outcome of outcomes) {
      if ("error" in outcome) {
        trackResults[outcome.trackId] = {
          matches: [],
          strongMatch: false,
          autoGenerate: false,
          error: outcome.error,
        };
        nextStore.matchesByTrackId[outcome.trackId] = {
          trackId: outcome.trackId,
          matches: [],
          strongMatch: false,
          autoGenerate: false,
          updatedAt,
          error: outcome.error,
        };
        errorCount += 1;
        continue;
      }

      trackResults[outcome.trackId] = {
        matches: outcome.matches,
        strongMatch: outcome.strongMatch,
        autoGenerate: outcome.autoGenerate,
      };
      nextStore.matchesByTrackId[outcome.trackId] = {
        trackId: outcome.trackId,
        matches: outcome.matches,
        strongMatch: outcome.strongMatch,
        autoGenerate: outcome.autoGenerate,
        updatedAt,
      };

      if (outcome.matches.length > 0) {
        matchedCount += 1;
      } else {
        unmatchedCount += 1;
      }
    }
  });

  if (legacySingle) {
    const first = outcomes[0];
    if (!first) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    if ("error" in first) {
      return NextResponse.json({ error: first.error }, { status: first.statusCode });
    }

    return NextResponse.json({
      matches: first.matches,
      strongMatch: first.strongMatch,
      autoGenerate: first.autoGenerate,
      trackResults,
      summary: {
        total: trackIds.length,
        matchedCount,
        unmatchedCount,
        errorCount,
      },
    });
  }

  return NextResponse.json({
    trackResults,
    summary: {
      total: trackIds.length,
      matchedCount,
      unmatchedCount,
      errorCount,
    },
  });
}
