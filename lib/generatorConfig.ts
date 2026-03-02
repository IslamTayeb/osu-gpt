import { GeneratorParams } from "./types";

export type MapperStylePreset = {
  id: string;
  label: string;
  mapperId: number;
  description: string;
  descriptors: string[];
};

export const mapperStylePresets: MapperStylePreset[] = [
  {
    id: "lasse",
    label: "Lasse",
    mapperId: 896613,
    description: "Long-form flow maps with wide aim spacing and marathon pacing.",
    descriptors: ["marathon", "wide aim", "jump aim"],
  },
  {
    id: "akitoshi",
    label: "Akitoshi",
    mapperId: 4754771,
    description: "Modern jump-heavy style with sharp spikes and punchy sectioning.",
    descriptors: ["jump aim", "difficulty spike", "distance snapped"],
  },
  {
    id: "sotarks",
    label: "Sotarks",
    mapperId: 4452992,
    description: "TV-size jump emphasis, simple readability, and bursty climaxes.",
    descriptors: ["simple", "jump aim", "difficulty spike"],
  },
  {
    id: "pishifat",
    label: "pishifat",
    mapperId: 3178418,
    description: "Controlled technical movement with clean spacing and rhythm intent.",
    descriptors: ["clean", "alt", "aim control"],
  },
  {
    id: "gero",
    label: "Gero",
    mapperId: 1467715,
    description: "Symmetrical structure, geometric motifs, and clear rhythm framing.",
    descriptors: ["symmetrical", "geometric", "simple"],
  },
  {
    id: "momochikun",
    label: "Momochikun",
    mapperId: 2032824,
    description: "Consistent stream flow and balanced movement density.",
    descriptors: ["streams", "clean", "flow aim"],
  },
  {
    id: "milan",
    label: "Milan-",
    mapperId: 1052994,
    description: "Mixed aim/control style with practical readability decisions.",
    descriptors: ["jump aim", "aim control", "simple"],
  },
  {
    id: "riffy",
    label: "riffy",
    mapperId: 597957,
    description: "Balanced alternate control and readable spacing with clean pacing.",
    descriptors: ["alt", "clean", "aim control"],
  },
];

export const generatorParamTemplate: GeneratorParams = {
  gamemode: 0,
  beatmapId: null,
  difficulty: 5.2,
  mapperId: null,
  year: new Date().getUTCFullYear(),
  hitsounded: true,
  keycount: 4,
  holdNoteRatio: null,
  scrollSpeedRatio: null,
  descriptors: [],
  negativeDescriptors: [],
  hpDrainRate: 5,
  circleSize: 4,
  overallDifficulty: 8,
  approachRate: 9,
  sliderMultiplier: 1.4,
  sliderTickRate: 1,
  seed: null,
  device: "auto",
  precision: "fp32",
  attnImplementation: "auto",
  addToBeatmap: false,
  overwriteReferenceBeatmap: false,
  exportOsz: false,
  startTime: null,
  endTime: null,
  lookback: 0.5,
  lookahead: 0.4,
  timingLeniency: 20,
  inContext: ["NONE"],
  outputType: ["MAP"],
  cfgScale: 1,
  temperature: 1,
  timingTemperature: 0.1,
  maniaColumnTemperature: 0.8,
  taikoHitTemperature: 0.8,
  timeshiftBias: 0,
  topP: 0.95,
  topK: 0,
  parallel: false,
  doSample: true,
  numBeams: 1,
  superTiming: false,
  timerNumBeams: 2,
  timerBpmThreshold: 0.1,
  timerCfgScale: 1,
  timerIterations: 20,
  useServer: false,
  maxBatchSize: 16,
  resnapEvents: true,
  bpm: null,
  offset: null,
  title: null,
  titleUnicode: null,
  artist: null,
  artistUnicode: null,
  creator: "Mapperatorinator",
  version: "Mapperatorinator",
  source: null,
  tags: null,
  background: null,
  previewTime: null,
  generatePositions: true,
  diffCfgScale: 1,
  compile: false,
  padSequence: false,
  diffCkpt: null,
  diffRefineCkpt: null,
  beatmapIdx: "osu_diffusion/beatmap_idx.pickle",
  refineIters: 10,
  randomInit: false,
  timesteps: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  maxSeqLen: 1024,
  overlapBuffer: 128,
  loraPath: null,
  beatmapPath: null,
};

const numberKeys = new Set<keyof GeneratorParams>([
  "gamemode",
  "beatmapId",
  "difficulty",
  "mapperId",
  "year",
  "keycount",
  "holdNoteRatio",
  "scrollSpeedRatio",
  "hpDrainRate",
  "circleSize",
  "overallDifficulty",
  "approachRate",
  "sliderMultiplier",
  "sliderTickRate",
  "seed",
  "startTime",
  "endTime",
  "lookback",
  "lookahead",
  "timingLeniency",
  "cfgScale",
  "temperature",
  "timingTemperature",
  "maniaColumnTemperature",
  "taikoHitTemperature",
  "timeshiftBias",
  "topP",
  "topK",
  "numBeams",
  "timerNumBeams",
  "timerBpmThreshold",
  "timerCfgScale",
  "timerIterations",
  "maxBatchSize",
  "bpm",
  "offset",
  "previewTime",
  "diffCfgScale",
  "refineIters",
  "maxSeqLen",
  "overlapBuffer",
]);

const booleanKeys = new Set<keyof GeneratorParams>([
  "hitsounded",
  "addToBeatmap",
  "overwriteReferenceBeatmap",
  "exportOsz",
  "parallel",
  "doSample",
  "superTiming",
  "useServer",
  "resnapEvents",
  "generatePositions",
  "compile",
  "padSequence",
  "randomInit",
]);

const stringKeys = new Set<keyof GeneratorParams>([
  "device",
  "precision",
  "attnImplementation",
  "title",
  "titleUnicode",
  "artist",
  "artistUnicode",
  "creator",
  "version",
  "source",
  "tags",
  "background",
  "diffCkpt",
  "diffRefineCkpt",
  "beatmapIdx",
  "loraPath",
  "beatmapPath",
]);

const stringArrayKeys = new Set<keyof GeneratorParams>([
  "descriptors",
  "negativeDescriptors",
  "inContext",
  "outputType",
]);

const numberArrayKeys = new Set<keyof GeneratorParams>(["timesteps"]);

const hydraKeyByParam: Record<keyof GeneratorParams, string> = {
  gamemode: "gamemode",
  beatmapId: "beatmap_id",
  difficulty: "difficulty",
  mapperId: "mapper_id",
  year: "year",
  hitsounded: "hitsounded",
  keycount: "keycount",
  holdNoteRatio: "hold_note_ratio",
  scrollSpeedRatio: "scroll_speed_ratio",
  descriptors: "descriptors",
  negativeDescriptors: "negative_descriptors",
  hpDrainRate: "hp_drain_rate",
  circleSize: "circle_size",
  overallDifficulty: "overall_difficulty",
  approachRate: "approach_rate",
  sliderMultiplier: "slider_multiplier",
  sliderTickRate: "slider_tick_rate",
  seed: "seed",
  device: "device",
  precision: "precision",
  attnImplementation: "attn_implementation",
  addToBeatmap: "add_to_beatmap",
  overwriteReferenceBeatmap: "overwrite_reference_beatmap",
  exportOsz: "export_osz",
  startTime: "start_time",
  endTime: "end_time",
  lookback: "lookback",
  lookahead: "lookahead",
  timingLeniency: "timing_leniency",
  inContext: "in_context",
  outputType: "output_type",
  cfgScale: "cfg_scale",
  temperature: "temperature",
  timingTemperature: "timing_temperature",
  maniaColumnTemperature: "mania_column_temperature",
  taikoHitTemperature: "taiko_hit_temperature",
  timeshiftBias: "timeshift_bias",
  topP: "top_p",
  topK: "top_k",
  parallel: "parallel",
  doSample: "do_sample",
  numBeams: "num_beams",
  superTiming: "super_timing",
  timerNumBeams: "timer_num_beams",
  timerBpmThreshold: "timer_bpm_threshold",
  timerCfgScale: "timer_cfg_scale",
  timerIterations: "timer_iterations",
  useServer: "use_server",
  maxBatchSize: "max_batch_size",
  resnapEvents: "resnap_events",
  bpm: "bpm",
  offset: "offset",
  title: "title",
  titleUnicode: "title_unicode",
  artist: "artist",
  artistUnicode: "artist_unicode",
  creator: "creator",
  version: "version",
  source: "source",
  tags: "tags",
  background: "background",
  previewTime: "preview_time",
  generatePositions: "generate_positions",
  diffCfgScale: "diff_cfg_scale",
  compile: "compile",
  padSequence: "pad_sequence",
  diffCkpt: "diff_ckpt",
  diffRefineCkpt: "diff_refine_ckpt",
  beatmapIdx: "beatmap_idx",
  refineIters: "refine_iters",
  randomInit: "random_init",
  timesteps: "timesteps",
  maxSeqLen: "max_seq_len",
  overlapBuffer: "overlap_buffer",
  loraPath: "lora_path",
  beatmapPath: "beatmap_path",
};

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function cleanNumber(value: unknown) {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function cleanBoolean(value: unknown) {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const next = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return next;
}

function cleanNumberArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const next = value
    .map((item) => cleanNumber(item))
    .filter((item): item is number => item !== null);
  return next.length ? next : [];
}

export function sanitizeGeneratorParams(input: unknown): GeneratorParams {
  if (!input || typeof input !== "object") {
    return {};
  }

  const raw = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(raw) as Array<keyof GeneratorParams>) {
    if (numberKeys.has(key)) {
      output[key] = cleanNumber(raw[key]);
      continue;
    }
    if (booleanKeys.has(key)) {
      output[key] = cleanBoolean(raw[key]);
      continue;
    }
    if (stringKeys.has(key)) {
      output[key] = cleanString(raw[key]);
      continue;
    }
    if (stringArrayKeys.has(key)) {
      output[key] = cleanStringArray(raw[key]);
      continue;
    }
    if (numberArrayKeys.has(key)) {
      output[key] = cleanNumberArray(raw[key]);
    }
  }

  return output as GeneratorParams;
}

export function applyGenerationPreset(
  params: GeneratorParams,
  preset: "quick" | "balanced" | "high_quality",
): GeneratorParams {
  const next = { ...params };
  if (preset === "quick") {
    if (next.difficulty === null || next.difficulty === undefined) next.difficulty = 4.5;
    if (next.superTiming === null || next.superTiming === undefined) next.superTiming = false;
    if (next.cfgScale === null || next.cfgScale === undefined) next.cfgScale = 0.95;
    if (next.temperature === null || next.temperature === undefined) next.temperature = 1.05;
  } else if (preset === "high_quality") {
    if (next.difficulty === null || next.difficulty === undefined) next.difficulty = 6.0;
    if (next.superTiming === null || next.superTiming === undefined) next.superTiming = true;
    if (next.cfgScale === null || next.cfgScale === undefined) next.cfgScale = 1.1;
    if (next.temperature === null || next.temperature === undefined) next.temperature = 0.95;
  } else {
    if (next.difficulty === null || next.difficulty === undefined) next.difficulty = 5.2;
    if (next.superTiming === null || next.superTiming === undefined) next.superTiming = false;
    if (next.cfgScale === null || next.cfgScale === undefined) next.cfgScale = 1.0;
    if (next.temperature === null || next.temperature === undefined) next.temperature = 1.0;
  }
  return next;
}

function hydraScalar(value: string | number | boolean) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function toHydraOverrides(params: GeneratorParams) {
  const overrides: string[] = [];
  const entries = Object.entries(params) as Array<[keyof GeneratorParams, unknown]>;
  for (const [key, value] of entries) {
    const hydraKey = hydraKeyByParam[key];
    if (!hydraKey) continue;
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      const rendered = value.map((item) => hydraScalar(item as string | number | boolean)).join(",");
      overrides.push(`${hydraKey}=[${rendered}]`);
      continue;
    }

    if (typeof value === "string") {
      if (!value.trim()) continue;
      overrides.push(`${hydraKey}=${hydraScalar(value)}`);
      continue;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      overrides.push(`${hydraKey}=${value}`);
      continue;
    }

    if (typeof value === "boolean") {
      overrides.push(`${hydraKey}=${value ? "true" : "false"}`);
    }
  }
  return overrides;
}
