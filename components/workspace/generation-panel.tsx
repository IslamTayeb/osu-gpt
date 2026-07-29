"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import {
  DerivedDifficultyKey,
  defaultDifficultyParams,
  derivedDifficultyKeys,
  descriptorVocabulary,
  modelVersions,
  numberRangeByKey,
  starToSettings,
  supportsStyleTokens,
} from "@/lib/generatorConfig";
import { AppSettings, GeneratorParams, ModelVersion } from "@/lib/types";

type Props = {
  settings: AppSettings;
  selectedCount: number;
  busy: boolean;
  onGenerate: (input: {
    generatorParams: GeneratorParams;
    modelVersion: ModelVersion;
    experimentalCompile: boolean;
  }) => void;
};

const range = (key: keyof GeneratorParams) => numberRangeByKey[key] ?? {};

const derivedFieldLabels: Record<DerivedDifficultyKey, string> = {
  approachRate: "AR",
  overallDifficulty: "OD",
  circleSize: "CS",
  hpDrainRate: "HP",
};

export function GenerationPanel({ settings, selectedCount, busy, onGenerate }: Props) {
  // Auto-first: the saved star seeds the panel and AR/OD/CS/HP derive from it.
  // Saved AR/OD/CS/HP are deliberately ignored — the old UI wrote them back on
  // every generate, so they are stale echoes of old defaults, not choices.
  // Pins (manual overrides) are session-only state.
  const [params, setParams] = useState<GeneratorParams>(() => {
    const seeded = { ...defaultDifficultyParams, ...settings.generationDefaults };
    return { ...seeded, ...starToSettings(seeded.difficulty ?? defaultDifficultyParams.difficulty) };
  });
  const [pinned, setPinned] = useState<Set<DerivedDifficultyKey>>(new Set());
  const [modelVersion, setModelVersion] = useState<ModelVersion>(settings.modelVersion);
  const [experimentalCompile, setExperimentalCompile] = useState(settings.experimentalCompile);

  const set = <K extends keyof GeneratorParams>(key: K, value: GeneratorParams[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  /** Star drives everything not pinned; pinned values ride along untouched. */
  const setStars = (stars: number | null) => {
    setParams((prev) => {
      const next = { ...prev, difficulty: stars };
      if (stars !== null) {
        const derived = starToSettings(stars);
        for (const key of derivedDifficultyKeys) {
          if (!pinned.has(key)) next[key] = derived[key];
        }
      }
      return next;
    });
  };

  /** Typing a value takes the field off auto until its "auto" button is pressed. */
  const setDerived = (key: DerivedDifficultyKey, value: number | null) => {
    set(key, value);
    setPinned((prev) => new Set(prev).add(key));
  };

  const unpin = (key: DerivedDifficultyKey) => {
    setPinned((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    const stars = params.difficulty ?? defaultDifficultyParams.difficulty;
    set(key, starToSettings(stars)[key]);
  };

  const styleAware = supportsStyleTokens(modelVersion);

  return (
    <section className="section">
      <h2 className="section__title">Difficulty</h2>
      <NumberField
        label="Star rating"
        value={params.difficulty}
        onChange={setStars}
        hint="AR, OD, CS and HP follow what ranked maps use at this rating."
        {...range("difficulty")}
      />
      <div className="field-grid">
        {derivedDifficultyKeys.map((key) => (
          <NumberField
            key={key}
            label={derivedFieldLabels[key]}
            value={params[key]}
            onChange={(v) => setDerived(key, v)}
            trailing={
              pinned.has(key) ? (
                <button type="button" className="field__auto" onClick={() => unpin(key)}>
                  auto
                </button>
              ) : (
                <span className="field__auto field__auto--on">auto</span>
              )
            }
            {...range(key)}
          />
        ))}
      </div>

      <details className="advanced">
        <summary>Advanced settings</summary>
        <div className="advanced__body">
          <label className="field">
            <span className="field__label">Model</span>
            <select
              className="ui-select"
              value={modelVersion}
              onChange={(event) => setModelVersion(event.target.value as ModelVersion)}
            >
              {modelVersions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} — {option.note}
                </option>
              ))}
            </select>
          </label>

          {styleAware ? (
            <>
              <NumberField
                label="Mapper ID"
                value={params.mapperId}
                onChange={(v) => set("mapperId", v)}
                placeholder="Any mapper"
                hint="osu! user id to imitate."
                {...range("mapperId")}
              />
              <NumberField
                label="Style year"
                value={params.year}
                onChange={(v) => set("year", v)}
                placeholder="Any year"
                step={1}
                {...range("year")}
              />
              <DescriptorPicker
                label="Descriptors"
                value={params.descriptors ?? []}
                onChange={(v) => set("descriptors", v)}
              />
              <DescriptorPicker
                label="Avoid descriptors"
                value={params.negativeDescriptors ?? []}
                onChange={(v) => set("negativeDescriptors", v)}
                hint="Needs guidance above 1 to have any effect."
              />
            </>
          ) : (
            <p className="note">
              {modelVersions.find((m) => m.id === modelVersion)?.label} ignores mapper, descriptor
              and year settings.
            </p>
          )}

          <NumberField
            label="Guidance (CFG)"
            value={params.cfgScale}
            onChange={(v) => set("cfgScale", v)}
            placeholder="Model default"
            {...range("cfgScale")}
          />
          <NumberField
            label="Temperature"
            value={params.temperature}
            onChange={(v) => set("temperature", v)}
            placeholder="Model default"
            {...range("temperature")}
          />
          <NumberField
            label="Top-p"
            value={params.topP}
            onChange={(v) => set("topP", v)}
            placeholder="Model default"
            {...range("topP")}
          />
          <NumberField
            label="Seed"
            value={params.seed}
            onChange={(v) => set("seed", v)}
            placeholder="Random"
            step={1}
            {...range("seed")}
          />

          <label className="check">
            <input
              type="checkbox"
              checked={params.superTiming ?? false}
              onChange={(event) => set("superTiming", event.target.checked || null)}
            />
            <span>Super timing (slower, more accurate BPM)</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={experimentalCompile}
              onChange={(event) => setExperimentalCompile(event.target.checked)}
            />
            <span>Experimental compiled decode (cluster only, unverified)</span>
          </label>
        </div>
      </details>

      <Button
        onClick={() => onGenerate({ generatorParams: params, modelVersion, experimentalCompile })}
        disabled={busy || selectedCount === 0}
      >
        {busy
          ? "Working..."
          : `Generate ${selectedCount || ""} ${selectedCount === 1 ? "map" : "maps"}`.trim()}
      </Button>
    </section>
  );
}

function DescriptorPicker({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `descriptors-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const add = (candidate: string) => {
    const cleaned = candidate.trim();
    if (!cleaned || value.includes(cleaned)) return;
    if (!descriptorVocabulary.includes(cleaned as (typeof descriptorVocabulary)[number])) return;
    onChange([...value, cleaned]);
    setDraft("");
  };

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <Input
        list={listId}
        value={draft}
        placeholder="Type to search..."
        onChange={(event) => {
          setDraft(event.target.value);
          // datalist selection fires as a full-value change
          if (descriptorVocabulary.includes(event.target.value as (typeof descriptorVocabulary)[number])) {
            add(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
        }}
      />
      <datalist id={listId}>
        {descriptorVocabulary
          .filter((option) => !value.includes(option))
          .map((option) => (
            <option key={option} value={option} />
          ))}
      </datalist>
      {value.length > 0 ? (
        <ul className="chips">
          {value.map((item) => (
            <li key={item}>
              <button type="button" onClick={() => onChange(value.filter((v) => v !== item))}>
                {item} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
