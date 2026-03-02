import { useMemo } from "react";
import type { Track, TrackMatchSnapshot } from "@/lib/types";

type SelectionStats = {
  total: number;
  matched: number;
  unmatched: number;
  failed: number;
  generated: number;
};

export type SelectedMatchEntry = {
  track: Track;
  snapshot: TrackMatchSnapshot;
};

type UseSelectionDerivedParams = {
  selectedTrackIds: string[];
  matchSnapshots: Record<string, TrackMatchSnapshot>;
  completedTrackIdSet: Set<string>;
  trackById: Map<string, Track>;
};

type UseSelectionDerivedResult = {
  selectionStats: SelectionStats;
  unmatchedSelectedIds: string[];
  matchedSelected: SelectedMatchEntry[];
  unmatchedTopHits: SelectedMatchEntry[];
};

export function useSelectionDerived({
  selectedTrackIds,
  matchSnapshots,
  completedTrackIdSet,
  trackById,
}: UseSelectionDerivedParams): UseSelectionDerivedResult {
  const selectionStats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    let failed = 0;
    let generated = 0;

    for (const trackId of selectedTrackIds) {
      const snapshot = matchSnapshots[trackId];
      if (snapshot?.error) {
        failed += 1;
      } else if (snapshot && snapshot.matches.length > 0) {
        matched += 1;
      } else if (snapshot && snapshot.matches.length === 0) {
        unmatched += 1;
      }
      if (completedTrackIdSet.has(trackId)) {
        generated += 1;
      }
    }

    return {
      total: selectedTrackIds.length,
      matched,
      unmatched,
      failed,
      generated,
    };
  }, [selectedTrackIds, matchSnapshots, completedTrackIdSet]);

  const unmatchedSelectedIds = useMemo(
    () =>
      selectedTrackIds.filter((trackId) => {
        const snapshot = matchSnapshots[trackId];
        return Boolean(snapshot && !snapshot.error && snapshot.matches.length === 0);
      }),
    [selectedTrackIds, matchSnapshots],
  );

  const matchedSelected = useMemo(
    () =>
      selectedTrackIds
        .map((trackId) => ({
          track: trackById.get(trackId),
          snapshot: matchSnapshots[trackId],
        }))
        .filter((entry): entry is SelectedMatchEntry =>
          Boolean(entry.track && entry.snapshot && entry.snapshot.matches.length > 0),
        ),
    [selectedTrackIds, trackById, matchSnapshots],
  );

  const unmatchedTopHits = useMemo(
    () =>
      selectedTrackIds
        .map((trackId) => ({
          track: trackById.get(trackId),
          snapshot: matchSnapshots[trackId],
        }))
        .filter((entry): entry is SelectedMatchEntry =>
          Boolean(
            entry.track && entry.snapshot && entry.snapshot.matches.length === 0 && entry.snapshot.topHit,
          ),
        ),
    [selectedTrackIds, trackById, matchSnapshots],
  );

  return {
    selectionStats,
    unmatchedSelectedIds,
    matchedSelected,
    unmatchedTopHits,
  };
}
