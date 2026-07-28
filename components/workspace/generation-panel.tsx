"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import {
  defaultDifficultyParams,
  descriptorVocabulary,
  modelVersions,
  numberRangeByKey,
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

export function GenerationPanel({ settings, selectedCount, busy, onGenerate }: Props) {
  const [params, setParams] = useState<GeneratorParams>({
    ...defaultDifficultyParams,
    ...settings.generationDefaults,
  });
  const [modelVersion, setModelVersion] = useState<ModelVersion>(settings.modelVersion);
  const [experimentalCompile, setExperimentalCompile] = useState(settings.experimentalCompile);

  const set = <K extends keyof GeneratorParams>(key: K, value: GeneratorParams[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  const styleAware = supportsStyleTokens(modelVersion);

  return (
    <section className="section">
      <h2 className="section__title">Difficulty</h2>
      <div className="field-grid">
        <NumberField
          label="Star rating"
          value={params.difficulty}
          onChange={(v) => set("difficulty", v)}
          {...range("difficulty")}
        />
        <NumberField
          label="AR"
          value={params.approachRate}
          onChange={(v) => set("approachRate", v)}
          {...range("approachRate")}
        />
        <NumberField
          label="OD"
          value={params.overallDifficulty}
          onChange={(v) => set("overallDifficulty", v)}
          {...range("overallDifficulty")}
        />
        <NumberField
          label="CS"
          value={params.circleSize}
          onChange={(v) => set("circleSize", v)}
          {...range("circleSize")}
        />
        <NumberField
          label="HP"
          value={params.hpDrainRate}
          onChange={(v) => set("hpDrainRate", v)}
          {...range("hpDrainRate")}
        />
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
