import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { GenerationJob } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GenerationProfileSection } from "./generation-profile-section";
import type { GenerationProfileSectionProps } from "./types";

type ActionsPaneProps = {
  bootstrapping: boolean;
  jobsLoadedOnce: boolean;
  spotdlAckAt: string | null;
  busy: boolean;
  onAcknowledgeSpotdl: () => Promise<void>;
  selectedTrackCount: number;
  generationProfileProps: GenerationProfileSectionProps;
  jobs: GenerationJob[];
  jobsLoading: boolean;
  onDownloadZip: () => Promise<void>;
  error: string;
  notice: string;
};

export function ActionsPane({
  bootstrapping,
  jobsLoadedOnce,
  spotdlAckAt,
  busy,
  onAcknowledgeSpotdl,
  selectedTrackCount,
  generationProfileProps,
  jobs,
  jobsLoading,
  onDownloadZip,
  error,
  notice,
}: ActionsPaneProps) {
  return (
    <Card className="pane pane-right">
      <div className="pane-head">
        <h2 className="pane-title">Actions and Results</h2>
      </div>
      <div className="pane-body pane-body--right-scroll">
        {bootstrapping && !jobsLoadedOnce ? (
          <div className="list">
            <Skeleton style={{ width: "100%", height: "68px" }} />
            <Skeleton style={{ width: "100%", height: "90px" }} />
            <Skeleton style={{ width: "100%", height: "160px" }} />
          </div>
        ) : (
          <>
            {!spotdlAckAt ? (
              <div className="section-block">
                <div className="row-wrap">
                  <AlertTriangle size={14} className="warn-text" />
                  <span className="section-label">Downloader acknowledgment required</span>
                </div>
                <Button onClick={() => void onAcknowledgeSpotdl()} disabled={busy}>
                  I acknowledge audio rights
                </Button>
              </div>
            ) : (
              <p className="tiny muted">
                Downloader acknowledgment: {new Date(spotdlAckAt).toLocaleString()}
              </p>
            )}

            <div className="divider divider--strong" />

            <div className="section-island">
              <GenerationProfileSection {...generationProfileProps} />
            </div>

            <div className="divider divider--strong" />

            <div className="section-block section-island">
              <span className="section-label">Jobs + Export</span>
              <div className="row-wrap">
                <Button onClick={() => void onDownloadZip()} disabled={busy || selectedTrackCount === 0}>
                  <Download size={14} />
                  Download ZIP
                </Button>
                {jobsLoading ? <Badge variant="warning">Syncing jobs...</Badge> : null}
              </div>
              <ScrollArea className="ui-scroll-area jobs-scroll">
                <div className="list">
                  {jobs.length === 0 ? <p className="tiny muted">No jobs queued yet.</p> : null}
                  {jobs.slice(0, 30).map((job) => (
                    <article key={job.id} className="job-card">
                      <div className="row">
                        <span className="tiny">{job.id.slice(0, 8)}</span>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "success"
                              : job.status === "failed"
                                ? "danger"
                                : "info"
                          }
                        >
                          {job.status}
                        </Badge>
                      </div>
                      {job.runtime === "hosted_aws" && job.hosted?.batchJobId ? (
                        <p className="tiny muted">AWS Batch Job: {job.hosted.batchJobId}</p>
                      ) : null}
                      {job.warning ? <p className="warn-text">{job.warning}</p> : null}
                      {job.error ? <p className="error-text">{job.error}</p> : null}
                      {job.logs.length > 0 ? (
                        <pre className="job-logs">{job.logs.slice(-8).join("\n")}</pre>
                      ) : null}
                      {job.artifacts.length > 0 ? (
                        <div className="list">
                          {job.artifacts.map((artifact) => (
                            <Link
                              key={artifact.id}
                              href={`/api/generation/jobs/${job.id}/artifacts/${artifact.id}/download`}
                              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                            >
                              {artifact.fileName}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {error ? (
              <>
                <div className="divider divider--strong" />
                <div className="section-island">
                  <p className="error-text">{error}</p>
                </div>
              </>
            ) : null}
            {notice ? (
              <div className="section-island">
                <p className="tiny muted">{notice}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
