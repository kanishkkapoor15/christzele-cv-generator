/**
 * Core GitHub ingestion logic — shared by /scripts/ingest-github.ts (CLI)
 * and /app/api/sync-github/route.ts (streaming HTTP endpoint).
 *
 * Responsibilities:
 *   - Fetch all public, non-fork, non-archived repos for a GitHub user
 *   - For each repo: pull README, root file tree, and requirements.txt / package.json
 *   - Call Tensorix (deepseek-r1-0528) to extract a structured project profile
 *   - Persist the analysed portfolio to /data/github-portfolio.json
 *
 * Rate-limit safety: max 5 concurrent repos, 200 ms delay between per-worker iterations.
 * README truncated to 2000 chars so token usage stays sane.
 */

import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const PORTFOLIO_FILE = path.join(DATA_DIR, "github-portfolio.json");
const GH_API = "https://api.github.com";

const TENSORIX_DEFAULT_BASE_URL = "https://api.tensorix.ai/v1";
const TENSORIX_DEFAULT_MODEL = "deepseek/deepseek-r1-0528";

// ───────────────────────────── Types ─────────────────────────────

export interface RepoMetadata {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  language: string | null;
  topics?: string[];
  updated_at: string;
  stargazers_count: number;
}

export interface RepoContent {
  readme: string;
  dependencies: string;
  fileTree: string[];
}

export interface AnalysedProject {
  repo: string;
  title: string;
  one_liner: string;
  domain: string[];
  tech_stack: string[];
  key_achievement: string | null;
  ats_keywords: string[];
  role_fit: string[];
}

export interface PortfolioFile {
  syncedAt: string;
  username: string;
  projects: AnalysedProject[];
}

export type IngestEventType =
  | "start"
  | "progress"
  | "success"
  | "failure"
  | "complete";

export interface IngestEvent {
  type: IngestEventType;
  total?: number;
  done?: number;
  repo?: string;
  domains?: string[];
  reason?: string;
  success?: number;
  failed?: number;
}

// ───────────────────────── GitHub API helpers ─────────────────────

async function ghFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kanishk-cv-generator",
    },
  });
}

export async function fetchAllRepos(
  username: string,
  token: string
): Promise<RepoMetadata[]> {
  const repos: RepoMetadata[] = [];
  let page = 1;

  // Paginate — GitHub caps at 100 per page
  while (true) {
    const res = await ghFetch(
      `${GH_API}/users/${username}/repos?per_page=100&page=${page}&sort=updated`,
      token
    );
    if (!res.ok) {
      throw new Error(
        `GitHub repo fetch failed: ${res.status} ${res.statusText}`
      );
    }
    const data = (await res.json()) as RepoMetadata[];
    repos.push(...data);
    if (data.length < 100) break;
    page += 1;
  }

  // Filter: drop forks, archived, and anything with "fork" in the name
  return repos.filter(
    (r) => !r.fork && !r.archived && !/fork/i.test(r.name)
  );
}

function decodeBase64(str: string): string {
  return Buffer.from(str, "base64").toString("utf-8");
}

export async function fetchRepoContent(
  owner: string,
  repo: string,
  token: string
): Promise<RepoContent> {
  // README
  let readme = "";
  try {
    const r = await ghFetch(`${GH_API}/repos/${owner}/${repo}/readme`, token);
    if (r.ok) {
      const j = (await r.json()) as { content?: string; encoding?: string };
      if (j.content) readme = decodeBase64(j.content);
    }
  } catch {
    // README may be missing — that's fine, we still analyse
  }
  if (readme.length > 2000) readme = readme.slice(0, 2000);

  // Root file tree
  let fileTree: string[] = [];
  try {
    const r = await ghFetch(
      `${GH_API}/repos/${owner}/${repo}/contents/`,
      token
    );
    if (r.ok) {
      const j = (await r.json()) as { name: string; type: string }[];
      if (Array.isArray(j)) fileTree = j.map((f) => f.name);
    }
  } catch {
    // Empty tree is acceptable
  }

  // Dependencies: requirements.txt wins, then package.json
  let dependencies = "";
  if (fileTree.includes("requirements.txt")) {
    try {
      const r = await ghFetch(
        `${GH_API}/repos/${owner}/${repo}/contents/requirements.txt`,
        token
      );
      if (r.ok) {
        const j = (await r.json()) as { content?: string };
        if (j.content) dependencies = decodeBase64(j.content);
      }
    } catch {}
  } else if (fileTree.includes("package.json")) {
    try {
      const r = await ghFetch(
        `${GH_API}/repos/${owner}/${repo}/contents/package.json`,
        token
      );
      if (r.ok) {
        const j = (await r.json()) as { content?: string };
        if (j.content) {
          const pkg = JSON.parse(decodeBase64(j.content)) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const all = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
          };
          dependencies = Object.keys(all).join("\n");
        }
      }
    } catch {}
  }
  if (dependencies.length > 2000) dependencies = dependencies.slice(0, 2000);

  return { readme, dependencies, fileTree };
}

// ───────────────────────── Tensorix helpers ──────────────────────

async function callTensorix(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  maxTokens = 1500
): Promise<string> {
  const apiKey = process.env.TENSORIX_API_KEY;
  const baseUrl = process.env.TENSORIX_BASE_URL || TENSORIX_DEFAULT_BASE_URL;
  const model = process.env.TENSORIX_MODEL || TENSORIX_DEFAULT_MODEL;
  if (!apiKey) throw new Error("TENSORIX_API_KEY is not set");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Tensorix error ${res.status}: ${errText || res.statusText}`);
  }

  const j = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new Error("Tensorix returned empty content");
  return content;
}

function extractJSON<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return JSON.parse(s) as T;
}

// ──────────────────────── Ingestion prompt ───────────────────────

const INGESTION_SYSTEM_PROMPT = `You are analysing a GitHub repository belonging to Kanishk Kapoor, an MSc Data Analytics student and AI/Data Engineer based in Dublin.

Analyse the repo name, README, and dependency files provided and extract a structured profile. Be concise and technical.

Return ONLY valid JSON, no preamble, no markdown fences.

Schema:
{
  "repo": "string — exact repo name",
  "title": "string — clean human-readable project title",
  "one_liner": "string — one punchy sentence: what it does + main tech",
  "domain": ["string"] — pick ALL that apply:
    ["data-engineering", "data-science", "machine-learning", "deep-learning",
     "nlp", "computer-vision", "time-series", "rag", "llm-agents", "agentic-ai",
     "cloud-infrastructure", "real-time-streaming", "frontend", "backend-api",
     "iot", "cybersecurity", "fintech", "healthcare", "compliance-tech",
     "visualisation", "database", "automation", "software-engineering"],
  "tech_stack": ["string — every library, framework, tool, cloud service detected"],
  "key_achievement": "string — quantified outcome if mentioned in README, else null",
  "ats_keywords": ["string — 8 to 10 ATS and recruiter keywords this project proves"],
  "role_fit": ["string"] — pick ALL that apply:
    ["Data Analyst", "Data Engineer", "ML Engineer", "AI Engineer",
     "Software Engineer", "Backend Engineer", "Frontend Engineer",
     "LLM Engineer", "Agentic AI Engineer", "CRM Analyst",
     "Business Intelligence Analyst", "Cloud Engineer",
     "NLP Engineer", "Computer Vision Engineer", "Cybersecurity Analyst"]
}`;

export async function analyseRepo(args: {
  repo: RepoMetadata;
  content: RepoContent;
}): Promise<AnalysedProject> {
  const { repo, content } = args;
  const userPrompt = `Repo name: ${repo.name}
Description: ${repo.description ?? "none"}

README:
${content.readme || "(no README found)"}

Dependencies detected:
${content.dependencies || "none"}

Root files: ${content.fileTree.join(", ") || "none"}`;

  const raw = await callTensorix(
    INGESTION_SYSTEM_PROMPT,
    userPrompt,
    0.2,
    1500
  );
  const parsed = extractJSON<AnalysedProject>(raw);
  // Safety: force the repo field to match the actual repo name
  parsed.repo = repo.name;
  return parsed;
}

// ─────────────────────────── Persistence ─────────────────────────

export async function writePortfolio(
  projects: AnalysedProject[],
  username: string
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload: PortfolioFile = {
    syncedAt: new Date().toISOString(),
    username,
    projects,
  };
  await fs.writeFile(PORTFOLIO_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

export async function readPortfolio(): Promise<PortfolioFile | null> {
  try {
    const raw = await fs.readFile(PORTFOLIO_FILE, "utf-8");
    return JSON.parse(raw) as PortfolioFile;
  } catch {
    return null;
  }
}

// ──────────────────── Main ingestion orchestrator ────────────────

/**
 * Runs the full ingestion flow. Emits progress events via the onEvent callback
 * so both the CLI script (console.log) and the HTTP streaming endpoint
 * (NDJSON write) can share the same core logic.
 *
 * Concurrency: 5 workers, 200 ms delay between iterations per worker.
 */
export async function runIngestion(opts: {
  username: string;
  githubToken: string;
  onEvent?: (event: IngestEvent) => void;
}): Promise<{
  analysed: AnalysedProject[];
  success: number;
  failed: number;
  total: number;
}> {
  const { username, githubToken, onEvent = () => {} } = opts;

  const repos = await fetchAllRepos(username, githubToken);
  const total = repos.length;
  onEvent({ type: "start", total });

  const analysed: AnalysedProject[] = [];
  const queue: RepoMetadata[] = [...repos];
  let done = 0;
  let successCount = 0;
  let failedCount = 0;

  const CONCURRENCY = 5;
  const DELAY_MS = 200;

  const runWorker = async (): Promise<void> => {
    while (queue.length > 0) {
      const repo = queue.shift();
      if (!repo) return;

      onEvent({ type: "progress", repo: repo.name, done, total });
      try {
        const content = await fetchRepoContent(
          username,
          repo.name,
          githubToken
        );
        const proj = await analyseRepo({ repo, content });
        analysed.push(proj);
        done += 1;
        successCount += 1;
        onEvent({
          type: "success",
          repo: repo.name,
          done,
          total,
          domains: proj.domain,
        });
      } catch (e) {
        done += 1;
        failedCount += 1;
        onEvent({
          type: "failure",
          repo: repo.name,
          done,
          total,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  };

  const workerCount = Math.min(CONCURRENCY, total);
  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker())
  );

  onEvent({
    type: "complete",
    total,
    success: successCount,
    failed: failedCount,
  });

  await writePortfolio(analysed, username);

  return {
    analysed,
    success: successCount,
    failed: failedCount,
    total,
  };
}
