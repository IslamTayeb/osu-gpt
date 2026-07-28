"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSettings, RuntimeType } from "@/lib/types";

type DccStatus = {
  reachable: boolean;
  detail?: string;
  freeGpus: { partition: string; type: string; count: number }[];
  pin: { expected: string; localActual?: string; clusterActual?: string; drift: boolean };
};

type Props = {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  firstRun?: boolean;
};

export function SettingsPanel({ settings, onSave, firstRun }: Props) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState<DccStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const checkCluster = async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/runtime/dcc/status");
      setStatus(await response.json());
    } catch {
      setStatus({ reachable: false, detail: "Status request failed.", freeGpus: [], pin: { expected: "", drift: false } });
    } finally {
      setChecking(false);
    }
  };

  const save = async (extra: Partial<AppSettings> = {}) => {
    setSaving(true);
    try {
      await onSave({ ...draft, ...extra });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section">
      <h2 className="section__title">{firstRun ? "Setup" : "Settings"}</h2>

      <label className="field">
        <span className="field__label">Where maps are generated</span>
        <select
          className="ui-select"
          value={draft.runtime}
          onChange={(event) => setDraft({ ...draft, runtime: event.target.value as RuntimeType })}
        >
          <option value="dcc">Duke compute cluster (recommended)</option>
          <option value="local">This machine</option>
        </select>
      </label>

      {draft.runtime === "dcc" ? (
        <div className="cluster-status">
          <Button variant="secondary" onClick={checkCluster} disabled={checking}>
            {checking ? "Checking..." : "Test cluster connection"}
          </Button>
          {status ? (
            status.reachable ? (
              <div>
                <p className="ok">Connected.</p>
                <p className="muted">
                  {status.freeGpus.length > 0
                    ? `Free now: ${status.freeGpus
                        .map((gpu) => `${gpu.count}× ${gpu.type} (${gpu.partition})`)
                        .join(", ")}`
                    : "No GPUs free right now — jobs will queue."}
                </p>
                {status.pin.drift ? (
                  <p className="warn">
                    Mapperatorinator checkout differs from the pinned commit{" "}
                    {status.pin.expected} (local {status.pin.localActual ?? "?"}, cluster{" "}
                    {status.pin.clusterActual ?? "?"}).
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="warn">{status.detail}</p>
            )
          ) : null}
        </div>
      ) : null}

      <label className="field">
        <span className="field__label">Export folder</span>
        <Input
          value={draft.exportDir ?? ""}
          placeholder="Leave empty to download from the browser only"
          onChange={(event) => setDraft({ ...draft, exportDir: event.target.value || null })}
        />
        <span className="field__hint">
          Finished .osz files are copied here — point it at your osu! Songs folder.
        </span>
      </label>

      <label className="field">
        <span className="field__label">Audio cache folder</span>
        <Input
          value={draft.audioCacheDir}
          onChange={(event) => setDraft({ ...draft, audioCacheDir: event.target.value })}
        />
        <span className="field__hint">
          Holds downloaded songs and 30-second previews so they are fetched once.
        </span>
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

      <Button
        onClick={() => save(firstRun ? { setupCompletedAt: new Date().toISOString() } : {})}
        disabled={saving}
      >
        {saving ? "Saving..." : firstRun ? "Get started" : "Save settings"}
      </Button>
    </section>
  );
}
