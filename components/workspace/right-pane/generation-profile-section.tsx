import Link from "next/link";
import {
  Calendar,
  Circle,
  Crosshair,
  Eye,
  Heart,
  Sparkles,
  Tags,
  Target,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { descriptorOptions } from "@/lib/homeUi";
import { AwsRuntimeSection } from "./aws-runtime-section";
import { GenerationAdvancedControls } from "./generation-advanced-controls";
import type { GenerationProfileSectionProps } from "./types";

function selectedMultiValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
}

export function GenerationProfileSection({
  runtime,
  onRuntimeChange,
  preset,
  onPresetChange,
  stylePresetId,
  stylePresetOptions,
  selectedStylePresetDescription,
  onApplyStylePreset,
  mapperChoiceId,
  mapperStylePresets,
  selectedMapperOptionDescription,
  onApplyMapperChoice,
  onUpdateCustomMapperId,
  generatorParams,
  onUpdateGeneratorParam,
  timeoutSec,
  onTimeoutSecChange,
  budgetCapUsd,
  onBudgetCapUsdChange,
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
  approvedSelectedCount,
  generatableSelectedCount,
  selectedTrackCount,
  onGenerateSelected,
  onGenerateAllSelected,
}: GenerationProfileSectionProps) {
  return (
    <div className="section-block">
      <span className="section-label">Generation profile</span>
      <Select
        value={runtime}
        onChange={(event) => onRuntimeChange(event.target.value as "local" | "hosted_aws")}
      >
        <option value="local">Local runtime</option>
        <option value="hosted_aws">Hosted AWS runtime</option>
      </Select>
      <Select
        value={preset}
        onChange={(event) => onPresetChange(event.target.value as "quick" | "balanced" | "high_quality")}
      >
        <option value="quick">Quick</option>
        <option value="balanced">Balanced</option>
        <option value="high_quality">High Quality</option>
      </Select>
      <span className="tiny muted">Style preset (combined archetypes + mapper-inspired examples)</span>
      <Select value={stylePresetId} onChange={(event) => onApplyStylePreset(event.target.value)}>
        {stylePresetOptions.map((presetOption) => (
          <option key={presetOption.id} value={presetOption.id}>
            {presetOption.label}
          </option>
        ))}
      </Select>
      {selectedStylePresetDescription ? <p className="tiny muted">{selectedStylePresetDescription}</p> : null}
      <span className="tiny muted">Mapper lock (optional)</span>
      <Select value={mapperChoiceId} onChange={(event) => onApplyMapperChoice(event.target.value)}>
        <option value="none">No mapper lock</option>
        {mapperStylePresets.map((mapperOption) => (
          <option key={mapperOption.id} value={mapperOption.id}>
            {mapperOption.label} ({mapperOption.mapperId})
          </option>
        ))}
        <option value="other">Other (custom mapper ID)</option>
      </Select>
      {selectedMapperOptionDescription ? (
        <p className="tiny muted">{selectedMapperOptionDescription}</p>
      ) : null}
      {mapperChoiceId === "other" ? (
        <Input
          type="number"
          placeholder="Custom mapper ID"
          value={generatorParams.mapperId ?? ""}
          onChange={(event) => onUpdateCustomMapperId(event.target.value)}
        />
      ) : null}

      <p className="tiny muted">
        Style preset applies descriptors plus optional AR/OD/CS/SR defaults. Mapper lock is independent and
        optional.
      </p>

      <div className="divider" />

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Target size={12} />
          Star difficulty target (SR, required). Typical: 4.8 - 6.2
        </span>
        <Input
          type="number"
          step={0.1}
          min={0}
          max={12}
          value={generatorParams.difficulty ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam(
              "difficulty",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Calendar size={12} />
          Style year (optional). Typical modern mapping: 2018 - current year.
        </span>
        <Input
          type="number"
          min={2007}
          max={new Date().getUTCFullYear()}
          value={generatorParams.year ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam("year", event.target.value === "" ? null : Number(event.target.value))
          }
        />
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Tags size={12} />
          Descriptors (multi-select, optional)
        </span>
        <Select
          multiple
          size={8}
          value={generatorParams.descriptors ?? []}
          onChange={(event) => onUpdateGeneratorParam("descriptors", selectedMultiValues(event))}
        >
          {descriptorOptions.map((descriptor) => (
            <option key={descriptor} value={descriptor}>
              {descriptor}
            </option>
          ))}
        </Select>
        <p className="tiny muted">Hold Cmd/Ctrl to select multiple styles.</p>
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Eye size={12} />
          AR (Approach Rate, optional). Typical: 9.0 - 10.3 for higher-diff standard maps.
        </span>
        <Input
          type="number"
          step={0.1}
          min={0}
          max={11}
          value={generatorParams.approachRate ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam(
              "approachRate",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Crosshair size={12} />
          OD (Overall Difficulty, optional). Typical: 7.5 - 10.
        </span>
        <Input
          type="number"
          step={0.1}
          min={0}
          max={11}
          value={generatorParams.overallDifficulty ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam(
              "overallDifficulty",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Circle size={12} />
          CS (Circle Size, optional). Typical standard: 3.8 - 4.2
        </span>
        <Input
          type="number"
          step={0.1}
          min={2}
          max={7}
          value={generatorParams.circleSize ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam(
              "circleSize",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>

      <div className="section-block generator-control">
        <span className="tiny muted generator-label">
          <Heart size={12} />
          HP (drain, optional). Typical: 4 - 7
        </span>
        <Input
          type="number"
          step={0.1}
          min={0}
          max={10}
          value={generatorParams.hpDrainRate ?? ""}
          onChange={(event) =>
            onUpdateGeneratorParam(
              "hpDrainRate",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>

      <div className="divider" />

      <div className="row-wrap generator-toggle-row">
        <label className="tiny muted row-wrap">
          <Checkbox
            checked={Boolean(generatorParams.superTiming)}
            onChange={(event) => onUpdateGeneratorParam("superTiming", event.target.checked)}
          />
          Super timing (slower, more precise BPM handling)
        </label>
        <label className="tiny muted row-wrap">
          <Checkbox
            checked={Boolean(generatorParams.generatePositions)}
            onChange={(event) => onUpdateGeneratorParam("generatePositions", event.target.checked)}
          />
          Diffusion positions
        </label>
        <label className="tiny muted row-wrap">
          <Checkbox
            checked={Boolean(generatorParams.hitsounded)}
            onChange={(event) => onUpdateGeneratorParam("hitsounded", event.target.checked)}
          />
          Hitsounded output
        </label>
      </div>

      <GenerationAdvancedControls
        generatorParams={generatorParams}
        onUpdateGeneratorParam={onUpdateGeneratorParam}
      />

      <div className="divider" />

      <span className="tiny muted">Job timeout (seconds)</span>
      <Input
        type="number"
        min={300}
        max={1200}
        value={timeoutSec}
        onChange={(event) => onTimeoutSecChange(Number(event.target.value || 600))}
      />
      <span className="tiny muted">Budget cap (USD)</span>
      <Input
        type="number"
        min={1}
        step={1}
        value={budgetCapUsd}
        onChange={(event) => onBudgetCapUsdChange(Number(event.target.value || 50))}
      />

      {runtime === "hosted_aws" ? (
        <AwsRuntimeSection
          awsSessionStatus={awsSessionStatus}
          awsProfile={awsProfile}
          onAwsProfileChange={onAwsProfileChange}
          awsRegion={awsRegion}
          onAwsRegionChange={onAwsRegionChange}
          awsBatchQueue={awsBatchQueue}
          onAwsBatchQueueChange={onAwsBatchQueueChange}
          awsBatchJobDefinition={awsBatchJobDefinition}
          onAwsBatchJobDefinitionChange={onAwsBatchJobDefinitionChange}
          awsS3Bucket={awsS3Bucket}
          onAwsS3BucketChange={onAwsS3BucketChange}
          awsS3Prefix={awsS3Prefix}
          onAwsS3PrefixChange={onAwsS3PrefixChange}
          awsCloudWatchLogGroup={awsCloudWatchLogGroup}
          onAwsCloudWatchLogGroupChange={onAwsCloudWatchLogGroupChange}
          awsAccessKeyId={awsAccessKeyId}
          onAwsAccessKeyIdChange={onAwsAccessKeyIdChange}
          awsSecretAccessKey={awsSecretAccessKey}
          onAwsSecretAccessKeyChange={onAwsSecretAccessKeyChange}
          awsSessionToken={awsSessionToken}
          onAwsSessionTokenChange={onAwsSessionTokenChange}
          onAutoLoadAwsRuntimeSession={onAutoLoadAwsRuntimeSession}
          onLoadAwsRuntimeSessionFromCli={onLoadAwsRuntimeSessionFromCli}
          onClearAwsRuntimeSession={onClearAwsRuntimeSession}
          onSaveAwsRuntimeResources={onSaveAwsRuntimeResources}
          onSaveAwsRuntimeSession={onSaveAwsRuntimeSession}
          busy={busy}
        />
      ) : null}

      <div className="divider" />

      <details className="inline-help">
        <summary className="tiny muted">How to get required API keys (osu + AWS)</summary>
        <div className="list tiny muted">
          <p>
            osu: create an OAuth application at{" "}
            <Link
              href="https://osu.ppy.sh/home/account/edit#new-oauth-application"
              target="_blank"
              rel="noreferrer"
            >
              osu account settings
            </Link>{" "}
            and add client id/secret to env.
          </p>
          <p>
            AWS: easiest path is AWS CLI SSO via <code>aws configure sso</code> and then{" "}
            <code>Load from AWS CLI</code>. Manual IAM access keys are only needed for advanced/manual mode.
            Prefer <code>Auto-load AWS</code> first.
          </p>
        </div>
      </details>

      <p className="tiny muted">
        {approvedSelectedCount > 0
          ? `Approved matched previews: ${approvedSelectedCount}.`
          : "Approve matched previews to skip generation for those tracks."}
      </p>

      <div className="divider" />

      <div className="row-wrap">
        <Button onClick={() => void onGenerateSelected()} disabled={busy || generatableSelectedCount === 0}>
          <Sparkles size={14} />
          Generate selected ({generatableSelectedCount})
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onGenerateAllSelected()}
          disabled={busy || selectedTrackCount === 0}
        >
          Force all selected ({selectedTrackCount})
        </Button>
      </div>
    </div>
  );
}
