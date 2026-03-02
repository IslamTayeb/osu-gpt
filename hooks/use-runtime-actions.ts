import { useCallback } from "react";
import { toast } from "sonner";
import type { HostedAwsSessionStatus, OsuSessionStatus } from "@/lib/homeTypes";
import type { UseRuntimeActionsParams, UseRuntimeActionsResult } from "@/hooks/runtime-actions.types";

export function useRuntimeActions(params: UseRuntimeActionsParams): UseRuntimeActionsResult {
  const {
    fetchSession,
    clearSelection,
    setBusy,
    setError,
    setNotice,
    setSpotdlAckAt,
    setOsuSessionStatus,
    setOsuClientId,
    setOsuClientSecret,
    setAwsSessionStatus,
    setAwsAccessKeyId,
    setAwsSecretAccessKey,
    setAwsSessionToken,
    setAwsRegion,
    setAwsBatchQueue,
    setAwsBatchJobDefinition,
    setAwsS3Bucket,
    setAwsS3Prefix,
    setAwsCloudWatchLogGroup,
    setTracks,
    setTrackCacheById,
    setJobs,
    setMatchSnapshots,
    setLastMatchSummary,
    setTracksTotal,
    setTotalTracks,
    setVisibleStart,
    setVisibleEnd,
    setTotalPages,
    setPage,
    osuClientId,
    osuClientSecret,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
  } = params;

  const acknowledgeSpotdl = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/ack", { method: "POST" });
      const body = (await response.json()) as { acknowledgedAt?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save acknowledgment");
      }
      setSpotdlAckAt(body.acknowledgedAt ?? new Date().toISOString());
      setNotice("Downloader acknowledgment saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledgment failed");
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setNotice, setSpotdlAckAt]);

  const saveOsuRuntimeSession = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/osu/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: osuClientId,
          clientSecret: osuClientSecret,
        }),
      });
      const body = (await response.json()) as OsuSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save osu credentials");
      }
      setOsuSessionStatus(body);
      setOsuClientSecret("");
      setNotice("osu API credentials saved for this session.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save osu credentials");
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    osuClientId,
    osuClientSecret,
    setBusy,
    setError,
    setNotice,
    setOsuSessionStatus,
    setOsuClientSecret,
  ]);

  const clearOsuRuntimeSession = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/osu/session", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Could not clear osu credentials");
      }
      setOsuSessionStatus({ configured: false });
      setOsuClientId("");
      setOsuClientSecret("");
      setNotice("osu API credentials cleared.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear osu credentials");
    } finally {
      setBusy(false);
    }
  }, [fetchSession, setBusy, setError, setNotice, setOsuSessionStatus, setOsuClientId, setOsuClientSecret]);

  const saveAwsRuntimeSession = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
          sessionToken: awsSessionToken,
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to save AWS session.");
      }

      setAwsSessionStatus(body);
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      setNotice("Hosted AWS session saved.");
      await fetchSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save AWS session.";
      toast.error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
    setBusy,
    setError,
    setNotice,
    setAwsSessionStatus,
    setAwsSecretAccessKey,
    setAwsSessionToken,
  ]);

  const loadAwsRuntimeSessionFromCli = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session/from-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string; warning?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load AWS session from CLI.");
      }

      setAwsSessionStatus(body);
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      if (body.region) setAwsRegion(body.region);
      if (body.batchQueue) setAwsBatchQueue(body.batchQueue);
      if (body.batchJobDefinition) setAwsBatchJobDefinition(body.batchJobDefinition);
      if (body.s3Bucket) setAwsS3Bucket(body.s3Bucket);
      if (body.s3Prefix) setAwsS3Prefix(body.s3Prefix);
      if (body.cloudWatchLogGroup) setAwsCloudWatchLogGroup(body.cloudWatchLogGroup);
      setNotice(
        body.warning ??
          `Hosted AWS session loaded from AWS CLI profile ${(body.profile ?? awsProfile) || "default"}.`,
      );
      await fetchSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load AWS session from CLI.";
      toast.error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
    setBusy,
    setError,
    setNotice,
    setAwsSessionStatus,
    setAwsAccessKeyId,
    setAwsSecretAccessKey,
    setAwsSessionToken,
    setAwsRegion,
    setAwsBatchQueue,
    setAwsBatchJobDefinition,
    setAwsS3Bucket,
    setAwsS3Prefix,
    setAwsCloudWatchLogGroup,
  ]);

  const autoLoadAwsRuntimeSession = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string; warning?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to auto-load AWS session.");
      }

      setAwsSessionStatus(body);
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      if (body.region) setAwsRegion(body.region);
      if (body.batchQueue) setAwsBatchQueue(body.batchQueue);
      if (body.batchJobDefinition) setAwsBatchJobDefinition(body.batchJobDefinition);
      if (body.s3Bucket) setAwsS3Bucket(body.s3Bucket);
      if (body.s3Prefix) setAwsS3Prefix(body.s3Prefix);
      if (body.cloudWatchLogGroup) setAwsCloudWatchLogGroup(body.cloudWatchLogGroup);
      setNotice(
        body.warning ??
          `Hosted AWS session auto-loaded via AWS SDK chain (${(body.profile ?? awsProfile) || "default"}).`,
      );
      await fetchSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to auto-load AWS session.";
      toast.error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
    setBusy,
    setError,
    setNotice,
    setAwsSessionStatus,
    setAwsAccessKeyId,
    setAwsSecretAccessKey,
    setAwsSessionToken,
    setAwsRegion,
    setAwsBatchQueue,
    setAwsBatchJobDefinition,
    setAwsS3Bucket,
    setAwsS3Prefix,
    setAwsCloudWatchLogGroup,
  ]);

  const clearAwsRuntimeSession = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Could not clear AWS session");
      }
      setAwsSessionStatus({ configured: false });
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      setNotice("Hosted AWS session cleared.");
      await fetchSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not clear AWS session";
      toast.error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    setBusy,
    setError,
    setNotice,
    setAwsSessionStatus,
    setAwsAccessKeyId,
    setAwsSecretAccessKey,
    setAwsSessionToken,
  ]);

  const saveAwsRuntimeResources = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to save AWS resource settings.");
      }
      setAwsSessionStatus(body);
      setNotice(
        body.configured
          ? "Hosted AWS session is fully configured."
          : `Saved AWS settings. Missing: ${(body.missingFields ?? []).join(", ") || "none"}.`,
      );
      await fetchSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save AWS resource settings.";
      toast.error(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [
    fetchSession,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
    setBusy,
    setError,
    setNotice,
    setAwsSessionStatus,
  ]);

  const logoutSpotify = useCallback(async () => {
    await fetch("/api/auth/spotify/logout", { method: "POST" });
    clearSelection();
    setTracks([]);
    setTrackCacheById({});
    setJobs([]);
    setMatchSnapshots({});
    setLastMatchSummary(null);
    setTracksTotal(0);
    setTotalTracks(0);
    setVisibleStart(0);
    setVisibleEnd(0);
    setTotalPages(1);
    setPage(1);
    await fetchSession();
  }, [
    fetchSession,
    clearSelection,
    setTracks,
    setTrackCacheById,
    setJobs,
    setMatchSnapshots,
    setLastMatchSummary,
    setTracksTotal,
    setTotalTracks,
    setVisibleStart,
    setVisibleEnd,
    setTotalPages,
    setPage,
  ]);

  return {
    acknowledgeSpotdl,
    saveOsuRuntimeSession,
    clearOsuRuntimeSession,
    saveAwsRuntimeSession,
    loadAwsRuntimeSessionFromCli,
    autoLoadAwsRuntimeSession,
    clearAwsRuntimeSession,
    saveAwsRuntimeResources,
    logoutSpotify,
  };
}
