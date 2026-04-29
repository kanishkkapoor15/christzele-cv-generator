/**
 * Standalone CLI for ingesting the GitHub portfolio.
 *
 * Usage:
 *   npm run ingest:github
 *   (or: npx ts-node scripts/ingest-github.ts)
 *
 * Loads .env.local manually (no dotenv dependency), then runs the same
 * runIngestion() function used by the /api/sync-github streaming endpoint.
 */

import fs from "fs";
import path from "path";
import { runIngestion, type IngestEvent } from "../lib/github-ingestion";

// ────────────────────── Tiny .env.local loader ──────────────────────

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

// ─────────────────────────────── Main ───────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();

  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username) {
    console.error("✗ GITHUB_USERNAME not set in .env.local");
    process.exit(1);
  }
  if (!token) {
    console.error("✗ GITHUB_TOKEN not set in .env.local");
    process.exit(1);
  }
  if (!process.env.TENSORIX_API_KEY) {
    console.error("✗ TENSORIX_API_KEY not set in .env.local");
    process.exit(1);
  }

  console.log(`→ Syncing GitHub portfolio for @${username}…`);

  const onEvent = (e: IngestEvent): void => {
    if (e.type === "start") {
      console.log(
        `→ Found ${e.total} non-fork, non-archived repos to analyse`
      );
    } else if (e.type === "success") {
      const domains = (e.domains ?? []).join(", ");
      console.log(
        `✓ ${e.repo}${domains ? ` (${domains})` : ""}  [${e.done}/${e.total}]`
      );
    } else if (e.type === "failure") {
      console.log(`✗ ${e.repo} — ${e.reason}  [${e.done}/${e.total}]`);
    }
  };

  try {
    const result = await runIngestion({
      username,
      githubToken: token,
      onEvent,
    });
    console.log(
      `\n✓ Ingested ${result.success}/${result.total} repos successfully (${result.failed} failed)`
    );
    console.log(`  → Written to data/github-portfolio.json`);
  } catch (e) {
    console.error(
      "\n✗ Ingestion crashed:",
      e instanceof Error ? e.message : e
    );
    process.exit(1);
  }
}

main();
