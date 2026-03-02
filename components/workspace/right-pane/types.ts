import type { MapperStylePreset } from "@/lib/generatorConfig";
import type { HostedAwsSessionStatus } from "@/lib/homeTypes";
import type { GeneratorParams } from "@/lib/types";

export type UpdateGeneratorParam = <K extends keyof GeneratorParams>(
  key: K,
  value: GeneratorParams[K],
) => void;

export type StylePresetOption = {
  id: string;
  label: string;
  description: string;
  descriptors: string[];
  defaults: Partial<GeneratorParams>;
};

export type GenerationProfileSectionProps = {
  runtime: "local" | "hosted_aws";
  onRuntimeChange: (runtime: "local" | "hosted_aws") => void;
  preset: "quick" | "balanced" | "high_quality";
  onPresetChange: (preset: "quick" | "balanced" | "high_quality") => void;
  stylePresetId: string;
  stylePresetOptions: StylePresetOption[];
  selectedStylePresetDescription: string;
  onApplyStylePreset: (id: string) => void;
  mapperChoiceId: string;
  mapperStylePresets: MapperStylePreset[];
  selectedMapperOptionDescription: string;
  onApplyMapperChoice: (id: string) => void;
  onUpdateCustomMapperId: (value: string) => void;
  generatorParams: GeneratorParams;
  onUpdateGeneratorParam: UpdateGeneratorParam;
  timeoutSec: number;
  onTimeoutSecChange: (value: number) => void;
  budgetCapUsd: number;
  onBudgetCapUsdChange: (value: number) => void;
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
  approvedSelectedCount: number;
  generatableSelectedCount: number;
  selectedTrackCount: number;
  onGenerateSelected: () => Promise<void>;
  onGenerateAllSelected: () => Promise<void>;
};
