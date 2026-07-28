"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/runtime/gpuProfiles";
import { AppSettings, RuntimeType } from "@/lib/types";

type ProfileEstimate = {
  id: AppSettings["gpuProfile"];
  label: string;
  note: string;
  freeNow: number;
  expectedWaitSec: number;
  p90WaitSec: number;
};

type Props = {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  firstRun?: boolean;
};

export function SettingsPanel({ settings, onSave, firstRun }: Props) {
  const [draft, setDraft] = useState(settings);
  const [estimates, setEstimates] = useState<ProfileEstimate[] | null>(null);
  const [osu, setOsu] = useState<{ installed: boolean; detail: string } | null>(null);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/osu/detect")
      .then((r) => r.json())
      .then(setOsu)
      .catch(() => setOsu(null));
  }, []);

  // Ask the cluster what the wait actually looks like, on demand.
  const refreshEstimates = useCallback(async (fresh = false) => {
    setLoadingEstimates(true);
    try {
      const response = await fetch(`/api/runtime/dcc/estimate${fresh ? "?fresh=1" : ""}`);
      const data = (await response.json()) as { profiles?: ProfileEstimate[] };
      setEstimates(data.profiles ?? null);
    } catch {
      setEstimates(null);
    } finally {
      setLoadingEstimates(false);
    }
  }, []);

  useEffect(() => {
    if (draft.runtime === "dcc") void refreshEstimates();
  }, [draft.runtime, refreshEstimates]);

  const save = async (extra: Partial<AppSettings> = {}) => {
    setSaving(true);
    try {
      await onSave({ ...draft, ...extra });
    } finally {
      setSaving(false);
    }
  };

  const current = estimates?.find((e) => e.id === draft.gpuProfile);

  return (
    <section className="section">
      <h2 className="section__title">{firstRun ? "Setup" : "Settings"}</h2>

      <label className="field">
        <span className="field__label">Generate on</span>
        <select
          className="ui-select"
          value={draft.runtime}
          onChange={(event) => setDraft({ ...draft, runtime: event.target.value as RuntimeType })}
        >
          <option value="dcc">Duke compute cluster</option>
          <option value="local">This machine</option>
        </select>
      </label>

      {draft.runtime === "dcc" ? (
        <label className="field">
          <span className="field__label">GPU</span>
          <select
            className="ui-select"
            value={draft.gpuProfile}
            onFocus={() => refreshEstimates(true)}
            onChange={(event) =>
              setDraft({ ...draft, gpuProfile: event.target.value as AppSettings["gpuProfile"] })
            }
          >
            {(estimates ?? []).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label} — starts in ~{formatDuration(profile.expectedWaitSec)}
                {profile.freeNow > 0 ? ` (${profile.freeNow} free)` : " (none free)"}
              </option>
            ))}
            {!estimates ? <option value={draft.gpuProfile}>Checking the cluster…</option> : null}
          </select>
          <span className="field__hint">
            {loadingEstimates ? "Checking live availability…" : current?.note}
            {current && current.p90WaitSec > 120
              ? ` Worst case seen: ${formatDuration(current.p90WaitSec)}.`
              : ""}
          </span>
        </label>
      ) : null}

      {osu ? (
        <label className="check">
          <input
            type="checkbox"
            checked={draft.openInOsu && osu.installed}
            disabled={!osu.installed}
            onChange={(event) => setDraft({ ...draft, openInOsu: event.target.checked })}
          />
          <span>Open finished maps in osu!</span>
        </label>
      ) : null}
      {osu && !osu.installed ? <p className="field__hint">{osu.detail}</p> : null}

      <details className="advanced">
        <summary>Advanced settings</summary>
        <div className="advanced__body">
          <label className="field">
            <span className="field__label">Also save .osz to a folder</span>
            <Input
              value={draft.exportDir ?? ""}
              placeholder="Optional — downloads work without this"
              onChange={(event) => setDraft({ ...draft, exportDir: event.target.value || null })}
            />
          </label>

          <label className="field">
            <span className="field__label">Audio cache folder</span>
            <Input
              value={draft.audioCacheDir}
              onChange={(event) => setDraft({ ...draft, audioCacheDir: event.target.value })}
            />
            <span className="field__hint">Downloaded songs and previews, fetched once.</span>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.loudnormEnabled}
              onChange={(event) => setDraft({ ...draft, loudnormEnabled: event.target.checked })}
            />
            <span>Normalize loudness to {draft.loudnormTargetLufs} LUFS</span>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.prefetchPreviews}
              onChange={(event) => setDraft({ ...draft, prefetchPreviews: event.target.checked })}
            />
            <span>Pre-fetch previews for the whole library</span>
          </label>

          <Button variant="ghost" onClick={() => refreshEstimates(true)}>
            Re-check cluster
          </Button>
        </div>
      </details>

      <Button
        onClick={() => save(firstRun ? { setupCompletedAt: new Date().toISOString() } : {})}
        disabled={saving}
      >
        {saving ? "Saving…" : firstRun ? "Get started" : "Save settings"}
      </Button>
    </section>
  );
}
