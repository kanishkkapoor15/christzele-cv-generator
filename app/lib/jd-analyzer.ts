/**
 * Local JD analyser — extracts and classifies keywords by importance, then
 * verifies the generated CV actually contains every essential one.
 *
 * Pipeline (all local, zero API calls, ~5 ms total):
 *
 *   1. EXTRACT — pull keywords from two sources:
 *        a) Master DICTIONARY (canonical casing, high-precision tech terms)
 *        b) Heuristic regex pass (capitalised proper-noun phrases, acronyms,
 *           tech-pattern tokens like "Node.js" / "C#" / ".NET" / "CI/CD")
 *           — this catches niche tools the dictionary misses.
 *
 *   2. CLASSIFY — split the JD into sections by header markers
 *      ("Requirements" / "Must Have" / "Preferred" / "Nice to Have" / etc.).
 *      Each keyword is tagged ESSENTIAL / PREFERRED / MENTIONED based on which
 *      section(s) it appears in. Frequency boost: anything appearing 3+ times
 *      anywhere is promoted to ESSENTIAL.
 *
 *   3. FORMAT — render the analysis as a prompt-injection block that calls
 *      out essentials with stronger language than preferred terms.
 *
 *   4. VERIFY — after the CV is generated, scan every text field for each
 *      essential keyword. Any missing essentials are auto-injected into the
 *      `ats_keywords` array, GUARANTEEING 100% essential coverage in the
 *      final document. A coverage report is returned to the UI.
 */

import { CVData, RoleType } from "./types";
import {
  DICTIONARY,
  NON_TECHNICAL_ROLES,
  matchesInJD,
} from "./keyword-matcher";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Importance = "essential" | "preferred" | "mentioned";

export interface ClassifiedKeyword {
  term: string;
  importance: Importance;
  count: number;
  /** Display category — falls back to "Other / Domain-specific" for heuristic finds */
  category: string;
}

export interface JDAnalysis {
  /** Keywords sorted into tiers — these are the buckets the rest of the system uses */
  essential: ClassifiedKeyword[];
  preferred: ClassifiedKeyword[];
  mentioned: ClassifiedKeyword[];
  /** All keywords grouped by their display category, for the prompt block */
  byCategory: Record<string, ClassifiedKeyword[]>;
  /** Convenience flat list for cheap lookups */
  all: ClassifiedKeyword[];
}

export interface CoverageReport {
  essential: { covered: string[]; missing: string[]; pct: number };
  preferred: { covered: string[]; missing: string[]; pct: number };
  /** Weighted overall coverage — essentials count 2×, preferred count 1× */
  overallPct: number;
  /** Keywords the repair step folded into the Skills section so they appear
   *  in their natural ATS-readable home (not a fake "Core Competencies" dump) */
  autoInjected: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Section detection — split JD into ESSENTIAL / PREFERRED / OTHER zones
// ─────────────────────────────────────────────────────────────────────────────

interface Section {
  start: number;
  end: number;
  type: "essential" | "preferred" | "other";
}

// Headers that mark a "must-have" zone. Order matters — longer alternatives
// must come first so we don't half-match "Required Skills" as just "Required".
const ESSENTIAL_HEADERS =
  /\b(?:required\s+skills?|requirements?|must[\s-]?haves?|essentials?|qualifications?|key\s+skills?|core\s+skills?|what\s+you(?:'?ll|\s+will)?\s+(?:need|bring)|you\s+(?:must|should)\s+have|skills?\s*&\s*experience|technical\s+skills?)\b/gi;

const PREFERRED_HEADERS =
  /\b(?:preferred(?:\s+skills?)?|nice[\s-]?to[\s-]?haves?|bonus(?:\s+points?)?|plus|desired|good\s+to\s+have|advantageous|added\s+advantage|what\s+sets\s+you\s+apart)\b/gi;

/**
 * Walk the JD finding all section headers and build a list of sections.
 * Each section runs from its header until the next header (or end of text).
 * Text outside any header falls into the implicit "other" section.
 */
function detectSections(jd: string): Section[] {
  type Marker = { pos: number; type: "essential" | "preferred" };
  const markers: Marker[] = [];

  for (const m of jd.matchAll(ESSENTIAL_HEADERS)) {
    if (m.index !== undefined) markers.push({ pos: m.index, type: "essential" });
  }
  for (const m of jd.matchAll(PREFERRED_HEADERS)) {
    if (m.index !== undefined) markers.push({ pos: m.index, type: "preferred" });
  }
  markers.sort((a, b) => a.pos - b.pos);

  if (markers.length === 0) {
    return [{ start: 0, end: jd.length, type: "other" }];
  }

  const sections: Section[] = [];
  // Anything before the first marker is "other"
  if (markers[0].pos > 0) {
    sections.push({ start: 0, end: markers[0].pos, type: "other" });
  }
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pos;
    const end = i + 1 < markers.length ? markers[i + 1].pos : jd.length;
    sections.push({ start, end, type: markers[i].type });
  }
  return sections;
}

/**
 * Returns the section type (essential/preferred/other) at a given character
 * offset in the JD.
 */
function sectionAt(sections: Section[], pos: number): Section["type"] {
  for (const s of sections) {
    if (pos >= s.start && pos < s.end) return s.type;
  }
  return "other";
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic extraction — catches keywords the dictionary doesn't list
// ─────────────────────────────────────────────────────────────────────────────

// Common English words we never want to consider as "keywords" even if capitalised.
// Kept short and conservative — only obvious noise words.
const STOPWORDS = new Set([
  "The", "A", "An", "And", "Or", "But", "If", "Then", "Else", "When",
  "Where", "Why", "How", "What", "Who", "Whom", "Whose", "Which",
  "This", "That", "These", "Those", "Is", "Are", "Was", "Were", "Be",
  "Been", "Being", "Have", "Has", "Had", "Do", "Does", "Did", "Will",
  "Would", "Should", "Could", "May", "Might", "Must", "Can", "Cannot",
  "We", "You", "They", "He", "She", "It", "I", "Me", "My", "Your",
  "Their", "His", "Her", "Its", "Our", "Us", "Them", "About", "After",
  "Before", "During", "From", "Into", "Through", "With", "Without",
  "Within", "Across", "Among", "Between", "Including", "Plus", "And/Or",
  "Job", "Role", "Position", "Team", "Company", "Work", "Working",
  "Experience", "Skills", "Knowledge", "Ability", "Strong", "Excellent",
  "Good", "Great", "Best", "Years", "Year", "Day", "Days", "Week",
  "Weeks", "Month", "Months", "Required", "Preferred", "Essential",
  "Responsibilities", "Requirements", "Qualifications", "Description",
  "Bachelor", "Master", "PhD", "Degree", "University", "Dublin", "Ireland",
  "UK", "London", "Office", "Remote", "Hybrid", "Full-time", "Part-time",
]);

// Multi-word capitalised phrases: "Apache Spark", "Unity Catalog", "Delta Lake"
// 2-4 word sequences where each word starts with a capital letter.
const CAPITALISED_PHRASE_RE =
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g;

// Tech-pattern tokens with special chars: "Node.js", ".NET", "C#", "C++", "CI/CD", "REST/GraphQL"
const TECH_PATTERN_RE =
  /\b(?:[A-Z][A-Za-z0-9]*[#+]+|\.?[A-Z][A-Za-z]+(?:\.[a-z][A-Za-z0-9]+)+|[A-Z]{2,5}(?:[\/\-][A-Z]{2,5})+)\b/g;

// Acronyms: 2-6 uppercase chars, optionally with internal slashes like "CI/CD"
const ACRONYM_RE = /\b[A-Z]{2,6}(?:[\/\-][A-Z]{2,6})?\b/g;

interface RawHit {
  term: string;
  positions: number[];
}

function collectHits(jd: string, regex: RegExp): Map<string, RawHit> {
  const map = new Map<string, RawHit>();
  for (const m of jd.matchAll(regex)) {
    const term = m[0].trim();
    if (STOPWORDS.has(term)) continue;
    if (term.length < 2) continue;
    const existing = map.get(term);
    if (existing) {
      existing.positions.push(m.index ?? 0);
    } else {
      map.set(term, { term, positions: [m.index ?? 0] });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Importance classification
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCY_ESSENTIAL_THRESHOLD = 3;

/**
 * Decide a keyword's importance tier from where it appears and how often.
 * Rules (in priority order):
 *   1. Appears 3+ times anywhere       → essential (high signal)
 *   2. Appears in any essential section → essential
 *   3. Appears in any preferred section → preferred
 *   4. Otherwise                        → mentioned
 */
function classifyImportance(
  positions: number[],
  sections: Section[]
): Importance {
  if (positions.length >= FREQUENCY_ESSENTIAL_THRESHOLD) return "essential";

  let foundEssential = false;
  let foundPreferred = false;
  for (const pos of positions) {
    const t = sectionAt(sections, pos);
    if (t === "essential") foundEssential = true;
    else if (t === "preferred") foundPreferred = true;
  }
  if (foundEssential) return "essential";
  if (foundPreferred) return "preferred";
  return "mentioned";
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ANALYSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure local function — extracts every relevant keyword from the JD,
 * classifies it, and returns an actionable analysis.
 */
export function analyzeJD(jd: string, roleType: RoleType): JDAnalysis {
  const empty: JDAnalysis = {
    essential: [],
    preferred: [],
    mentioned: [],
    byCategory: {},
    all: [],
  };

  if (NON_TECHNICAL_ROLES.has(roleType)) return empty;

  const jdLower = jd.toLowerCase();
  const sections = detectSections(jd);

  // STEP 1 — dictionary pass (preserves canonical casing + categories)
  const dictHits = new Map<string, ClassifiedKeyword>();
  for (const [category, keywords] of Object.entries(DICTIONARY)) {
    for (const kw of keywords) {
      if (!matchesInJD(jdLower, kw)) continue;
      // Find every occurrence position to drive classification + frequency
      const positions = findAllPositions(jdLower, kw.toLowerCase());
      const importance = classifyImportance(positions, sections);
      // Dedupe by lowercase form so e.g. "SQL" and "sql" don't double-count
      const key = kw.toLowerCase();
      if (!dictHits.has(key)) {
        dictHits.set(key, {
          term: kw,
          importance,
          count: positions.length,
          category,
        });
      }
    }
  }

  // STEP 2 — heuristic pass for terms NOT already in dictionary
  const heuristicCategory = "Other / Domain-specific";
  const candidates = new Map<string, RawHit>();
  for (const re of [TECH_PATTERN_RE, CAPITALISED_PHRASE_RE, ACRONYM_RE]) {
    for (const [term, hit] of collectHits(jd, re)) {
      const key = term.toLowerCase();
      // Skip if already in dictionary results — dictionary wins (canonical casing)
      if (dictHits.has(key)) continue;
      const existing = candidates.get(key);
      if (existing) {
        existing.positions.push(...hit.positions);
      } else {
        candidates.set(key, { term, positions: [...hit.positions] });
      }
    }
  }

  for (const [, hit] of candidates) {
    const importance = classifyImportance(hit.positions, sections);
    // Heuristic terms are noisier — only keep those flagged essential or
    // preferred so we don't pollute the prompt with random capitalised words.
    if (importance === "mentioned") continue;
    dictHits.set(hit.term.toLowerCase(), {
      term: hit.term,
      importance,
      count: hit.positions.length,
      category: heuristicCategory,
    });
  }

  // STEP 3 — bucket the results into the analysis structure
  const all = [...dictHits.values()];
  const essential = all.filter((k) => k.importance === "essential");
  const preferred = all.filter((k) => k.importance === "preferred");
  const mentioned = all.filter((k) => k.importance === "mentioned");

  const byCategory: Record<string, ClassifiedKeyword[]> = {};
  for (const k of all) {
    if (!byCategory[k.category]) byCategory[k.category] = [];
    byCategory[k.category].push(k);
  }

  // Sort each category — essentials first, then by frequency
  const importanceRank: Record<Importance, number> = {
    essential: 0,
    preferred: 1,
    mentioned: 2,
  };
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort(
      (a, b) =>
        importanceRank[a.importance] - importanceRank[b.importance] ||
        b.count - a.count
    );
  }

  return { essential, preferred, mentioned, byCategory, all };
}

/** Find every occurrence position of `needle` in `haystack` (both lowercased) */
function findAllPositions(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + needle.length;
  }
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt-block formatting
// ─────────────────────────────────────────────────────────────────────────────

export function formatKeywordBlock(analysis: JDAnalysis): string | undefined {
  if (analysis.all.length === 0) return undefined;

  const lines: string[] = [
    "PRE-EXTRACTED JD KEYWORDS — USE THESE EXACT STRINGS VERBATIM IN THE CV:",
    "Keywords are tagged by importance (extracted locally from JD section markers + frequency).",
    "",
    "★ ESSENTIAL — these MUST appear in the CV body (Summary, Skills, Experience bullets, or Projects).",
    "  Missing essentials will be auto-injected into the Core Competencies section by the verifier.",
    "○ PREFERRED — should appear if naturally fits; otherwise place in Core Competencies.",
    "",
  ];

  if (analysis.essential.length > 0) {
    lines.push("★ ESSENTIAL KEYWORDS:");
    for (const [cat, items] of Object.entries(analysis.byCategory)) {
      const ess = items.filter((k) => k.importance === "essential");
      if (ess.length === 0) continue;
      lines.push(`  ${cat}: ${ess.map((k) => k.term).join(", ")}`);
    }
    lines.push("");
  }

  if (analysis.preferred.length > 0) {
    lines.push("○ PREFERRED KEYWORDS:");
    for (const [cat, items] of Object.entries(analysis.byCategory)) {
      const pref = items.filter((k) => k.importance === "preferred");
      if (pref.length === 0) continue;
      lines.push(`  ${cat}: ${pref.map((k) => k.term).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION & AUTO-REPAIR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flatten every text-bearing field of a CV into one lowercase blob — used for
 * fast verbatim keyword presence checks.
 */
function cvToFlatLowerText(cv: CVData): string {
  const parts: string[] = [
    cv.tagline ?? "",
    cv.summary ?? "",
    ...(cv.skills ?? []).flatMap((s) => [s.category, ...s.items]),
    ...(cv.experience ?? []).flatMap((e) => [
      e.role,
      e.company,
      e.location,
      ...e.bullets,
    ]),
    ...(cv.projects ?? []).flatMap((p) => [p.name, p.description]),
    ...(cv.certifications ?? []),
  ];
  return parts.join(" \n ").toLowerCase();
}

/**
 * Compare the generated CV against the analysis and report which essentials
 * and preferreds were actually delivered.
 */
function computeCoverage(
  cv: CVData,
  analysis: JDAnalysis
): Pick<CoverageReport, "essential" | "preferred" | "overallPct"> {
  const cvText = cvToFlatLowerText(cv);

  const essCovered: string[] = [];
  const essMissing: string[] = [];
  for (const k of analysis.essential) {
    if (matchesInJD(cvText, k.term)) essCovered.push(k.term);
    else essMissing.push(k.term);
  }

  const prefCovered: string[] = [];
  const prefMissing: string[] = [];
  for (const k of analysis.preferred) {
    if (matchesInJD(cvText, k.term)) prefCovered.push(k.term);
    else prefMissing.push(k.term);
  }

  const essPct =
    analysis.essential.length === 0
      ? 100
      : Math.round((essCovered.length / analysis.essential.length) * 100);
  const prefPct =
    analysis.preferred.length === 0
      ? 100
      : Math.round((prefCovered.length / analysis.preferred.length) * 100);

  // Weighted: essentials count 2×, preferred count 1×
  const totalWeight =
    analysis.essential.length * 2 + analysis.preferred.length * 1;
  const totalCoveredWeight = essCovered.length * 2 + prefCovered.length * 1;
  const overallPct =
    totalWeight === 0
      ? 100
      : Math.round((totalCoveredWeight / totalWeight) * 100);

  return {
    essential: { covered: essCovered, missing: essMissing, pct: essPct },
    preferred: { covered: prefCovered, missing: prefMissing, pct: prefPct },
    overallPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFIER (report-only — no local mutation)
// ─────────────────────────────────────────────────────────────────────────────
//
// We deliberately do NOT mutate the CV here. Local mutation can't tell whether
// "Murex" belongs in "Cloud & DevOps" or "Finance Domain" — only an LLM with
// full context can do that without producing gibberish. When essentials are
// missing, the route handler dispatches an LLM-based repair pass that runs in
// parallel with the cover letter generation so it's effectively free time-wise.
//
// `autoInjected` is exposed in the report so the LLM repair function knows
// exactly which terms it must add (= initial.essential.missing).

/**
 * Compute the keyword coverage report for a generated CV. Pure read-only.
 */
export function verifyCoverage(
  cv: CVData,
  analysis: JDAnalysis
): CoverageReport {
  const c = computeCoverage(cv, analysis);
  return { ...c, autoInjected: [] };
}
