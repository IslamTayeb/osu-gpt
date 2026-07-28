import { descriptorVocabulary, isDescriptor } from "./generated/descriptors";
import { GeneratorParams, ModelVersion, Track } from "./types";

export const modelVersions: { id: ModelVersion; label: string; note: string }[] = [
  { id: "v32", label: "V32", note: "Best model. bf16 + fast decoding by default." },
  { id: "v32-mini", label: "V32 mini", note: "Smaller and faster, lower quality." },
  { id: "v31", label: "V31", note: "Previous generation." },
  { id: "v30", label: "V30", note: "Ignores mapper, descriptor, and year settings." },
];

/** Model configs that were trained with style tokens (mapper/descriptors/year). */
const styleAwareVersions = new Set<ModelVersion>(["v32", "v32-mini", "v31"]);

export function supportsStyleTokens(version: ModelVersion) {
  return styleAwareVersions.has(version);
}

export { descriptorVocabulary, isDescriptor };

/**
 * Difficulty settings that are always sent. These are the only things the user
 * must decide; everything else stays null so the model's own config wins.
 */
export const requiredParamKeys = [
  "difficulty",
  "approachRate",
  "overallDifficulty",
  "circleSize",
  "hpDrainRate",
] as const;

export const defaultDifficultyParams: Required<
  Pick<GeneratorParams, (typeof requiredParamKeys)[number]>
> = {
  difficulty: 5.2,
  approachRate: 9,
  overallDifficulty: 8,
  circleSize: 4,
  hpDrainRate: 5,
};

export const numberRangeByKey: Partial<
  Record<keyof GeneratorParams, { min?: number; max?: number; step?: number }>
> = {
  difficulty: { min: 0, max: 12, step: 0.1 },
  approachRate: { min: 0, max: 11, step: 0.1 },
  overallDifficulty: { min: 0, max: 11, step: 0.1 },
  circleSize: { min: 2, max: 7, step: 0.1 },
  hpDrainRate: { min: 0, max: 10, step: 0.1 },
  cfgScale: { min: 0.5, max: 4, step: 0.1 },
  temperature: { min: 0.4, max: 2, step: 0.05 },
  topP: { min: 0, max: 1, step: 0.05 },
  year: { min: 2007, max: new Date().getUTCFullYear() },
  mapperId: { min: 1 },
  seed: { min: 0 },
};

const hydraKeyByParam: Record<keyof GeneratorParams, string> = {
  difficulty: "difficulty",
  hpDrainRate: "hp_drain_rate",
  circleSize: "circle_size",
  overallDifficulty: "overall_difficulty",
  approachRate: "approach_rate",
  mapperId: "mapper_id",
  year: "year",
  hitsounded: "hitsounded",
  descriptors: "descriptors",
  negativeDescriptors: "negative_descriptors",
  cfgScale: "cfg_scale",
  temperature: "temperature",
  topP: "top_p",
  seed: "seed",
  superTiming: "super_timing",
  startTime: "start_time",
  endTime: "end_time",
  title: "title",
  titleUnicode: "title_unicode",
  artist: "artist",
  artistUnicode: "artist_unicode",
  creator: "creator",
  version: "version",
};

/**
 * Merge user params with the required difficulty settings and track metadata.
 * Deliberately sparse: any key left null is omitted from the overrides so the
 * chosen model config keeps its own tuned defaults.
 */
export function buildGeneratorParams(params: GeneratorParams, track: Track): GeneratorParams {
  const difficulty = params.difficulty ?? defaultDifficultyParams.difficulty;
  const artist = track.artists.join(", ") || "Unknown Artist";
  return {
    ...defaultDifficultyParams,
    ...stripEmpty(params),
    difficulty,
    title: track.title,
    titleUnicode: track.title,
    artist,
    artistUnicode: artist,
    creator: "osu-gpt",
    version: `osu-gpt ${difficulty}★`,
  };
}

function stripEmpty(params: GeneratorParams): GeneratorParams {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out as GeneratorParams;
}

export function validateParams(params: GeneratorParams): string[] {
  const errors: string[] = [];
  if (params.difficulty === null || params.difficulty === undefined) {
    errors.push("Star difficulty is required.");
  }
  for (const [key, range] of Object.entries(numberRangeByKey)) {
    const value = params[key as keyof GeneratorParams];
    if (typeof value !== "number") continue;
    if (range.min !== undefined && value < range.min) {
      errors.push(`${key} must be at least ${range.min}.`);
    }
    if (range.max !== undefined && value > range.max) {
      errors.push(`${key} must be at most ${range.max}.`);
    }
  }
  for (const list of [params.descriptors, params.negativeDescriptors]) {
    for (const descriptor of list ?? []) {
      if (!isDescriptor(descriptor)) {
        errors.push(`Unknown descriptor "${descriptor}".`);
      }
    }
  }
  return errors;
}

function hydraScalar(value: string | number | boolean) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function toHydraOverrides(params: GeneratorParams): string[] {
  const overrides: string[] = [];
  for (const [key, value] of Object.entries(params) as Array<
    [keyof GeneratorParams, unknown]
  >) {
    const hydraKey = hydraKeyByParam[key];
    if (!hydraKey || value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      overrides.push(`${hydraKey}=[${value.map((v) => hydraScalar(v as string)).join(",")}]`);
    } else if (typeof value === "string") {
      if (!value.trim()) continue;
      overrides.push(`${hydraKey}=${hydraScalar(value)}`);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      overrides.push(`${hydraKey}=${value}`);
    } else if (typeof value === "boolean") {
      overrides.push(`${hydraKey}=${value}`);
    }
  }
  // The app always wants a packaged beatmap back.
  overrides.push("export_osz=true");
  return overrides;
}
