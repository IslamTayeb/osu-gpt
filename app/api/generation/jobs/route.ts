import { NextRequest, NextResponse } from "next/server";
import { createGenerationJob } from "@/lib/jobs";
import { enqueueJobs } from "@/lib/runtime/queue";
import { readStore, updateStore } from "@/lib/store";
import { validateParams } from "@/lib/generatorConfig";
import { GeneratorParams, ModelVersion, RuntimeType } from "@/lib/types";

export const runtime = "nodejs";

const MAX_LISTED_JOBS = 100;
const MIN_TIMEOUT_SEC = 300;
const MAX_TIMEOUT_SEC = 2700;

export async function GET() {
  const jobs = readStore().jobs.slice(0, MAX_LISTED_JOBS);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    trackId?: string;
    trackIds?: string[];
    allTracks?: boolean;
    runtime?: RuntimeType;
    modelVersion?: ModelVersion;
    experimentalCompile?: boolean;
    timeoutSec?: number;
    generatorParams?: GeneratorParams;
  };

  const store = readStore();
  const trackIds = body.allTracks
    ? store.tracks.map((track) => track.id)
    : Array.from(
        new Set(
          (Array.isArray(body.trackIds) ? body.trackIds : body.trackId ? [body.trackId] : [])
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      );

  if (trackIds.length === 0) {
    return NextResponse.json({ error: "Select at least one track." }, { status: 400 });
  }

  const known = new Map(store.tracks.map((track) => [track.id, track]));
  const missing = trackIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Track(s) not found: ${missing.slice(0, 5).join(", ")}` },
      { status: 404 },
    );
  }

  if (!store.settings.spotdlAcknowledgedAt) {
    return NextResponse.json(
      { error: "Acknowledge the audio download notice before generating." },
      { status: 400 },
    );
  }

  const generatorParams = body.generatorParams ?? {};
  const errors = validateParams(generatorParams);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), details: errors }, { status: 400 });
  }

  const runtimeId: RuntimeType = body.runtime ?? store.settings.runtime;
  const modelVersion: ModelVersion = body.modelVersion ?? store.settings.modelVersion;
  const timeoutSec = Math.min(
    MAX_TIMEOUT_SEC,
    Math.max(MIN_TIMEOUT_SEC, Number(body.timeoutSec) || 1200),
  );

  const jobs = trackIds.map((trackId) =>
    createGenerationJob({
      track: known.get(trackId)!,
      generatorParams,
      modelVersion,
      runtime: runtimeId,
      timeoutSec,
      experimentalCompile: body.experimentalCompile ?? store.settings.experimentalCompile,
    }),
  );

  // Remember what was used so the form comes back the same way next time.
  updateStore((next) => {
    next.settings.generationDefaults = generatorParams;
    next.settings.runtime = runtimeId;
    next.settings.modelVersion = modelVersion;
  });

  enqueueJobs(jobs);
  return NextResponse.json({ jobs }, { status: 201 });
}

/** Clear finished history; in-flight jobs are left alone. */
export async function DELETE() {
  updateStore((store) => {
    store.jobs = store.jobs.filter(
      (job) => job.status === "queued" || job.status === "running",
    );
  });
  return NextResponse.json({ ok: true });
}
