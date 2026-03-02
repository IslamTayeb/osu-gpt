import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { SpotifyImportStatus, Track } from "@/lib/types";

type UseWorkspaceDataEffectsParams = {
  fetchSession: () => Promise<void>;
  fetchJobs: () => Promise<void>;
  fetchImportStatus: () => Promise<SpotifyImportStatus>;
  fetchTracks: () => Promise<void>;
  hasActiveJobs: boolean;
  importStatusState: SpotifyImportStatus["status"];
  tracks: Track[];
  setTrackCacheById: Dispatch<SetStateAction<Record<string, Track>>>;
  setBootstrapping: Dispatch<SetStateAction<boolean>>;
};

export function useWorkspaceDataEffects({
  fetchSession,
  fetchJobs,
  fetchImportStatus,
  fetchTracks,
  hasActiveJobs,
  importStatusState,
  tracks,
  setTrackCacheById,
  setBootstrapping,
}: UseWorkspaceDataEffectsParams) {
  const hydratedRef = useRef(false);
  const lastImportStateRef = useRef<SpotifyImportStatus["status"]>("idle");

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([fetchSession(), fetchJobs(), fetchImportStatus(), fetchTracks()]);
      } finally {
        hydratedRef.current = true;
        setBootstrapping(false);
      }
    })();
  }, [fetchSession, fetchJobs, fetchImportStatus, fetchTracks, setBootstrapping]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    void fetchTracks();
  }, [fetchTracks]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const timer = setInterval(() => {
      void (async () => {
        const status = await fetchImportStatus();
        if (hasActiveJobs) {
          await fetchJobs();
        }
        if (status.status === "running") {
          await fetchTracks();
        }
      })();
    }, 2500);

    return () => clearInterval(timer);
  }, [fetchJobs, fetchImportStatus, fetchTracks, hasActiveJobs]);

  useEffect(() => {
    const previous = lastImportStateRef.current;
    if (importStatusState === "completed" && previous !== "completed") {
      void fetchTracks();
      void fetchSession();
    }
    lastImportStateRef.current = importStatusState;
  }, [importStatusState, fetchTracks, fetchSession]);

  useEffect(() => {
    setTrackCacheById((previous) => {
      const next = { ...previous };
      for (const track of tracks) {
        next[track.id] = track;
      }
      return next;
    });
  }, [setTrackCacheById, tracks]);
}
