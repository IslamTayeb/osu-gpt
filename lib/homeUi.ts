import { SpotifyImportStatus } from "./types";

export function msToClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function importProgress(status: SpotifyImportStatus) {
  if (status.status === "completed") return 100;
  if (status.status === "running") {
    const n = status.importedCount ?? 0;
    return Math.max(6, Math.min(92, Math.round(24 + Math.log10(n + 1) * 28)));
  }
  return 0;
}

export function inferFilename(header: string | null) {
  if (!header) return "osu-gpt-export.zip";
  const match = header.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? "osu-gpt-export.zip";
}

export function chunkArray<T>(input: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

export function librarySkeletonItems(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

export const descriptorOptions = [
  "jump aim",
  "high bpm",
  "bursty",
  "streams",
  "stamina",
  "flow aim",
  "finger control",
  "aim control",
  "technical",
  "alt",
  "precision",
  "clean",
  "reading",
  "difficulty spike",
  "comfortable",
  "distance snapped",
  "old style",
  "triples",
  "close spacing",
  "vocal rhythm",
  "grid based",
  "oibon",
  "large jumps",
  "side to side jumps",
];

export const negativeDescriptorOptions = [
  "slider spam",
  "awkward jumps",
  "visual clutter",
  "rhythm gimmick",
  "overmapped",
  "underweighted patterns",
  "unreadable spacing",
  "excessive SV gimmick",
];

export const inContextOptions = ["NONE", "GD", "NO_HS", "MAP", "TIMING"];
export const outputTypeOptions = ["MAP", "TIMING", "HITSOUND"];
