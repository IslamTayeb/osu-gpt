import fs from "node:fs";
import path from "node:path";
import { AppStore } from "./types";

const dataDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dataDir, "store.json");

const defaultStore: AppStore = {
  settings: {},
  tracks: [],
  jobs: [],
  matchesByTrackId: {},
};

function ensureStoreFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

export function readStore(): AppStore {
  ensureStoreFile();
  const content = fs.readFileSync(dbPath, "utf8");
  const parsed = JSON.parse(content) as Partial<AppStore>;
  return {
    settings: parsed.settings ?? {},
    tracks: parsed.tracks ?? [],
    jobs: parsed.jobs ?? [],
    matchesByTrackId: parsed.matchesByTrackId ?? {},
  };
}

export function writeStore(next: AppStore) {
  ensureStoreFile();
  fs.writeFileSync(dbPath, JSON.stringify(next, null, 2), "utf8");
}

export function updateStore(updater: (store: AppStore) => void): AppStore {
  const store = readStore();
  updater(store);
  writeStore(store);
  return store;
}
