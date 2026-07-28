"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GenerationJob, Track } from "@/lib/types";

type Props = {
  jobs: GenerationJob[];
  tracksById: Record<string, Track>;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onClearHistory: () => void;
};

export function JobsPane({ jobs, tracksById, onRetry, onCancel, onClearHistory }: Props) {
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  if (jobs.length === 0) {
    return <p className="muted">No generation jobs yet.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <Button variant="ghost" onClick={onClearHistory}>
          Clear finished
        </Button>
      </div>
      {jobs.map((job) => {
        const track = tracksById[job.trackId];
        const active = job.status === "queued" || job.status === "running";
        return (
          <div key={job.id} className="job">
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="job__status" data-status={job.status}>
                {job.status}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {track ? `${track.artists.join(", ")} — ${track.title}` : job.trackId}
              </span>
              <span className="ui-badge">{job.modelVersion}</span>
            </div>

            {job.dcc ? (
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
