import { GeneratorParams } from "./types";

export type MapperStylePreset = {
  id: string;
  label: string;
  mapperId: number;
  description: string;
  descriptors: string[];
};

export type MapTypePreset = {
  id: string;
  label: string;
  description: string;
  descriptors: string[];
  defaults: Partial<
    Pick<
      GeneratorParams,
      | "difficulty"
      | "approachRate"
      | "overallDifficulty"
      | "circleSize"
      | "hpDrainRate"
      | "cfgScale"
      | "temperature"
      | "topP"
      | "year"
    >
  >;
};

export const mapperStylePresets: MapperStylePreset[] = [
  {
    id: "sotarks",
    label: "Sotarks",
    mapperId: 4452992,
    description: "Popular jump-focused TV-size style with clean readability and punchy spikes.",
    descriptors: ["simple", "jump aim", "difficulty spike"],
  },
  {
    id: "pishifat",
    label: "pishifat",
    mapperId: 3178418,
    description: "Technical/control-oriented style with rhythm emphasis and precise movement.",
    descriptors: ["clean", "alt", "aim control"],
  },
  {
    id: "skystar",
    label: "Skystar",
    mapperId: 873961,
    description: "Flow-aim leaning style with stream momentum and readable spacing.",
    descriptors: ["flow aim", "streams", "clean"],
  },
  {
    id: "kroytz",
    label: "Kroytz",
    mapperId: 2339768,
    description: "Alternate/control patterns with technical rhythm handling.",
    descriptors: ["alt", "aim control", "precision"],
  },
  {
    id: "natsu",
    label: "Natsu",
    mapperId: 1953876,
    description: "Stream consistency and dense yet readable movement patterns.",
    descriptors: ["streams", "clean", "reading"],
  },
  {
    id: "lasse",
    label: "Lasse",
    mapperId: 896613,
    description: "Long-form map pacing with marathon flow and wider aim spacing.",
    descriptors: ["marathon", "wide aim", "jump aim"],
  },
  {
    id: "rlc",
    label: "RLC",
    mapperId: 1047883,
    description: "Classic precision-leaning patterning with technical phrasing.",
    descriptors: ["precision", "distance snapped", "technical"],
  },
  {
    id: "milan",
    label: "Milan-",
    mapperId: 1052994,
    description: "Balanced modern style combining aim movement and controlled rhythm.",
    descriptors: ["jump aim", "aim control", "simple"],
  },
];

export const mapTypePresets: MapTypePreset[] = [
  {
    id: "bursty_streamy_stamina",
    label: "Bursty / Streamy / Stamina",
    description: "Longer stream sections with burst transitions and sustained stamina pressure.",
    descriptors: ["bursty", "streams", "stamina", "flow aim", "high density"],
    defaults: {
      difficulty: 6,
      approachRate: 9.8,
      overallDifficulty: 8.8,
      circleSize: 4,
      hpDrainRate: 6,
      cfgScale: 1.05,
      temperature: 0.95,
      topP: 0.95,
    },
  },
  {
    id: "finger_aim_control_tech",
    label: "Finger/Aim Control Tech",
    description: "Technical rhythm maps with finger-control and aim-control focus.",
    descriptors: ["finger control", "aim control", "technical", "rhythm complexity", "alt"],
    defaults: {
      difficulty: 5.8,
      approachRate: 9.4,
      overallDifficulty: 9,
      circleSize: 4,
      hpDrainRate: 5.4,
      cfgScale: 1.12,
      temperature: 0.92,
      topP: 0.93,
    },
  },
  {
    id: "jumpy_high_bpm",
    label: "Jumpy High-BPM",
    description: "High-BPM jump emphasis with wide movement and spike-heavy sections.",
    descriptors: ["jump aim", "high bpm", "wide aim", "difficulty spike", "snappy spacing"],
    defaults: {
      difficulty: 6.3,
      approachRate: 10.1,
      overallDifficulty: 9.2,
      circleSize: 4,
      hpDrainRate: 6.1,
      cfgScale: 1.08,
      temperature: 0.96,
      topP: 0.95,
    },
  },
  {
    id: "precision_technical",
    label: "Precision Technical",
    description: "Precision-heavy controlled aim with technical phrasing and stricter accuracy demands.",
    descriptors: ["precision", "distance snapped", "technical", "clean", "aim control"],
    defaults: {
      difficulty: 5.6,
      approachRate: 9.6,
      overallDifficulty: 9.3,
      circleSize: 4.1,
      hpDrainRate: 5.6,
      cfgScale: 1.1,
      temperature: 0.9,
      topP: 0.92,
    },
  },
  {
    id: "bursty_old_map",
    label: "Bursty Old Map",
    description:
      "Old-style burst/triple focus: lower AR/OD, close-spaced 3-6 note bursts, cleaner grid-ish patterning, and vocal-forward rhythm emphasis.",
    descriptors: ["old style", "bursty", "triples", "close spacing", "vocal rhythm", "grid based"],
    defaults: {
      year: 2010,
      difficulty: 4.9,
      approachRate: 8.4,
      overallDifficulty: 7.6,
      circleSize: 4,
      hpDrainRate: 4.6,
      cfgScale: 1.03,
      temperature: 0.94,
      topP: 0.94,
    },
  },
  {
    id: "jumpy_old_map",
    label: "Jumpy Old Map",
    description:
      "Old jump-focused style with simpler geometry, side-to-side/oibon jump movement, and lower AR/OD than modern high-BPM jump maps.",
    descriptors: ["old style", "jump aim", "oibon", "side to side jumps", "large jumps", "vocal rhythm"],
    defaults: {
      year: 2011,
      difficulty: 5.2,
      approachRate: 8.8,
      overallDifficulty: 7.9,
      circleSize: 4,
      hpDrainRate: 4.9,
      cfgScale: 1.04,
      temperature: 0.95,
      topP: 0.95,
    },
  },
  {
    id: "comfortable_flow",
    label: "Comfortable Flow",
    description: "Readable, flow-oriented maps with smoother movement and moderate density.",
    descriptors: ["flow aim", "clean", "comfortable", "readable", "balanced"],
    defaults: {
      difficulty: 5.1,
      approachRate: 9.2,
      overallDifficulty: 8.2,
      circleSize: 4,
      hpDrainRate: 4.8,
      cfgScale: 1,
      temperature: 1,
      topP: 0.96,
    },
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

const integerNumberKeys = new Set<keyof GeneratorParams>([
  "gamemode",
  "beatmapId",
  "mapperId",
  "year",
  "keycount",
  "seed",
  "startTime",
  "endTime",
  "timingLeniency",
  "topK",
  "numBeams",
  "timerNumBeams",
  "timerIterations",
  "maxBatchSize",
  "offset",
  "previewTime",
  "refineIters",
  "maxSeqLen",
  "overlapBuffer",
]);

const enumValuesByKey: Partial<Record<keyof GeneratorParams, string[]>> = {
  device: ["auto", "cpu", "cuda", "mps"],
  precision: ["auto", "fp16", "bf16", "fp32"],
  attnImplementation: ["auto", "sdpa", "flash_attention_2", "eager"],
  inContext: ["NONE", "GD", "NO_HS", "MAP", "TIMING"],
  outputType: ["MAP", "TIMING", "HITSOUND"],
};

const numberRangeByKey: Partial<Record<keyof GeneratorParams, { min?: number; max?: number }>> = {
  difficulty: { min: 0, max: 12 },
  approachRate: { min: 0, max: 11 },
  overallDifficulty: { min: 0, max: 11 },
  circleSize: { min: 2, max: 7 },
  hpDrainRate: { min: 0, max: 10 },
  cfgScale: { min: 0.5, max: 2 },
  temperature: { min: 0.4, max: 2 },
  topP: { min: 0, max: 1 },
  sliderMultiplier: { min: 0.5, max: 3 },
  sliderTickRate: { min: 0.1, max: 8 },
};

const requiredGeneratorParamKeys = new Set<keyof GeneratorParams>(["difficulty"]);

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

export function isGeneratorParamRequired(key: keyof GeneratorParams) {
  return requiredGeneratorParamKeys.has(key);
}

export function validateGeneratorParams(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["generatorParams must be an object."];
  }

  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const knownKeys = new Set(Object.keys(hydraKeyByParam));

  for (const rawKey of Object.keys(raw)) {
    if (!knownKeys.has(rawKey)) {
      errors.push(`Unknown generator param: ${rawKey}`);
      continue;
    }

    const key = rawKey as keyof GeneratorParams;
    const value = raw[rawKey];
    if (value === null || value === undefined) {
      continue;
    }

    if (numberKeys.has(key)) {
      const parsed = cleanNumber(value);
      if (parsed === null) {
        errors.push(`${rawKey} must be a number or null.`);
        continue;
      }
      if (integerNumberKeys.has(key) && !Number.isInteger(parsed)) {
        errors.push(`${rawKey} must be an integer.`);
      }
      const range = numberRangeByKey[key];
      if (range?.min !== undefined && parsed < range.min) {
        errors.push(`${rawKey} must be >= ${range.min}.`);
      }
      if (range?.max !== undefined && parsed > range.max) {
        errors.push(`${rawKey} must be <= ${range.max}.`);
      }
      continue;
    }

    if (booleanKeys.has(key)) {
      if (typeof value !== "boolean") {
        errors.push(`${rawKey} must be a boolean or null.`);
      }
      continue;
    }

    if (stringKeys.has(key)) {
      if (typeof value !== "string") {
        errors.push(`${rawKey} must be a string or null.`);
        continue;
      }
      const enumValues = enumValuesByKey[key];
      if (enumValues && !enumValues.includes(value)) {
        errors.push(`${rawKey} must be one of: ${enumValues.join(", ")}.`);
      }
      continue;
    }

    if (stringArrayKeys.has(key)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        errors.push(`${rawKey} must be a string[] or null.`);
        continue;
      }
      const enumValues = enumValuesByKey[key];
      if (enumValues) {
        const invalid = value.filter((item) => !enumValues.includes(item));
        if (invalid.length > 0) {
          errors.push(`${rawKey} includes invalid values: ${invalid.join(", ")}.`);
        }
      }
      continue;
    }

    if (numberArrayKeys.has(key)) {
      if (!Array.isArray(value) || value.some((item) => cleanNumber(item) === null)) {
        errors.push(`${rawKey} must be a number[] or null.`);
      }
    }
  }

  for (const key of requiredGeneratorParamKeys) {
    const value = raw[key];
    if (value === null || value === undefined) {
      errors.push(`${key} is required.`);
      continue;
    }
    if (numberKeys.has(key) && cleanNumber(value) === null) {
      errors.push(`${key} must be a number.`);
    }
  }

  return errors;
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
