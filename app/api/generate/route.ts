import { NextRequest, NextResponse } from "next/server";
import { callTensorix, extractJSON } from "@/app/lib/tensorix";
import {
  CV_SYSTEM_PROMPT,
  COVER_LETTER_SYSTEM_PROMPT,
  ROLE_DETECTION_SYSTEM_PROMPT,
  buildCVUserPrompt,
  buildCoverLetterUserPrompt,
} from "@/app/lib/prompts";
import {
  CVData,
  GenerateRequest,
  GenerateResponse,
  ROLE_TYPES,
  RoleType,
} from "@/app/lib/types";
import {
  matchProjects,
  formatPortfolioBlock,
} from "@/lib/portfolio-matcher";
import {
  analyzeJD,
  formatKeywordBlock,
  verifyCoverage,
} from "@/app/lib/jd-analyzer";
import { repairCV } from "@/app/lib/cv-repair";

export const runtime = "nodejs";
// deepseek-r1 reasoning phase can run 60–200 s on a complex JD. With the new
// parallel pipeline (CV + cover letter fire simultaneously, repair runs
// alongside cover letter), worst-case wall time stays close to a single CV
// generation. 300 s buffer covers the platform-level timeout.
export const maxDuration = 300;

async function detectRole(jd: string): Promise<RoleType | undefined> {
  try {
    const raw = await callTensorix({
      messages: [
        { role: "system", content: ROLE_DETECTION_SYSTEM_PROMPT },
        { role: "user", content: jd },
      ],
      temperature: 0.1,
      maxTokens: 30,
    });
    const cleaned = raw.trim().replace(/^["']|["']$/g, "");
    const match = ROLE_TYPES.find(
      (r) => r.toLowerCase() === cleaned.toLowerCase()
    );
    return match;
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover letter generation — broken out so it can be fired in parallel with CV
// ─────────────────────────────────────────────────────────────────────────────

interface CoverLetterResult {
  text?: string;
  warning?: string;
}

async function generateCoverLetter(
  jobDescription: string,
  roleType: RoleType,
  extraContext: string | undefined
): Promise<CoverLetterResult> {
  try {
    const raw = await callTensorix({
      messages: [
        { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildCoverLetterUserPrompt({
            jobDescription,
            roleType,
            extraContext,
          }),
        },
      ],
      temperature: 0.6,
      // deepseek-r1 burns a lot of its budget on silent reasoning tokens
      // before emitting any output — 4000 gives reasoning room + the letter.
      maxTokens: 4000,
    });
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return {
        warning:
          "Cover letter came back empty — the reasoning model likely ran out of token budget. Try again.",
      };
    }
    return { text: trimmed };
  } catch (e) {
    console.error("Cover letter generation failed:", e);
    return {
      warning:
        e instanceof Error
          ? `Cover letter generation failed: ${e.message}`
          : "Cover letter generation failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTE
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateRequest;
    const {
      jobDescription,
      roleType,
      includeCoverLetter,
      allRelevantProjects,
      extraContext,
    } = body;

    if (!jobDescription || jobDescription.trim().length < 20) {
      return NextResponse.json(
        { error: "Please paste a longer job description." },
        { status: 400 }
      );
    }

    // ── Local prep (instant, zero API calls) ───────────────────────
    const analysis = analyzeJD(jobDescription, roleType);
    const keywordBlock = formatKeywordBlock(analysis);

    // GitHub Portfolio Intelligence — local keyword overlap, no API call.
    let portfolioBlock: string | undefined;
    try {
      const match = await matchProjects(jobDescription);
      portfolioBlock = formatPortfolioBlock(match.selected);
    } catch (e) {
      console.error(
        "Portfolio matching failed; falling back to default profile:",
        e
      );
    }

    // ── PARALLEL STAGE 1 ──────────────────────────────────────────
    // CV generation and cover letter generation are independent (both only
    // need the JD + profile), so we fire them simultaneously. When the user
    // requests a cover letter, this halves perceived wall time vs. the old
    // sequential flow.
    const cvPromise = callTensorix({
      messages: [
        { role: "system", content: CV_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildCVUserPrompt({
            jobDescription,
            roleType,
            allRelevantProjects,
            extraContext,
            keywordBlock,
            portfolioBlock,
          }),
        },
      ],
      temperature: 0.35,
      maxTokens: 5500,
      responseFormat: "json_object",
    });

    const coverLetterPromise: Promise<CoverLetterResult> = includeCoverLetter
      ? generateCoverLetter(jobDescription, roleType, extraContext)
      : Promise.resolve({});

    // Wait for the CV to land — repair (if needed) depends on it
    const cvRaw = await cvPromise;

    let cv: CVData;
    try {
      cv = extractJSON<CVData>(cvRaw);
    } catch (e) {
      console.error("Failed to parse CV JSON:", cvRaw);
      // Cover letter promise is still running — let it complete to avoid
      // dangling fetch handles, but we won't use the result.
      coverLetterPromise.catch(() => undefined);
      return NextResponse.json(
        {
          error:
            "The AI returned a response that could not be parsed as JSON. Try again.",
        },
        { status: 502 }
      );
    }

    // Local coverage check — instant
    const initialCoverage = verifyCoverage(cv, analysis);

    // ── PARALLEL STAGE 2 ──────────────────────────────────────────
    // If essentials are missing, fire an LLM-based repair pass. It runs
    // alongside the still-pending cover letter generation, so when both are
    // needed the repair adds ~zero wall time. Cover-letter-only requests pay
    // no repair cost; repair-only requests pay the repair cost serially after
    // the (already-resolved) empty cover-letter promise.
    const needsRepair = initialCoverage.essential.missing.length > 0;
    const repairPromise: Promise<CVData> = needsRepair
      ? repairCV(cv, initialCoverage.essential.missing, jobDescription)
      : Promise.resolve(cv);

    const [repairedCv, coverLetterResult] = await Promise.all([
      repairPromise,
      coverLetterPromise,
    ]);

    cv = repairedCv;

    // Recompute coverage post-repair so the report reflects the final document
    const finalCoverage = verifyCoverage(cv, analysis);

    if (needsRepair) {
      const stillMissing = finalCoverage.essential.missing;
      console.log(
        `Repair pass: ${initialCoverage.essential.missing.length} missing → ${stillMissing.length} missing after LLM repair.`
      );
      if (stillMissing.length > 0) {
        console.warn("Still-missing essentials after repair:", stillMissing);
      }
    }

    const response: GenerateResponse = {
      cv,
      coverLetter: coverLetterResult.text,
      coverLetterWarning: coverLetterResult.warning,
      keywordCoverage: finalCoverage,
    };
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    console.error("Generation failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Lightweight role detection endpoint (called as user pastes JD)
export async function PUT(req: NextRequest) {
  try {
    const { jobDescription } = (await req.json()) as { jobDescription: string };
    if (!jobDescription || jobDescription.trim().length < 30) {
      return NextResponse.json({ role: null });
    }
    const role = await detectRole(jobDescription);
    return NextResponse.json({ role: role ?? null });
  } catch (error) {
    return NextResponse.json({ role: null });
  }
}
