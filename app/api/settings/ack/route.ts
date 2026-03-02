import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  const timestamp = new Date().toISOString();
  updateStore((store) => {
    store.settings.spotdlAcknowledgedAt = timestamp;
  });
  return NextResponse.json({ ok: true, acknowledgedAt: timestamp });
}
