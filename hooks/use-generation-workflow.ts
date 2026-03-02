import { useCallback, type Dispatch, type SetStateAction } from "react";
import { inferFilename } from "@/lib/homeUi";
import type { GenerationJob, GeneratorParams } from "@/lib/types";

type UseGenerationWorkflowParams = {
  selectedTrackIds: string[];
  spotdlAckAt: string | null;
  runtime: "local" | "hosted_aws";
  awsConfigured: boolean;
  preset: "quick" | "balanced" | "high_quality";
  timeoutSec: number;
  budgetCapUsd: number;
  generatorParams: GeneratorParams;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  fetchJobs: () => Promise<void>;
};

type UseGenerationWorkflowResult = {
  queueGeneration: (trackIds: string[]) => Promise<void>;
  downloadZip: () => Promise<void>;
};

export function useGenerationWorkflow({
  selectedTrackIds,
  spotdlAckAt,
  runtime,
  awsConfigured,
  preset,
  timeoutSec,
  budgetCapUsd,
  generatorParams,
  setBusy,
  setError,
  setNotice,
  fetchJobs,
}: UseGenerationWorkflowParams): UseGenerationWorkflowResult {
  const queueGeneration = useCallback(
    async (trackIds: string[]) => {
      if (trackIds.length === 0) {
        setError("No tracks selected for generation.");
        return;
      }
      if (!spotdlAckAt) {
        setError("Acknowledge downloader usage before generation.");
        return;
      }
      if (runtime === "hosted_aws" && !awsConfigured) {
        setError("Save Hosted AWS session settings before queuing hosted jobs.");
        return;
      }
      if (budgetCapUsd > 50 && !window.confirm("Budget cap is above $50. Continue?")) {
        return;
      }

      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/generation/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackIds,
            runtime,
            preset,
            timeoutSec,
            budgetCapUsd,
            generatorParams,
          }),
        });
        const body = (await response.json()) as {
          error?: string;
          details?: string[];
          jobs?: GenerationJob[];
          job?: GenerationJob;
        };
        if (!response.ok) {
          if (body.details && body.details.length > 0) {
            throw new Error(
              `${body.error ?? "Could not create generation job(s)"} ${body.details.join(" ")}`,
            );
          }
          throw new Error(body.error ?? "Could not create generation job(s)");
        }

        const createdCount = body.jobs?.length ?? (body.job ? 1 : 0);
        setNotice(`Queued ${createdCount} job${createdCount === 1 ? "" : "s"}.`);
        await fetchJobs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setBusy(false);
      }
    },
    [
      fetchJobs,
      spotdlAckAt,
      runtime,
      awsConfigured,
      budgetCapUsd,
      preset,
      timeoutSec,
      generatorParams,
      setBusy,
      setError,
      setNotice,
    ],
  );

  const downloadZip = useCallback(async () => {
    if (selectedTrackIds.length === 0) {
      setError("Select tracks to export.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generation/export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: selectedTrackIds }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = inferFilename(response.headers.get("content-disposition"));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setNotice("ZIP export downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }, [selectedTrackIds, setBusy, setError, setNotice]);

  return { queueGeneration, downloadZip };
}
