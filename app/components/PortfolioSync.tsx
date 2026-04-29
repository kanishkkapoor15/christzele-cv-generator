"use client";

/**
 * Compact banner at the top of the page showing GitHub portfolio sync status.
 * Power-user feature — intentionally minimal so it doesn't compete with the
 * main CV generation UI.
 */

import { useEffect, useState } from "react";

interface PortfolioStatus {
  synced: boolean;
  count?: number;
  syncedAt?: string;
  username?: string;
}

type SyncState =
  | { kind: "idle" }
  | { kind: "running"; repo: string; done: number; total: number }
  | { kind: "done"; success: number; total: number }
  | { kind: "error"; message: string };

export default function PortfolioSync() {
  const [status, setStatus] = useState<PortfolioStatus | null>(null);
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });

  async function loadStatus() {
    try {
      const res = await fetch("/api/sync-github");
      if (res.ok) setStatus(await res.json());
    } catch {
      // Silent — the banner will just show "not synced"
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleSync() {
    setSync({ kind: "running", repo: "…", done: 0, total: 0 });
    try {
      const res = await fetch("/api/sync-github", { method: "POST" });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastComplete: { success: number; total: number } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: {
            status?: string;
            repo?: string;
            done?: number;
            total?: number;
            success?: number;
            failed?: number;
            error?: string;
          };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.status === "processing" || evt.status === "success") {
            setSync({
              kind: "running",
              repo: evt.repo || "…",
              done: evt.done || 0,
              total: evt.total || 0,
            });
          } else if (evt.status === "complete") {
            lastComplete = {
              success: evt.success ?? 0,
              total: evt.total ?? 0,
            };
          } else if (evt.status === "error") {
            throw new Error(evt.error || "Unknown sync error");
          }
        }
      }

      if (lastComplete) {
        setSync({ kind: "done", ...lastComplete });
        await loadStatus();
      } else {
        setSync({ kind: "done", success: 0, total: 0 });
      }
    } catch (e) {
      setSync({
        kind: "error",
        message: e instanceof Error ? e.message : "Sync failed",
      });
    }
  }

  const lastSyncedLabel =
    status?.syncedAt &&
    new Date(status.syncedAt).toLocaleString("en-IE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white/70 px-4 py-2.5 text-xs shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="flex min-w-0 items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-neutral-700 dark:text-neutral-300"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
        </svg>
        <span className="shrink-0 font-semibold text-neutral-800 dark:text-neutral-200">
          Portfolio Intelligence
        </span>
        <span className="shrink-0 text-neutral-400">·</span>
        <span className="truncate">
          {sync.kind === "running" ? (
            <span className="text-neutral-600 dark:text-neutral-400">
              Analysing <span className="font-mono">{sync.repo}</span>
              {sync.total > 0 && (
                <>
                  {" "}
                  ({sync.done}/{sync.total})
                </>
              )}
            </span>
          ) : sync.kind === "done" ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              ✓ {sync.success} projects indexed successfully
            </span>
          ) : sync.kind === "error" ? (
            <span className="text-red-600 dark:text-red-400">
              ✗ Sync failed — {sync.message}
            </span>
          ) : status?.synced ? (
            <span className="text-neutral-600 dark:text-neutral-400">
              ✓ {status.count} projects indexed
              {lastSyncedLabel && <> — last synced {lastSyncedLabel}</>}
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              ⚠ Portfolio not synced — projects will use default profile
            </span>
          )}
        </span>
      </div>
      <button
        onClick={handleSync}
        disabled={sync.kind === "running"}
        className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {sync.kind === "running" ? "Syncing…" : "Sync GitHub Portfolio"}
      </button>
    </div>
  );
}
