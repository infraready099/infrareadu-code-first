/**
 * GET /api/templates
 *
 * Returns all available app templates from the InfraReady registry.
 * Public endpoint — no authentication required.
 * Used by the "Deploy a Template" wizard step and the marketplace page.
 */

import { NextResponse } from "next/server";
import { APP_TEMPLATES } from "@/lib/app-templates";

// Cache for 1 hour — templates only change on deploy, not per-request.
// The revalidate export tells Next.js to regenerate at most once per hour.
export const revalidate = 3600;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      templates: APP_TEMPLATES,
      count: APP_TEMPLATES.length,
    },
    {
      status: 200,
      headers: {
        // Public CDN caching — safe because templates have no user-specific data.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    }
  );
}
