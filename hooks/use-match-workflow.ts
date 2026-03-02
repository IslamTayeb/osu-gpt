import { useCallback, type Dispatch, type SetStateAction } from "react";
import { chunkArray } from "@/lib/homeUi";
import type { BatchMatchResponse } from "@/lib/homeTypes";
import type { TrackMatchSnapshot } from "@/lib/types";

type UseMatchWorkflowParams = {
  selectedTrackIds: string[];
  setMatching: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setMatchSnapshots: Dispatch<SetStateAction<Record<string, TrackMatchSnapshot>>>;
  setLastMatchSummary: Dispatch<SetStateAction<BatchMatchResponse["summary"] | null>>;
  fetchTracks: () => Promise<void>;
};

type UseMatchWorkflowResult = {
  runBatchMatch: () => Promise<void>;
};

export function useMatchWorkflow({
  selectedTrackIds,
  setMatching,
  setError,
  setNotice,
  setMatchSnapshots,
  setLastMatchSummary,
  fetchTracks,
}: UseMatchWorkflowParams): UseMatchWorkflowResult {
  const runBatchMatch = useCallback(async () => {
    if (selectedTrackIds.length === 0) {
      setError("Select tracks first.");
      return;
    }

    const chunks = chunkArray(selectedTrackIds, 10);
    let matchedCount = 0;
    let unmatchedCount = 0;
    let errorCount = 0;

    setMatching(true);
    setError("");
    setNotice("");

    for (const chunk of chunks) {
      try {
        const response = await fetch("/api/osu/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackIds: chunk }),
        });
        const body = (await response.json()) as BatchMatchResponse & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Match failed");
        }

        matchedCount += body.summary?.matchedCount ?? 0;
        unmatchedCount += body.summary?.unmatchedCount ?? 0;
        errorCount += body.summary?.errorCount ?? 0;

        const now = new Date().toISOString();
        setMatchSnapshots((previous) => {
          const next = { ...previous };
          for (const [trackId, result] of Object.entries(body.trackResults ?? {})) {
            next[trackId] = {
              trackId,
              matches: result.matches ?? [],
              topHit: result.topHit ?? null,
              strongMatch: Boolean(result.strongMatch),
              autoGenerate: Boolean(result.autoGenerate),
              updatedAt: now,
              error: result.error,
            };
          }
          return next;
        });
      } catch {
        errorCount += chunk.length;
        const now = new Date().toISOString();
        setMatchSnapshots((previous) => {
          const next = { ...previous };
          for (const trackId of chunk) {
            next[trackId] = {
              trackId,
              matches: [],
              topHit: null,
              strongMatch: false,
              autoGenerate: false,
              updatedAt: now,
              error: "Match failed for this chunk",
            };
          }
          return next;
        });
      }
    }

    setLastMatchSummary({
      total: selectedTrackIds.length,
      matchedCount,
      unmatchedCount,
      errorCount,
    });
    setNotice("Match scan completed incrementally.");
    setMatching(false);
    await fetchTracks();
  }, [
    fetchTracks,
    selectedTrackIds,
    setError,
    setLastMatchSummary,
    setMatchSnapshots,
    setMatching,
    setNotice,
  ]);

  return { runBatchMatch };
}
