import { importSpotifyLibraryWithProgress } from "./spotifyImport";
import { readStore, updateStore } from "./store";
import { Track } from "./types";

let running = false;
const IMPORT_STALE_AFTER_MS = 20 * 60 * 1000;

/**
 * Merge freshly imported tracks over what is already stored. A re-import used to
 * delete every track, job, match, and cached artifact, which threw away work and
 * forced every song to be downloaded again.
 */
function upsertTracks(existing: Track[], incoming: Track[]): Track[] {
  const byId = new Map(existing.map((track) => [track.id, track]));
  for (const track of incoming) {
    byId.set(track.id, { ...byId.get(track.id), ...track });
  }
  return [...byId.values()];
}

export function getSpotifyImportStatus() {
  const store = readStore();
  const status = store.settings.spotifyImport;

  if (
    status?.status === "running" &&
    status.startedAt &&
    Date.now() - new Date(status.startedAt).getTime() > IMPORT_STALE_AFTER_MS
  ) {
    updateStore((next) => {
      const current = next.settings.spotifyImport;
      if (!current || current.status !== "running") {
        return;
      }
      current.status = "failed";
      current.phase = "error";
      current.finishedAt = new Date().toISOString();
      current.error = "Import became stale (likely from a server restart). Please run import again.";
      current.message = "Import stale. Please retry.";
    });
    return readStore().settings.spotifyImport ?? { status: "idle" as const };
  }

  return status ?? { status: "idle" as const };
}

export function startSpotifyImportJob(accessToken: string) {
  if (running) {
    return getSpotifyImportStatus();
  }

  running = true;
  const startedAt = new Date().toISOString();

  updateStore((store) => {
    store.settings.spotifyImport = {
      status: "running",
      phase: "init",
      message: "Starting liked songs import...",
      importedCount: 0,
      startedAt,
      error: undefined,
      finishedAt: undefined,
    };
  });

  void (async () => {
    try {
      const tracks = await importSpotifyLibraryWithProgress(accessToken, (progress) => {
        updateStore((store) => {
          const status = store.settings.spotifyImport;
          if (!status) return;
          status.status = "running";
          status.phase = progress.phase;
          status.message = progress.message;
          status.importedCount = progress.importedCount;
          if (progress.tracksSnapshot) {
            store.tracks = upsertTracks(store.tracks, progress.tracksSnapshot);
          }
        });
      });

      updateStore((store) => {
        store.tracks = upsertTracks(store.tracks, tracks);
        store.settings.spotifyImport = {
          status: "completed",
          phase: "done",
          message: `Liked songs import complete: ${tracks.length} tracks`,
          importedCount: tracks.length,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      updateStore((store) => {
        store.settings.spotifyImport = {
          status: "failed",
          phase: "error",
          message: "Import failed",
          importedCount: store.settings.spotifyImport?.importedCount ?? 0,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown import error",
        };
      });
    } finally {
      running = false;
    }
  })();

  return getSpotifyImportStatus();
}
