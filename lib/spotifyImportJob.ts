import fs from "node:fs";
import path from "node:path";
import { importSpotifyLibraryWithProgress } from "./spotifyImport";
import { readStore, updateStore } from "./store";

let running = false;
const IMPORT_STALE_AFTER_MS = 20 * 60 * 1000;
const artifactsDir = path.join(process.cwd(), ".data", "artifacts");

function clearImportCache() {
  fs.rmSync(artifactsDir, { recursive: true, force: true });
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
  clearImportCache();

  updateStore((store) => {
    store.tracks = [];
    store.jobs = [];
    store.matchesByTrackId = {};
    store.settings.spotifyImport = {
      status: "running",
      phase: "init",
      message: "Starting liked songs import from a clean cache...",
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
            store.tracks = progress.tracksSnapshot;
          }
        });
      });

      updateStore((store) => {
        store.tracks = tracks;
        store.matchesByTrackId = {};
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
