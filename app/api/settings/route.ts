import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const store = readStore();
  return NextResponse.json({ settings: store.settings });
}
