import { getSql } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getSql()`select 1`;
    return Response.json({ status: "ok", revision: process.env.APP_REVISION ?? "local" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
