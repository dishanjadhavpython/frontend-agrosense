import { NextResponse } from "next/server";

/**
 * Liveness for the load balancer and the container health check.
 *
 * Deliberately says nothing about the backend or the engine: a web task whose
 * upstream is briefly down is still a healthy web task, and failing it here
 * would have ECS replace a working container in a loop while the real fault
 * sat somewhere else. Each upstream has its own health check.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
