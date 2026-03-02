import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { SpotifyImportStatus, Track, TrackMatchSnapshot, GenerationJob } from "@/lib/types";

type UseSpotifyImportWorkflowParams = {
  spotifyConnected: boolean;
  bootstrapping: boolean;
  clearSelection: () => void;
  fetchImportStatus: () => Promise<SpotifyImportStatus>;
  fetchTracks: (overrides?: { page?: number }) => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setTracks: Dispatch<SetStateAction<Track[]>>;
  setTrackCacheById: Dispatch<SetStateAction<Record<string, Track>>>;
  setMatchSnapshots: Dispatch<SetStateAction<Record<string, TrackMatchSnapshot>>>;
  setJobs: Dispatch<SetStateAction<GenerationJob[]>>;
  setTracksTotal: Dispatch<SetStateAction<number>>;
  setTotalTracks: Dispatch<SetStateAction<number>>;
  setVisibleStart: Dispatch<SetStateAction<number>>;
  setVisibleEnd: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setPage: Dispatch<SetStateAction<number>>;
};

type UseSpotifyImportWorkflowResult = {
  importSpotify: (silent?: boolean) => Promise<void>;
};

export function useSpotifyImportWorkflow({
  spotifyConnected,
  bootstrapping,
  clearSelection,
  fetchImportStatus,
  fetchTracks,
  setBusy,
  setError,
  setNotice,
  setTracks,
  setTrackCacheById,
  setMatchSnapshots,
  setJobs,
  setTracksTotal,
  setTotalTracks,
  setVisibleStart,
  setVisibleEnd,
  setTotalPages,
  setPage,
}: UseSpotifyImportWorkflowParams): UseSpotifyImportWorkflowResult {
  const autoImportAttemptedRef = useRef(false);

  const importSpotify = useCallback(
    async (silent = false) => {
      setBusy(true);
      if (!silent) {
        setNotice("");
      }
      setError("");
      try {
        clearSelection();
        setTracks([]);
        setTrackCacheById({});
        setMatchSnapshots({});
        setJobs([]);
        setTracksTotal(0);
        setTotalTracks(0);
        setVisibleStart(0);
        setVisibleEnd(0);
        setTotalPages(1);
        setPage(1);

        const response = await fetch("/api/library/spotify/import", { method: "POST" });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Import failed");
        }
        if (!silent) {
          setNotice("Liked songs import started from a clean cache.");
        }
        await Promise.all([fetchImportStatus(), fetchTracks({ page: 1 })]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setBusy(false);
      }
    },
    [
      clearSelection,
      fetchImportStatus,
      fetchTracks,
      setBusy,
      setError,
      setNotice,
      setTracks,
      setTrackCacheById,
      setMatchSnapshots,
      setJobs,
      setTracksTotal,
      setTotalTracks,
      setVisibleStart,
      setVisibleEnd,
      setTotalPages,
      setPage,
    ],
  );

  useEffect(() => {
    if (bootstrapping || !spotifyConnected || autoImportAttemptedRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("spotify") !== "connected") {
      return;
    }

    autoImportAttemptedRef.current = true;
    void importSpotify(true);
    url.searchParams.delete("spotify");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [bootstrapping, spotifyConnected, importSpotify]);

  return { importSpotify };
}
