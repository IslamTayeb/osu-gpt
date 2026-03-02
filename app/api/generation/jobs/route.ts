import { NextRequest, NextResponse } from "next/server";
import { createGenerationJob } from "@/lib/jobs";
import { readStore } from "@/lib/store";
import {
  getAwsRuntimeSessionFromRequest,
  isAwsRuntimeSessionConfigured,
  missingAwsRuntimeSessionFields,
} from "@/lib/awsSession";
import { syncHostedAwsJobs } from "@/lib/awsRuntime";
import { sanitizeGeneratorParams, validateGeneratorParams } from "@/lib/generatorConfig";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const awsSession = getAwsRuntimeSessionFromRequest(request);
  if (awsSession && isAwsRuntimeSessionConfigured(awsSession)) {
    try {
      await syncHostedAwsJobs(awsSession);
    } catch {
      // Keep GET resilient when AWS is misconfigured/temporarily unavailable.
    }
  }
  const jobs = readStore().jobs;
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    trackId?: string;
    trackIds?: string[];
    runtime?: "local" | "hosted_aws";
    preset?: "quick" | "balanced" | "high_quality";
    budgetCapUsd?: number;
    timeoutSec?: number;
    generatorParams?: unknown;
  };

  const trackIds = Array.from(
    new Set(
      (Array.isArray(body.trackIds) ? body.trackIds : body.trackId ? [body.trackId] : [])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );

  if (trackIds.length === 0) {
    return NextResponse.json({ error: "trackId or trackIds[] is required" }, { status: 400 });
  }

  const tracks = readStore().tracks;
  const trackIdSet = new Set(tracks.map((track) => track.id));
  const missing = trackIds.filter((id) => !trackIdSet.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Track(s) not found: ${missing.join(", ")}` }, { status: 404 });
  }

  const runtime = body.runtime ?? "local";
  const preset = body.preset ?? "balanced";
  const budgetCapUsd = Number.isFinite(body.budgetCapUsd) ? Number(body.budgetCapUsd) : 50;
  const timeoutSec = Math.min(
    600,
    Math.max(300, Number.isFinite(body.timeoutSec) ? Number(body.timeoutSec) : 600),
  );
  const validationErrors = validateGeneratorParams(body.generatorParams);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Invalid generator params.",
        details: validationErrors,
      },
      { status: 400 },
    );
  }
  const generatorParams = sanitizeGeneratorParams(body.generatorParams);
  const awsSession = runtime === "hosted_aws" ? getAwsRuntimeSessionFromRequest(request) : null;

  if (runtime === "hosted_aws" && !awsSession) {
    return NextResponse.json(
      { error: "Hosted AWS runtime is selected but no AWS session is configured." },
      { status: 400 },
    );
  }
  if (runtime === "hosted_aws" && !isAwsRuntimeSessionConfigured(awsSession)) {
    return NextResponse.json(
      {
        error: "Hosted AWS runtime is incomplete. Fill missing AWS fields before queuing hosted jobs.",
        details: missingAwsRuntimeSessionFields(awsSession).map((field) => `missing AWS field: ${field}`),
      },
      { status: 400 },
    );
  }

  const jobs = trackIds.map((trackId) =>
    createGenerationJob({
      trackId,
      runtime,
      preset,
      budgetCapUsd,
      timeoutSec,
      generatorParams,
      awsSession,
    }),
  );

  if (body.trackId && !Array.isArray(body.trackIds) && jobs.length === 1) {
    return NextResponse.json({ job: jobs[0] }, { status: 201 });
  }

  return NextResponse.json({ jobs }, { status: 201 });
}
