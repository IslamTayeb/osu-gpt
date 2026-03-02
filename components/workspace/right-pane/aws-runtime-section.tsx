import { Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HostedAwsSessionStatus } from "@/lib/homeTypes";

type AwsRuntimeSectionProps = {
  awsSessionStatus: HostedAwsSessionStatus;
  awsProfile: string;
  onAwsProfileChange: (value: string) => void;
  awsRegion: string;
  onAwsRegionChange: (value: string) => void;
  awsBatchQueue: string;
  onAwsBatchQueueChange: (value: string) => void;
  awsBatchJobDefinition: string;
  onAwsBatchJobDefinitionChange: (value: string) => void;
  awsS3Bucket: string;
  onAwsS3BucketChange: (value: string) => void;
  awsS3Prefix: string;
  onAwsS3PrefixChange: (value: string) => void;
  awsCloudWatchLogGroup: string;
  onAwsCloudWatchLogGroupChange: (value: string) => void;
  awsAccessKeyId: string;
  onAwsAccessKeyIdChange: (value: string) => void;
  awsSecretAccessKey: string;
  onAwsSecretAccessKeyChange: (value: string) => void;
  awsSessionToken: string;
  onAwsSessionTokenChange: (value: string) => void;
  onAutoLoadAwsRuntimeSession: () => Promise<void>;
  onLoadAwsRuntimeSessionFromCli: () => Promise<void>;
  onClearAwsRuntimeSession: () => Promise<void>;
  onSaveAwsRuntimeResources: () => Promise<void>;
  onSaveAwsRuntimeSession: () => Promise<void>;
  busy: boolean;
};

export function AwsRuntimeSection({
  awsSessionStatus,
  awsProfile,
  onAwsProfileChange,
  awsRegion,
  onAwsRegionChange,
  awsBatchQueue,
  onAwsBatchQueueChange,
  awsBatchJobDefinition,
  onAwsBatchJobDefinitionChange,
  awsS3Bucket,
  onAwsS3BucketChange,
  awsS3Prefix,
  onAwsS3PrefixChange,
  awsCloudWatchLogGroup,
  onAwsCloudWatchLogGroupChange,
  awsAccessKeyId,
  onAwsAccessKeyIdChange,
  awsSecretAccessKey,
  onAwsSecretAccessKeyChange,
  awsSessionToken,
  onAwsSessionTokenChange,
  onAutoLoadAwsRuntimeSession,
  onLoadAwsRuntimeSessionFromCli,
  onClearAwsRuntimeSession,
  onSaveAwsRuntimeResources,
  onSaveAwsRuntimeSession,
  busy,
}: AwsRuntimeSectionProps) {
  return (
    <div className="section-block hosted-runtime-block">
      <div className="row">
        <span className="section-label">Hosted AWS Session</span>
        <Badge variant={awsSessionStatus.configured ? "success" : "warning"}>
          {awsSessionStatus.configured ? "Configured" : "Not configured"}
        </Badge>
      </div>
      <p className="tiny muted">
        Quick setup: run <code>aws configure sso</code> once, then{" "}
        <code>aws sso login --profile {awsProfile.trim() || "default"}</code>, then click one-click setup.
      </p>
      <div className="row-wrap">
        <Input
          placeholder="AWS CLI profile (default)"
          value={awsProfile}
          onChange={(event) => onAwsProfileChange(event.target.value)}
        />
        <Button variant="secondary" onClick={() => void onAutoLoadAwsRuntimeSession()} disabled={busy}>
          One-click AWS Setup (recommended)
        </Button>
        <Button variant="secondary" onClick={() => void onLoadAwsRuntimeSessionFromCli()} disabled={busy}>
          Load from AWS CLI
        </Button>
        <Button variant="ghost" onClick={() => void onClearAwsRuntimeSession()} disabled={busy}>
          Clear AWS Session
        </Button>
        <Button variant="secondary" onClick={() => void onSaveAwsRuntimeResources()} disabled={busy}>
          Save AWS Resources
        </Button>
      </div>
      <p className="tiny muted">
        Auto-load resolves credentials from AWS SDK chain (env vars, shared config/profile, SSO cache, or
        instance role), builds/pushes a worker image if needed, discovers queue/job definition/S3 bucket, and
        creates missing resources.
      </p>
      <Input
        placeholder="Region (e.g. us-east-1)"
        value={awsRegion}
        onChange={(event) => onAwsRegionChange(event.target.value)}
      />
      <Input
        placeholder="Batch Queue ARN or name"
        value={awsBatchQueue}
        onChange={(event) => onAwsBatchQueueChange(event.target.value)}
      />
      <Input
        placeholder="Batch Job Definition ARN or name"
        value={awsBatchJobDefinition}
        onChange={(event) => onAwsBatchJobDefinitionChange(event.target.value)}
      />
      <Input
        placeholder="S3 Bucket"
        value={awsS3Bucket}
        onChange={(event) => onAwsS3BucketChange(event.target.value)}
      />
      <Input
        placeholder="S3 Prefix"
        value={awsS3Prefix}
        onChange={(event) => onAwsS3PrefixChange(event.target.value)}
      />
      <Input
        placeholder="CloudWatch Log Group"
        value={awsCloudWatchLogGroup}
        onChange={(event) => onAwsCloudWatchLogGroupChange(event.target.value)}
      />
      {awsSessionStatus.accessKeyIdHint ? (
        <p className="tiny muted">Active key: {awsSessionStatus.accessKeyIdHint}</p>
      ) : null}
      {awsSessionStatus.profile ? (
        <p className="tiny muted">Loaded profile: {awsSessionStatus.profile}</p>
      ) : null}
      {awsSessionStatus.missingFields && awsSessionStatus.missingFields.length > 0 ? (
        <p className="warn-text">Missing fields: {awsSessionStatus.missingFields.join(", ")}</p>
      ) : null}
      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Cpu size={12} />
          Hosted inference GPU
        </span>
        {awsSessionStatus.gpuHint ? (
          <p className="tiny muted">Detected queue instance/GPU: {awsSessionStatus.gpuHint}</p>
        ) : (
          <p className="tiny muted">
            GPU model comes from your AWS Batch compute environment instance types for the selected queue.
          </p>
        )}
        {awsSessionStatus.gpuCountPerJob ? (
          <p className="tiny muted">Job definition GPU count: {awsSessionStatus.gpuCountPerJob}</p>
        ) : null}
        <p className="tiny muted">
          Typical picks: `g6.xlarge` (L4) for cost/perf, `g6e.xlarge` (L40S) for more VRAM/throughput, `p5`
          for high-throughput premium.
        </p>
      </div>
      <details className="inline-help">
        <summary className="tiny muted">Fallbacks and manual entry</summary>
        <div className="list">
          <p className="tiny muted">
            If auto-load fails, try `Load from AWS CLI` (uses `aws configure export-credentials`) or enter IAM
            credentials manually.
          </p>
          <Input
            placeholder="AWS Access Key ID"
            value={awsAccessKeyId}
            onChange={(event) => onAwsAccessKeyIdChange(event.target.value)}
          />
          <Input
            placeholder="AWS Secret Access Key"
            type="password"
            value={awsSecretAccessKey}
            onChange={(event) => onAwsSecretAccessKeyChange(event.target.value)}
          />
          <Input
            placeholder="AWS Session Token (optional)"
            type="password"
            value={awsSessionToken}
            onChange={(event) => onAwsSessionTokenChange(event.target.value)}
          />
          <div className="row-wrap">
            <Button variant="secondary" onClick={() => void onSaveAwsRuntimeSession()} disabled={busy}>
              Save AWS Session
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
