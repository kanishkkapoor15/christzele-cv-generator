/**
 * POST  /api/sync-github  — streams ingestion progress as NDJSON
 * GET   /api/sync-github  — returns current portfolio status (synced?, count, syncedAt)
 *
 * Streams newline-delimited JSON events so the UI can display live progress
 * without polling. Shares the core ingestion logic with the CLI script.
 */

import { NextRequest } from "next/server";
import {
  readPortfolio,
  runIngestion,
  type IngestEvent,
} from "@/lib/github-ingestion";

export const runtime = "nodejs";
// Long-running: a full sync can take several minutes depending on repo count.
// Local single-user app — this only matters on serverless platforms.
export const maxDuration = 600;
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<Response> {
  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username || !token) {
    return new Response(
      JSON.stringify({
        error: "GITHUB_USERNAME or GITHUB_TOKEN not set. Check .env.local.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown): void => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        await runIngestion({
          username,
          githubToken: token,
          onEvent: (e: IngestEvent) => {
            switch (e.type) {
              case "start":
                emit({ status: "start", total: e.total });
                break;
              case "progress":
                emit({
                  status: "processing",
                  repo: e.repo,
                  done: e.done,
                  total: e.total,
                });
                break;
              case "success":
                emit({
                  status: "success",
                  repo: e.repo,
                  done: e.done,
                  total: e.total,
                  domains: e.domains,
                });
                break;
              case "failure":
                emit({
                  status: "failure",
                  repo: e.repo,
                  done: e.done,
                  total: e.total,
                  reason: e.reason,
                });
                break;
              case "complete":
                emit({
                  status: "complete",
                  total: e.total,
                  success: e.success,
                  failed: e.failed,
                });
                break;
            }
          },
        });
      } catch (err) {
        emit({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(): Promise<Response> {
  const portfolio = await readPortfolio();
  if (!portfolio) {
    return Response.json({ synced: false });
  }
  return Response.json({
    synced: true,
    count: portfolio.projects.length,
    syncedAt: portfolio.syncedAt,
    username: portfolio.username,
  });
}
