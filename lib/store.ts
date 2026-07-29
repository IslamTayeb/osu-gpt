import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AppSettings, AppStore } from "./types";

const dataDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dataDir, "store.json");

export const defaultSettings: AppSettings = {
  runtime: "dcc",
  // 2080s start in ~12s median against ~19s (p90 ~23min) for bf16 cards, so the
  // slower GPU is usually the faster answer.
  gpuProfile: "fast-start",
  openInOsu: true,
  audioCacheDir: path.join(dataDir, "cache"),
  exportDir: null,
  loudnormEnabled: true,
  loudnormTargetLufs: -9,
  modelVersion: "v32",
};

const defaultStore: AppStore = {
  settings: defaultSettings,
  tracks: [],
  jobs: [],
};

function ensureStoreFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    writeStore(defaultStore);
  }
}

export function readStore(): AppStore {
  ensureStoreFile();
  const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8")) as Partial<AppStore>;
  return {
    settings: { ...defaultSettings, ...(parsed.settings ?? {}) },
    spotifyRefreshToken: parsed.spotifyRefreshToken,
    tracks: parsed.tracks ?? [],
    jobs: parsed.jobs ?? [],
  };
}

export function writeStore(next: AppStore) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // Write-then-rename so a crash mid-write can't truncate the store. The temp
  // file must share a filesystem with the target for rename to be atomic.
  const tmpPath = path.join(dataDir, `.store.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmpPath, dbPath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

/**
 * Read-modify-write under a lock directory, so concurrent jobs in this process
 * (and any stray second process) can't lose each other's updates.
 */
export function updateStore(updater: (store: AppStore) => void): AppStore {
  const lockPath = path.join(dataDir, ".store.lock");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch {
      if (Date.now() > deadline) {
        // Assume a crashed holder rather than deadlocking forever.
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
  }
  try {
    const store = readStore();
    updater(store);
    writeStore(store);
    return store;
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

export function resolveAudioCacheDir(): string {
  const configured = readStore().settings.audioCacheDir || defaultSettings.audioCacheDir;
  return configured.startsWith("~")
    ? path.join(os.homedir(), configured.slice(1))
    : path.resolve(configured);
}
