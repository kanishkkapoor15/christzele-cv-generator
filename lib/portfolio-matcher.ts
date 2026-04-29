/**
 * Local portfolio matcher — zero API calls, runs in <1 ms.
 *
 * BEFORE: every CV generation made an extra deepseek-r1 reasoning call to
 * score and re-describe portfolio projects, adding 60–180 seconds to every
 * request (the model's silent reasoning phase is brutal even for small jobs).
 *
 * NOW: each portfolio project already carries `ats_keywords`, `tech_stack`,
 * and `domain` arrays — pre-extracted at sync time by the ingestion pipeline.
 * We score every project by counting how many of its keywords appear verbatim
 * in the JD (case-insensitive, word-boundary aware), pick the top 3, and let
 * the CV model handle natural-language reframing in its single existing pass.
 *
 * Total saved per generation: one whole deepseek-r1 round-trip.
 */

import { readPortfolio } from "./github-ingestion";
import { matchesInJD } from "../app/lib/keyword-matcher";

export interface SelectedProject {
  repo: string;
  title: string;
  /** Number of JD-matched keywords found across all this project's keyword arrays */
  score: number;
  /** Original portfolio one-liner — the CV model handles JD-specific reframing */
  one_liner: string;
  /** Keywords on this project that appear verbatim in the JD — surfaced so the
   *  CV model knows which terms to emphasise when it writes the description */
  matched_keywords: string[];
}

export interface MatchResult {
  selected: SelectedProject[];
  portfolioNotSynced?: boolean;
}

interface PortfolioProject {
  repo: string;
  title: string;
  one_liner?: string | null;
  domain?: string[] | null;
  tech_stack?: string[] | null;
  ats_keywords?: string[] | null;
  role_fit?: string[] | null;
  key_achievement?: string | null;
}

/** Minimum overlap a project needs to be considered relevant. Tuned to keep
 *  totally off-topic repos out of the CV without being so strict that legitimate
 *  matches get filtered for short JDs. */
const MIN_RELEVANCE_SCORE = 2;
const MAX_PROJECTS = 3;

/**
 * Score a single project against the JD by counting verbatim keyword overlaps
 * across its `ats_keywords`, `tech_stack`, and `domain` arrays.
 * Each unique keyword counts at most once even if it appears in multiple arrays.
 */
function scoreProject(
  project: PortfolioProject,
  jdLower: string
): { score: number; matched: string[] } {
  const candidates = new Set<string>();
  for (const list of [project.ats_keywords, project.tech_stack, project.domain]) {
    if (!list) continue;
    for (const kw of list) {
      const trimmed = kw?.trim();
      if (trimmed && trimmed.length >= 2) candidates.add(trimmed);
    }
  }

  const matched: string[] = [];
  // Track lowercased forms we've already counted so synonym-style duplicates
  // (e.g. "Node.js" and "Node" or "MongoDB" listed in two arrays) only score once.
  const countedLower = new Set<string>();
  for (const kw of candidates) {
    const lower = kw.toLowerCase();
    if (countedLower.has(lower)) continue;
    if (matchesInJD(jdLower, kw)) {
      matched.push(kw);
      countedLower.add(lower);
    }
  }

  return { score: matched.length, matched };
}

/**
 * Pick the top-scoring portfolio projects for a given JD using local
 * deterministic keyword overlap. Returns `portfolioNotSynced: true` when
 * the user hasn't run the GitHub sync yet so the upstream flow can fall
 * back to the hardcoded master profile projects silently.
 */
export async function matchProjects(jdText: string): Promise<MatchResult> {
  const portfolio = await readPortfolio();
  if (!portfolio || !portfolio.projects || portfolio.projects.length === 0) {
    return { selected: [], portfolioNotSynced: true };
  }

  const jdLower = jdText.toLowerCase();
  const projects = portfolio.projects as PortfolioProject[];

  const scored = projects
    .map((p) => {
      const { score, matched } = scoreProject(p, jdLower);
      return {
        repo: p.repo,
        title: p.title,
        score,
        one_liner: p.one_liner ?? "",
        matched_keywords: matched,
      };
    })
    .filter((p) => p.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PROJECTS);

  return { selected: scored };
}

/**
 * Format the selected projects into the prompt-injection block.
 * Returns undefined when nothing meets the relevance threshold so the CV
 * model falls back to the hardcoded master profile projects.
 */
export function formatPortfolioBlock(
  selected: SelectedProject[]
): string | undefined {
  if (!selected || selected.length === 0) return undefined;

  const lines: string[] = [
    "GITHUB PORTFOLIO INTELLIGENCE:",
    "These projects were locally scored against the JD by counting verbatim",
    "keyword overlap. Use THESE projects in the projects section (override the",
    "hardcoded profile's projects). Reframe each one-liner naturally for the JD's",
    "domain — emphasise the matched keywords listed.",
    "",
  ];

  for (const p of selected) {
    lines.push(
      `- ${p.title}: ${p.one_liner} ` +
        `[Matched keywords: ${p.matched_keywords.join(", ")}] ` +
        `[Score: ${p.score}]`
    );
  }

  return lines.join("\n");
}
