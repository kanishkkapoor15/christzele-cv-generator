/**
 * Local keyword matching — zero API calls, runs in <1 ms.
 *
 * Extracts every JD keyword verbatim from a comprehensive hospitality / retail /
 * operations dictionary, then formats the matched set as a structured block
 * that gets injected into the CV prompt.
 *
 * Matching rules:
 *  - Multi-word phrases  → case-insensitive substring
 *  - Keywords with special chars → case-insensitive substring
 *  - Regular single words → word-boundary regex to avoid false positives
 */

import type { RoleType } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Master keyword dictionary — hospitality / retail / operations domain.
// Organised by display category; entries use canonical JD casing.
// ─────────────────────────────────────────────────────────────────────────────
export const DICTIONARY: Record<string, string[]> = {
  "Restaurant & Food Service Operations": [
    "Food Safety", "Food Hygiene", "Food Handler", "Food Safety Programme",
    "Food Safety Program", "HACCP", "Sanitation", "Cleanliness",
    "C&S Compliance", "Health & Safety", "FSC Compliance",
    "Food Service", "QSR", "Quick Service Restaurant", "Fast Food",
    "Food Preparation", "Food Quality", "Product Quality",
    "FIFO", "FEFO", "Stock Rotation", "Temperature Control",
    "Pest Control", "Pest Awareness", "Kitchen Operations",
    "Drive-Thru", "Drive Thru", "Delivery Operations",
    "Table Turnover", "Service Speed", "Turnaround Time", "Order Accuracy",
    "Food & Beverage", "Beverage Service", "Portion Control",
    "Menu Knowledge", "Food Costing", "Wastage Control",
    "Opening Procedures", "Closing Procedures", "Shift Handover",
  ],

  "Retail & Store Operations": [
    "Retail Operations", "Store Operations", "Shop Floor",
    "Inventory Management", "Stock Management", "Stock Control",
    "Stock Count", "Stocktake", "Stock Replenishment",
    "Merchandising", "Visual Merchandising", "Planogram", "Shelving",
    "Loss Prevention", "Shrinkage Control",
    "Point of Sale", "POS System", "Cash Handling",
    "Cash Reconciliation", "Till Management", "Cash Register",
    "Petty Cash", "End-of-Day Reconciliation",
    "Product Knowledge", "Upselling", "Cross-selling",
    "Sales Floor", "Floor Walk", "Store Standards",
    "Retail KPIs",
  ],

  "Team Leadership & People Management": [
    "Team Leadership", "Team Management", "Staff Management",
    "Crew Management", "People Management", "Supervisory",
    "Supervision", "Shift Management", "Floor Management",
    "Scheduling", "Crew Scheduling", "Roster Management",
    "Workforce Management", "Manhours", "Labour Cost",
    "Staff Training", "Training & Development", "Onboarding",
    "Coaching", "Mentoring", "Performance Appraisal",
    "Performance Management", "Employee Evaluation", "KRA",
    "Key Results Area", "Disciplinary", "Feedback",
    "Crew Training System", "Train the Trainer",
    "Succession Planning", "Staff Motivation",
    "Conflict Resolution", "Team Building",
  ],

  "Customer Service & Experience": [
    "Customer Service", "Customer Experience", "Customer Satisfaction",
    "Customer Relations", "Client Relations", "Guest Relations",
    "Complaint Handling", "Service Recovery", "Customer Feedback",
    "Customer Survey", "CRM", "Escalation Handling",
    "Concierge", "Front of House", "Frontline Service",
    "Net Promoter Score", "NPS", "Service Standards",
    "Customer Retention", "Loyalty Programme",
  ],

  "Business Operations & Administration": [
    "Operations Management", "Operational Efficiency", "Process Improvement",
    "KPI", "Key Performance Indicators", "Key Results Area",
    "Sales Targets", "Revenue", "Cost Management", "Profit & Loss", "P&L",
    "Budget Management", "Cost Control", "Expense Tracking",
    "Administrative Support", "Reporting", "Documentation",
    "Compliance", "Audit", "Quality Assurance", "Quality Control",
    "Procurement", "Purchasing", "Vendor Management", "Supplier Relations",
    "Accounts Receivable", "Billing", "Invoicing", "Bookkeeping",
    "MS Office", "Microsoft Office", "Microsoft Excel",
    "Microsoft Word", "PowerPoint", "Spreadsheets",
    "Data Entry", "Record Keeping",
  ],

  "Sales & Marketing": [
    "Sales", "Sales Management", "Sales Performance",
    "Marketing", "Promotions", "Campaign Management",
    "Direct Sales", "Business Development", "Client Acquisition",
    "Revenue Growth", "Sales Growth", "Market Penetration",
    "Brand Awareness", "Social Media",
  ],

  "Soft Skills & Attributes": [
    "Communication Skills", "Interpersonal Skills", "Leadership",
    "Problem Solving", "Decision Making", "Time Management",
    "Organisational Skills", "Adaptability", "Multi-tasking",
    "Attention to Detail", "Accuracy", "Teamwork", "Collaboration",
    "Initiative", "Self-motivated", "Resilience", "Integrity",
    "Bilingual", "Multilingual",
  ],
};

// Entry-level roles where the keyword injection pipeline still runs — we keep
// NON_TECHNICAL_ROLES empty for Christzele's generator so ALL roles benefit
// from keyword analysis using the hospitality/retail dictionary above.
export const NON_TECHNICAL_ROLES = new Set<RoleType>([
  // No roles excluded — all of Christzele's target roles benefit from
  // keyword coverage analysis with the hospitality dictionary.
]);

// ─────────────────────────────────────────────────────────────────────────────
// Matching helpers
// ─────────────────────────────────────────────────────────────────────────────

const SPECIAL_CHAR_RE = /[#.+/\\]/;

/**
 * Test whether a keyword appears in the (already-lowercased) JD text.
 * Exported so other modules share identical matching semantics.
 */
export function matchesInJD(jdLower: string, keyword: string): boolean {
  const kl = keyword.toLowerCase();

  // Multi-word or contains special regex chars → plain substring match
  if (keyword.includes(" ") || SPECIAL_CHAR_RE.test(keyword)) {
    return jdLower.includes(kl);
  }

  // Single word → word-boundary match to avoid e.g. "Sales" firing inside "Wholesale"
  try {
    return new RegExp(`\\b${kl}\\b`).test(jdLower);
  } catch {
    return jdLower.includes(kl);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchedKeywords {
  /** Keywords grouped by display category, only non-empty categories included */
  byCategory: Record<string, string[]>;
  /** Flat deduplicated list of all matched keywords */
  all: string[];
}

/**
 * Scan a job description and return every keyword from the master dictionary
 * that appears verbatim (case-insensitive) in the text.
 */
export function extractJDKeywords(
  jd: string,
  roleType: RoleType
): MatchedKeywords {
  if (NON_TECHNICAL_ROLES.has(roleType)) {
    return { byCategory: {}, all: [] };
  }

  const jdLower = jd.toLowerCase();
  const byCategory: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const [category, keywords] of Object.entries(DICTIONARY)) {
    const matched: string[] = [];
    for (const kw of keywords) {
      if (!seen.has(kw) && matchesInJD(jdLower, kw)) {
        matched.push(kw);
        seen.add(kw);
      }
    }
    if (matched.length > 0) {
      byCategory[category] = matched;
    }
  }

  return { byCategory, all: [...seen] };
}

/**
 * Format matched keywords as a prompt-injection block.
 * Returns undefined when no keywords were matched (safe to skip injection).
 */
export function formatKeywordBlock(
  matched: MatchedKeywords
): string | undefined {
  if (matched.all.length === 0) return undefined;

  const lines: string[] = [
    "PRE-EXTRACTED JD KEYWORDS — USE THESE EXACT STRINGS VERBATIM IN THE CV:",
    "Every keyword below was found word-for-word in the JD. You MUST use each one",
    "with this EXACT spelling and casing at least once (Summary / Skills / bullets / achievements).",
    "",
  ];

  for (const [category, keywords] of Object.entries(matched.byCategory)) {
    lines.push(`${category}: ${keywords.join(", ")}`);
  }

  return lines.join("\n");
}
