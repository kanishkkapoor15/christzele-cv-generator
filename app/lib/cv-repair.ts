/**
 * LLM-based CV repair pass — guarantees essential keywords without local
 * mutation gibberish.
 *
 * When the local verifier reports missing essentials after the first-pass
 * generation, this module fires a focused LLM call that rewrites the CV to
 * weave in the missing terms naturally. Critically, this call is designed to
 * run IN PARALLEL with the cover letter generation, so when both are needed
 * the repair is effectively free time-wise.
 *
 * Why LLM and not local? Local distribution would just append keywords to
 * Skills under fuzzy-matched categories — which puts "Murex" next to "Docker"
 * because both got matched to "Tools & Platforms". Only an LLM with full
 * context can decide whether a keyword belongs in Skills, in a bullet, or in
 * a project description.
 *
 * Why not just regenerate? The repair prompt is ~10× shorter than full CV
 * generation (no master profile, no JD analysis, just current CV + missing
 * keywords) so reasoning overhead is significantly lower.
 */

import { callTensorix, extractJSON } from "./tensorix";
import { CVData } from "./types";

const REPAIR_SYSTEM_PROMPT = `You are a CV editor. The CV below is missing some essential keywords that MUST appear in the final document.

Your job: weave each missing keyword into the CV naturally using its EXACT spelling and casing. Do not fabricate experience — only reframe what is already there.

PLACEMENT PRIORITY:
1. SKILLS section — most appropriate existing category (create new category only if nothing fits)
2. EXPERIENCE BULLETS — rewrite a relevant bullet as action-verb + outcome
3. KEY ACHIEVEMENTS — if the keyword fits an achievement description
4. SUMMARY — only for the 1–2 most JD-critical keywords

HARD RULES:
- Do NOT create "Core Competencies", "Keywords", "ATS Keywords", or any catch-all section.
- Skills: ≤ 6 categories, ≤ 7 items each.
- ALL 6 experience roles MUST remain — do not drop or merge any.
- Minimum bullets per role MUST be preserved: Jollibee ≥5, Mini Mart ≥3, Amazon ≥3, Appco ≥2, Accenture ≥2, Convergys ≥2.
- Total experience bullets ≥ 17 — if the incoming CV has fewer, ADD bullets (draw from the rich Jollibee duties in the master profile).
- Page budget: two A4 pages maximum — do not condense into one page.
- Preserve tone, structure, and quality. Only change what is needed.
- If a keyword cannot fit naturally, place it in the most relevant Skills category.

OUTPUT: Return the COMPLETE updated CV as raw JSON in the same schema. No preamble, no markdown, no commentary.`;

/**
 * Fire an LLM repair pass to incorporate missing essential keywords into a CV.
 * Returns the original CV unchanged if the repair call fails — the caller can
 * still serve the first-pass result with a coverage warning.
 */
export async function repairCV(
  currentCV: CVData,
  missingKeywords: string[],
  jobDescription: string
): Promise<CVData> {
  if (missingKeywords.length === 0) return currentCV;

  const userPrompt = `JOB DESCRIPTION (for context only — do not pad with unrelated content):
${jobDescription}

CURRENT CV:
${JSON.stringify(currentCV, null, 2)}

MISSING ESSENTIAL KEYWORDS — each MUST appear verbatim in the output CV:
${missingKeywords.map((k) => `- ${k}`).join("\n")}

Return the complete revised CV JSON now. Raw JSON only.`;

  try {
    const raw = await callTensorix({
      messages: [
        { role: "system", content: REPAIR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.25, // Lower than first-pass — repair is mechanical, not creative
      // Two-page CV is larger than single-page. 6000 gives comfortable headroom
      // for all 6 experience roles + skills + achievements without truncation.
      maxTokens: 6000,
      responseFormat: "json_object",
    });

    const repaired = extractJSON<CVData>(raw);

    // Sanity guard: if the repair returned a malformed shell with no content,
    // fall back to the original CV rather than serving garbage.
    if (
      !repaired?.summary ||
      !Array.isArray(repaired.skills) ||
      !Array.isArray(repaired.experience) ||
      repaired.skills.length === 0 ||
      repaired.experience.length === 0
    ) {
      console.warn("Repair returned malformed CV — keeping original");
      return currentCV;
    }

    return repaired;
  } catch (e) {
    console.error("CV repair failed — keeping original:", e);
    return currentCV;
  }
}
