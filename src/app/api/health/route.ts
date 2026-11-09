import { NextResponse } from "next/server";

// Liveness endpoint: intentionally independent from Neon, Blob and other services.
export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "netti",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
