import { NextRequest, NextResponse } from "next/server";
import { cancelJob, createGenerationJob } from "@/lib/jobs";
import { readJobLog } from "@/lib/jobLogs";
import { enqueueJobs } from "@/lib/runtime/queue";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = readStore().jobs.find((item) => item.id === id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ job, logs: readJobLog(id) });
}

/** Retry a job with the same settings. */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = readStore();
  const original = store.jobs.find((item) => item.id === id);
  if (!original) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const track = store.tracks.find((item) => item.id === original.trackId);
  if (!track) {
    return NextResponse.json({ error: "The track for this job is gone." }, { status: 409 });
  }

  const retried = createGenerationJob({
    track,
    generatorParams: original.generatorParams,
    modelVersion: original.modelVersion,
    runtime: original.runtime,
    timeoutSec: original.timeoutSec,
    experimentalCompile: original.experimentalCompile,
  });
  enqueueJobs([retried]);
  return NextResponse.json({ job: retried }, { status: 201 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = readStore().jobs.find((item) => item.id === id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  await cancelJob(job);
  return NextResponse.json({ ok: true });
}
