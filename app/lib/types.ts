export type RoleType =
  // Managerial / Supervisory — Restaurant & Food Service
  | "Restaurant Manager"
  | "Assistant Restaurant Manager"
  | "Shift Manager"
  | "Floor Supervisor"
  | "Food & Beverage Manager"
  | "QSR Operations Manager"
  | "Food Service Supervisor"
  | "Front of House Manager"
  // Managerial / Supervisory — Retail & Store
  | "Retail Store Manager"
  | "Branch Manager"
  | "Store Supervisor"
  | "Operations Supervisor"
  // Team Leadership & Training
  | "Team Leader"
  | "Training Coordinator"
  | "Crew Trainer"
  // Specialist / Admin
  | "Inventory Controller"
  | "Administrative Manager"
  | "Customer Service Manager"
  // Entry-level roles
  | "Customer Service Representative"
  | "Sales Associate"
  | "Retail Assistant"
  | "Cashier"
  | "Food Service Staff";

export const ROLE_TYPES: RoleType[] = [
  // Managerial — Restaurant & Food Service
  "Restaurant Manager",
  "Assistant Restaurant Manager",
  "Shift Manager",
  "Floor Supervisor",
  "Food & Beverage Manager",
  "QSR Operations Manager",
  "Food Service Supervisor",
  "Front of House Manager",
  // Managerial — Retail & Store
  "Retail Store Manager",
  "Branch Manager",
  "Store Supervisor",
  "Operations Supervisor",
  // Leadership & Training
  "Team Leader",
  "Training Coordinator",
  "Crew Trainer",
  // Specialist / Admin
  "Inventory Controller",
  "Administrative Manager",
  "Customer Service Manager",
  // Entry-level
  "Customer Service Representative",
  "Sales Associate",
  "Retail Assistant",
  "Cashier",
  "Food Service Staff",
];

export interface ContactInfo {
  phone: string;
  email: string;
  location: string;
  github: string;
  linkedin: string;
  website: string;
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface ExperienceItem {
  role: string;
  company: string;
  location: string;
  period: string;
  bullets: string[];
}

export interface EducationItem {
  degree: string;
  institution: string;
  period: string;
  note?: string;
}

export interface ProjectItem {
  name: string;
  description: string;
}

export interface CVData {
  name: string;
  tagline: string;
  contact: ContactInfo;
  summary: string;
  skills: SkillGroup[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  certifications: string[];
}

export interface GenerateRequest {
  jobDescription: string;
  roleType: RoleType;
  includeCoverLetter: boolean;
  allRelevantProjects: boolean;
  extraContext?: string;
}

export interface KeywordCoverageReport {
  essential: { covered: string[]; missing: string[]; pct: number };
  preferred: { covered: string[]; missing: string[]; pct: number };
  /** Weighted overall coverage — essentials count 2×, preferred count 1× */
  overallPct: number;
  /** Keywords the verifier auto-injected during repair */
  autoInjected: string[];
}

export interface GenerateResponse {
  cv: CVData;
  coverLetter?: string;
  /** Populated when includeCoverLetter=true but generation failed or returned empty. */
  coverLetterWarning?: string;
  detectedRole?: RoleType;
  /** ATS keyword coverage report from the local JD analyser. */
  keywordCoverage?: KeywordCoverageReport;
}
