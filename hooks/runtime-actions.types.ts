import type { Dispatch, SetStateAction } from "react";
import type { BatchMatchResponse, HostedAwsSessionStatus, OsuSessionStatus } from "@/lib/homeTypes";
import type { GenerationJob, Track, TrackMatchSnapshot } from "@/lib/types";

type RuntimeActionSetters = {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setSpotdlAckAt: Dispatch<SetStateAction<string | null>>;
  setOsuSessionStatus: Dispatch<SetStateAction<OsuSessionStatus>>;
  setOsuClientId: Dispatch<SetStateAction<string>>;
  setOsuClientSecret: Dispatch<SetStateAction<string>>;
  setAwsSessionStatus: Dispatch<SetStateAction<HostedAwsSessionStatus>>;
  setAwsAccessKeyId: Dispatch<SetStateAction<string>>;
  setAwsSecretAccessKey: Dispatch<SetStateAction<string>>;
  setAwsSessionToken: Dispatch<SetStateAction<string>>;
  setAwsRegion: Dispatch<SetStateAction<string>>;
  setAwsBatchQueue: Dispatch<SetStateAction<string>>;
  setAwsBatchJobDefinition: Dispatch<SetStateAction<string>>;
  setAwsS3Bucket: Dispatch<SetStateAction<string>>;
  setAwsS3Prefix: Dispatch<SetStateAction<string>>;
  setAwsCloudWatchLogGroup: Dispatch<SetStateAction<string>>;
  setTracks: Dispatch<SetStateAction<Track[]>>;
  setTrackCacheById: Dispatch<SetStateAction<Record<string, Track>>>;
  setJobs: Dispatch<SetStateAction<GenerationJob[]>>;
  setMatchSnapshots: Dispatch<SetStateAction<Record<string, TrackMatchSnapshot>>>;
  setLastMatchSummary: Dispatch<SetStateAction<BatchMatchResponse["summary"] | null>>;
  setTracksTotal: Dispatch<SetStateAction<number>>;
  setTotalTracks: Dispatch<SetStateAction<number>>;
  setVisibleStart: Dispatch<SetStateAction<number>>;
  setVisibleEnd: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setPage: Dispatch<SetStateAction<number>>;
};

type RuntimeActionValues = {
  osuClientId: string;
  osuClientSecret: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  awsProfile: string;
  awsRegion: string;
  awsBatchQueue: string;
  awsBatchJobDefinition: string;
  awsS3Bucket: string;
  awsS3Prefix: string;
  awsCloudWatchLogGroup: string;
};

export type UseRuntimeActionsParams = RuntimeActionSetters &
  RuntimeActionValues & {
    fetchSession: () => Promise<void>;
    clearSelection: () => void;
  };

export type UseRuntimeActionsResult = {
  acknowledgeSpotdl: () => Promise<void>;
  saveOsuRuntimeSession: () => Promise<void>;
  clearOsuRuntimeSession: () => Promise<void>;
  saveAwsRuntimeSession: () => Promise<void>;
  loadAwsRuntimeSessionFromCli: () => Promise<void>;
  autoLoadAwsRuntimeSession: () => Promise<void>;
  clearAwsRuntimeSession: () => Promise<void>;
  saveAwsRuntimeResources: () => Promise<void>;
  logoutSpotify: () => Promise<void>;
};
