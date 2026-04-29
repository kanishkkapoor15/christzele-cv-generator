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

const REPAIR_SYSTEM_PROMPT = `You are a CV editor. The CV below is missing some essential keywords from the job description that MUST appear in the final document.

Your job: weave the missing keywords into the CV naturally. Use them in the EXACT spelling and casing provided. Do not fabricate experience — only reframe what's already there.

PLACEMENT PRIORITY (in this order):
1. SKILLS section — primary home for technical keywords. Add to the most appropriate existing category. Create a new category ONLY if no existing one fits.
2. EXPERIENCE BULLETS — rewrite a relevant bullet to include the keyword as part of an action-verb + outcome statement.
3. PROJECT DESCRIPTIONS — work the keyword into a project description if relevant.
4. SUMMARY — only the most JD-critical 1-2 keywords if they belong there.

HARD RULES:
- Do NOT create a "Core Competencies", "Keywords", "Technologies", "ATS Keywords", or any catch-all section.
- Skills section: ≤ 5 categories, ≤ 7 items per category.
- Experience: ≤ 3 bullets per role, ≤ 22 words per bullet.
- Page budget: total content must fit one A4 page.
- Preserve the existing CV's tone, structure, and quality. Only modify what's needed to incorporate the missing keywords.
- If a keyword genuinely cannot fit naturally without fabrication, place it in the most relevant Skills category — never invent experience.

OUTPUT:
Return the COMPLETE updated CV as raw JSON in the same schema. No preamble, no markdown fences, no commentary.`;

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
      // Repair output ≈ same size as original CV, but no extra reasoning
      // for keyword discovery (we hand it the exact list). 4500 is comfortable.
      maxTokens: 4500,
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
