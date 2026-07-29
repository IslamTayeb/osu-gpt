import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readStore, resolveAudioCacheDir } from "./store";
import { Track } from "./types";

/**
 * Prefer the project-local venv (`npm run setup:python`) over whatever is on
 * PATH. A globally installed spotdl that shadows a working one — or breaks on a
 * Python upgrade — otherwise degrades downloads silently.
 */
function tool(name: string): string {
  const override = process.env[`${name.replace(/-/g, "_").toUpperCase()}_BIN`];
  if (override) return override;
  const local = path.join(process.cwd(), ".venv", "bin", name);
  return fs.existsSync(local) ? local : name;
}

/** How far a downloaded file may differ from the Spotify duration, in ms. */
const DURATION_TOLERANCE_MS = 10_000;

/**
 * YouTube rejects the default client with HTTP 403 fairly often; these clients
 * still serve. Applies to both the search and the download.
 */
const YTDLP_CLIENT_ARGS = ["--extractor-args", "youtube:player_client=android,web_safari"];

export type CachedAudio = {
  path: string;
  durationMs: number;
  source: "cache" | "spotdl" | "ytdlp" | "manual";
  loudnessBefore?: number;
  loudnessAfter?: number;
};

type Sidecar = Omit<CachedAudio, "path">;

export function audioCachePaths(track: Track) {
  const dir = path.join(resolveAudioCacheDir(), "audio");
  const base = `${track.provider}-${track.providerTrackId}`;
  return {
    dir,
    audioPath: path.join(dir, `${base}.mp3`),
    sidecarPath: path.join(dir, `${base}.json`),
  };
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; onLine?: (line: string) => void } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd });
    let output = "";
    let settled = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    const collect = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (options.onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) options.onLine(line.trim());
        }
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      if (!settled) reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with code ${code}: ${output.slice(-800)}`));
    });
  });
}

export async function probeDurationMs(file: string): Promise<number> {
  const out = await run(tool("ffprobe"), [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]);
  const seconds = Number.parseFloat(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read duration of ${file}`);
  return Math.round(seconds * 1000);
}

function parseLoudnormJson(output: string) {
  const blocks = output.match(/\{[^{}]*\}/g);
  if (!blocks?.length) throw new Error("ffmpeg loudnorm produced no measurement");
  return JSON.parse(blocks[blocks.length - 1]) as Record<string, string>;
}

async function measureLoudness(file: string, targetLufs: number) {
  const output = await run(tool("ffmpeg"), [
    "-i", file, "-af", `loudnorm=I=${targetLufs}:TP=-0.5:LRA=11:print_format=json`,
    "-f", "null", "-",
  ]);
  return parseLoudnormJson(output);
}

/**
 * Two-pass loudnorm to a fixed target. Tracks pulled off YouTube vary by well
 * over 10 LU — one measured -8.4 LUFS with clipping peaks — which is why maps
 * felt wildly louder or quieter than each other before this existed.
 */
export async function normalizeLoudness(
  source: string,
  destination: string,
  targetLufs: number,
): Promise<{ before: number; after: number }> {
  const measured = await measureLoudness(source, targetLufs);
  const filter =
    `loudnorm=I=${targetLufs}:TP=-0.5:LRA=11` +
    `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}:linear=true`;
  await run(tool("ffmpeg"), [
    "-y", "-i", source, "-af", filter, "-ar", "44100", "-b:a", "192k", destination,
  ]);
  const verified = await measureLoudness(destination, targetLufs);
  return { before: Number(measured.input_i), after: Number(verified.input_i) };
}

function findAudioFile(dir: string): string | null {
  const accepted = new Set([".mp3", ".m4a", ".opus", ".webm", ".wav", ".ogg", ".flac"]);
  const files = fs
    .readdirSync(dir)
    .filter((name) => accepted.has(path.extname(name).toLowerCase()))
    .sort();
  return files.length ? path.join(dir, files[0]) : null;
}

async function downloadWithSpotdl(track: Track, dir: string, timeoutMs: number, log: Log) {
  const query = track.externalUrl || `spotify:track:${track.providerTrackId}`;
  await run(tool("spotdl"), ["download", query, "--output", dir, "--format", "mp3"], {
    timeoutMs,
    onLine: (line) => log(`[spotdl] ${line}`),
  });
  return findAudioFile(dir);
}

/**
 * Search YouTube and pick the first result whose duration matches the Spotify
 * track. Taking the top hit blind is how a 10-hour loop or the wrong remix ends
 * up being mapped.
 */
async function downloadWithYtdlp(track: Track, dir: string, timeoutMs: number, log: Log) {
  const query = `${track.artists.join(" ")} ${track.title}`.trim();
  const listing = await run(
    tool("yt-dlp"),
    [`ytsearch5:${query}`, "--print", "%(duration)s|%(id)s|%(title)s", "--no-download",
      ...YTDLP_CLIENT_ARGS],
    { timeoutMs, onLine: (line) => log(`[yt-dlp] ${line}`) },
  );

  const targetSeconds = track.durationMs / 1000;
  const candidates = listing
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 3 && Number.isFinite(Number(parts[0])))
    .map((parts) => ({
      seconds: Number(parts[0]),
      id: parts[1],
      title: parts.slice(2).join("|"),
    }));
  const match = candidates.find(
    (c) => Math.abs(c.seconds - targetSeconds) * 1000 <= DURATION_TOLERANCE_MS,
  );
  if (!match) {
    const seen = candidates.map((c) => `${c.title} (${c.seconds}s)`).join("; ");
    throw new Error(
      `No YouTube result matched the expected ${Math.round(targetSeconds)}s duration. Saw: ${seen || "nothing"}`,
    );
  }
  log(`[yt-dlp] matched "${match.title}" (${match.seconds}s)`);
  await run(
    tool("yt-dlp"),
    [`https://www.youtube.com/watch?v=${match.id}`, "-x", "--audio-format", "mp3",
      "--audio-quality", "0", "-o", path.join(dir, "raw.%(ext)s"), ...YTDLP_CLIENT_ARGS],
    { timeoutMs, onLine: (line) => log(`[yt-dlp] ${line}`) },
  );
  return findAudioFile(dir);
}

type Log = (line: string) => void;

/**
 * Get a normalized, duration-verified audio file for a track, downloading only
 * when the cache misses. Both runtimes share this so a song is fetched once.
 */
/**
 * One download per track at a time: a preview click racing a generation batch
 * must share the fetch, not corrupt the cache with two writers.
 */
const inFlight = new Map<string, Promise<CachedAudio>>();

export function ensureTrackAudio(
  track: Track,
  log: Log,
  options: { timeoutMs?: number; allowStale?: boolean } = {},
): Promise<CachedAudio> {
  const existing = inFlight.get(track.id);
  if (existing) {
    log("Audio fetch already in progress for this track; waiting on it.");
    return existing;
  }
  const promise = fetchTrackAudio(track, log, options).finally(() => inFlight.delete(track.id));
  inFlight.set(track.id, promise);
  return promise;
}

async function fetchTrackAudio(
  track: Track,
  log: Log,
  options: { timeoutMs?: number; allowStale?: boolean } = {},
): Promise<CachedAudio> {
  const settings = readStore().settings;
  const { dir, audioPath, sidecarPath } = audioCachePaths(track);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(audioPath) && fs.existsSync(sidecarPath)) {
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8")) as Sidecar;
    // A cached file normalized to an old target would keep every future map at
    // the wrong loudness; treat it as stale and re-fetch at the current target.
    // Previews pass allowStale — an instant, slightly-off-level play beats a
    // minute of spinner, and generation still refreshes the file.
    const cachedLoudness = sidecar.loudnessAfter;
    const stale =
      settings.loudnormEnabled &&
      typeof cachedLoudness === "number" &&
      Math.abs(cachedLoudness - settings.loudnormTargetLufs) > 1;
    if (!stale || options.allowStale) {
      log(`Audio cache hit (${path.basename(audioPath)}).`);
      return { ...sidecar, path: audioPath, source: "cache" };
    }
    log(
      `Cached audio is ${cachedLoudness} LUFS but the target is now ` +
        `${settings.loudnormTargetLufs}; re-fetching.`,
    );
    fs.rmSync(audioPath, { force: true });
    fs.rmSync(sidecarPath, { force: true });
  }

  const timeoutMs = options.timeoutMs ?? 300_000;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "osugpt-audio-"));
  try {
    let downloaded: string | null = null;
    let source: CachedAudio["source"] = "spotdl";

    try {
      log("Downloading with spotdl...");
      downloaded = await downloadWithSpotdl(track, tempDir, timeoutMs, log);
      if (downloaded) {
        const actual = await probeDurationMs(downloaded);
        if (Math.abs(actual - track.durationMs) > DURATION_TOLERANCE_MS) {
          log(
            `spotdl result is ${Math.round(actual / 1000)}s but the track is ` +
              `${Math.round(track.durationMs / 1000)}s — rejecting and retrying with yt-dlp.`,
          );
          fs.rmSync(downloaded, { force: true });
          downloaded = null;
        }
      }
    } catch (error) {
      log(`spotdl failed: ${error instanceof Error ? error.message : String(error)}`);
      downloaded = null;
    }

    if (!downloaded) {
      log("Falling back to a duration-matched yt-dlp search...");
      downloaded = await downloadWithYtdlp(track, tempDir, timeoutMs, log);
      source = "ytdlp";
    }
    if (!downloaded) throw new Error("No audio could be downloaded for this track.");

    const durationMs = await probeDurationMs(downloaded);
    if (Math.abs(durationMs - track.durationMs) > DURATION_TOLERANCE_MS) {
      throw new Error(
        `Downloaded audio is ${Math.round(durationMs / 1000)}s but the track is ` +
          `${Math.round(track.durationMs / 1000)}s. Provide the audio manually for this track.`,
      );
    }

    const sidecar: Sidecar = { durationMs, source };
    if (settings.loudnormEnabled) {
      log(`Normalizing loudness to ${settings.loudnormTargetLufs} LUFS...`);
      const { before, after } = await normalizeLoudness(
        downloaded, audioPath, settings.loudnormTargetLufs,
      );
      sidecar.loudnessBefore = before;
      sidecar.loudnessAfter = after;
      log(`Loudness ${before} → ${after} LUFS.`);
    } else {
      fs.copyFileSync(downloaded, audioPath);
    }

    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
    return { ...sidecar, path: audioPath };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Install a user-supplied file as the cached audio, bypassing search. */
export async function setManualTrackAudio(track: Track, sourceFile: string): Promise<CachedAudio> {
  const settings = readStore().settings;
  const { dir, audioPath, sidecarPath } = audioCachePaths(track);
  fs.mkdirSync(dir, { recursive: true });

  const sidecar: Sidecar = { durationMs: await probeDurationMs(sourceFile), source: "manual" };
  if (settings.loudnormEnabled) {
    const { before, after } = await normalizeLoudness(
      sourceFile, audioPath, settings.loudnormTargetLufs,
    );
    sidecar.loudnessBefore = before;
    sidecar.loudnessAfter = after;
  } else {
    fs.copyFileSync(sourceFile, audioPath);
  }
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
  return { ...sidecar, path: audioPath };
}
