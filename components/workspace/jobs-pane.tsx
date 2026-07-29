"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GenerationJob, Track } from "@/lib/types";

/** "41s", "2m 41s", "1h 12m" — wall-clock granularity for a timer, not an estimate. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const isActive = (job: GenerationJob) => job.status === "queued" || job.status === "running";

function jobSpan(job: GenerationJob, now: number) {
  const start = Date.parse(job.startedAt ?? job.createdAt);
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
  return { start, end };
}

/** Ticks once a second while anything is live so elapsed readouts move. */
function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

type Props = {
  jobs: GenerationJob[];
  tracksById: Record<string, Track>;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onClearHistory: () => void;
};

export function JobsPane({ jobs, tracksById, onRetry, onCancel, onClearHistory }: Props) {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const now = useNow(jobs.some(isActive));

  if (jobs.length === 0) {
    return <p className="muted">No generation jobs yet.</p>;
  }

  // Jobs that rode in one Slurm batch share a slurmJobId; group them so the
  // list reads as what actually happened: one GPU process, several maps.
  const groups: GenerationJob[][] = [];
  const byBatch = new Map<string, GenerationJob[]>();
  for (const job of jobs) {
    const batchId = job.dcc?.slurmJobId;
    if (batchId && byBatch.has(batchId)) {
      byBatch.get(batchId)!.push(job);
      continue;
    }
    const group = [job];
    if (batchId) byBatch.set(batchId, group);
    groups.push(group);
  }

  const renderJob = (job: GenerationJob, grouped: boolean) => {
    const track = tracksById[job.trackId];
    const active = isActive(job);
    const span = jobSpan(job, now);
    return (
          <div key={job.id} className="job">
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="job__status" data-status={job.status}>
                {job.status}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {job.trackLabel ?? (track ? `${track.artists.join(", ")} — ${track.title}` : job.trackId)}
              </span>
              <span className="job__elapsed">{formatElapsed(span.end - span.start)}</span>
              <span className="ui-badge">{job.modelVersion}</span>
            </div>

            {job.dcc && !grouped ? (
              <p className="muted">
                Slurm {job.dcc.slurmJobId} on {job.dcc.gres} ({job.dcc.partition})
                {job.dcc.statusReason ? ` — ${job.dcc.statusReason}` : ""}
              </p>
            ) : null}
            {job.error ? <p className="danger">{job.error}</p> : null}

            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
              <Button
                variant="ghost"
                onClick={() => setOpenJobId(openJobId === job.id ? null : job.id)}
              >
                {openJobId === job.id ? "Hide log" : "Log"}
              </Button>
              {active ? (
                <Button variant="ghost" onClick={() => onCancel(job.id)}>
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => onRetry(job.id)}>
                  Retry
                </Button>
              )}
              {job.artifacts
                .filter((artifact) => artifact.fileName.endsWith(".osz"))
                .map((artifact) => (
                  <a
                    key={artifact.id}
                    className="ui-button ui-button--secondary"
                    href={`/api/generation/jobs/${job.id}/artifacts/${artifact.id}/download`}
                  >
                    Download
                  </a>
                ))}
            </div>

            {openJobId === job.id ? <JobLog jobId={job.id} live={active} /> : null}
          </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <Button variant="ghost" onClick={onClearHistory}>
          Clear finished
        </Button>
      </div>
      {groups.map((group) => {
        const [first] = group;
        if (group.length === 1) return renderJob(first, false);
        const spans = group.map((job) => jobSpan(job, now));
        const batchStart = Math.min(...spans.map((s) => s.start));
        const batchEnd = group.some(isActive) ? now : Math.max(...spans.map((s) => s.end));
        return (
          <div key={first.dcc?.slurmJobId ?? first.id} className="job-batch">
            <p className="job-batch__title">
              Batch of {group.length} — Slurm {first.dcc?.slurmJobId} on {first.dcc?.gres} (
              {first.dcc?.partition}) · {formatElapsed(batchEnd - batchStart)}
              {first.dcc?.statusReason ? ` — ${first.dcc.statusReason}` : ""}
            </p>
            {group.map((job) => renderJob(job, true))}
          </div>
        );
      })}
    </div>
  );
}

function JobLog({ jobId, live }: { jobId: string; live: boolean }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/generation/jobs/${jobId}`);
        const data = (await response.json()) as { logs?: string[] };
        if (!cancelled) setLines(data.logs ?? []);
      } catch {
        // A missing log is not worth surfacing.
      }
    };
    void load();
    if (!live) return;
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, live]);

  return <pre className="log">{lines.slice(-200).join("\n") || "No output yet."}</pre>;
}
