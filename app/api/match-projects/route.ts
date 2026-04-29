/**
 * POST /api/match-projects
 * Body: { jd: string }
 *
 * Returns the top 3 JD-matched projects from the indexed portfolio.
 * Exposed as a standalone endpoint for debugging / future UIs — the CV
 * generation flow calls matchProjects() directly instead of hitting HTTP.
 */

import { NextRequest, NextResponse } from "next/server";
import { matchProjects } from "@/lib/portfolio-matcher";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { jd } = (await req.json()) as { jd?: string };
    if (!jd || jd.trim().length < 20) {
      return NextResponse.json(
        { error: "Job description too short." },
        { status: 400 }
      );
    }

    const result = await matchProjects(jd);

    if (result.portfolioNotSynced) {
      return NextResponse.json(
        { error: "portfolio_not_synced" },
        { status: 400 }
      );
    }

    return NextResponse.json({ selected_projects: result.selected });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
