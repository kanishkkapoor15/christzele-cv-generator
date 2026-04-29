"use client";

import { useEffect, useRef, useState } from "react";
import JobDescriptionInput from "./components/JobDescriptionInput";
import OptionsPanel from "./components/OptionsPanel";
import CVPreview, { cvToPlainText } from "./components/CVPreview";
import CoverLetterPreview from "./components/CoverLetterPreview";
import {
  CVData,
  GenerateResponse,
  KeywordCoverageReport,
  RoleType,
} from "./lib/types";
import { FALLBACK_CV } from "./lib/profile";
import { generateDocx } from "./lib/docx-export";

type Tab = "cv" | "cover";

export default function HomePage() {
  const [jobDescription, setJobDescription] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("Assistant Restaurant Manager");
  const [detectedRole, setDetectedRole] = useState<RoleType | undefined>();
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [allRelevantProjects, setAllRelevantProjects] = useState(false);
  const [extraContext, setExtraContext] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cv, setCv] = useState<CVData | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [coverLetterWarning, setCoverLetterWarning] = useState<string | null>(
    null
  );
  const [coverage, setCoverage] = useState<KeywordCoverageReport | null>(null);
  const [tab, setTab] = useState<Tab>("cv");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const cvRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);

  // Theme toggle
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Debounced role auto-detection
  useEffect(() => {
    if (jobDescription.trim().length < 60) {
      setDetectedRole(undefined);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/generate", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobDescription }),
        });
        const data = (await res.json()) as { role: RoleType | null };
        if (data.role) {
          setDetectedRole(data.role);
          setRoleType(data.role);
        }
      } catch {
        // Silent — the dropdown is still manually editable
      }
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDescription]);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    setCv(null);
    setCoverLetter(null);
    setCoverLetterWarning(null);
    setCoverage(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          roleType,
          includeCoverLetter,
          allRelevantProjects,
          extraContext,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as GenerateResponse;
      setCv(data.cv);
      if (data.coverLetter) setCoverLetter(data.coverLetter);
      if (data.coverLetterWarning) setCoverLetterWarning(data.coverLetterWarning);
      if (data.keywordCoverage) setCoverage(data.keywordCoverage);
      setTab("cv");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPDF() {
    const targetRef = tab === "cv" ? cvRef : coverRef;
    const node = targetRef.current;
    if (!node) return;

    // Dynamic imports so these large libs don't bloat initial load
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    // scale: 2 keeps text crisp at 144 DPI. Higher scales balloon file size
    // without visible improvement for text-heavy CVs.
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    // JPEG at 0.92 instead of PNG: visually identical for text + solid
    // backgrounds, 15-25× smaller. A one-page CV now lands at ~400-700 KB
    // instead of 15 MB.
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    // A4 in mm = 210 x 297
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    // "FAST" compression in addImage is actually the highest practical
    // compression level and gives a further ~10% win for free.
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");

    const base =
      tab === "cv"
        ? `Christzele_Siao_CV_${roleType.replace(/[^a-z0-9]+/gi, "_")}`
        : `Christzele_Siao_CoverLetter_${roleType.replace(/[^a-z0-9]+/gi, "_")}`;
    pdf.save(`${base}.pdf`);
  }

  async function handleDownloadDocx() {
    if (!cv) return;
    // Pass the job description so the ATS white-text bypass layer is included
    const blob = await generateDocx(cv, jobDescription);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Christzele_Siao_CV_${roleType.replace(/[^a-z0-9]+/gi, "_")}_ATS.docx`;

    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopyPlainText() {
    if (tab === "cv" && cv) {
      await navigator.clipboard.writeText(cvToPlainText(cv));
    } else if (tab === "cover" && coverLetter) {
      await navigator.clipboard.writeText(coverLetter);
    }
    setCopyHint("Copied!");
    setTimeout(() => setCopyHint(null), 1500);
  }

  function handleLoadFallback() {
    setCv(FALLBACK_CV);
    setTab("cv");
  }

  const canGenerate = jobDescription.trim().length >= 20 && !loading;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Header */}
        <header className="no-print mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Christzele&apos;s CV Generator
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Paste a job description — get a tailored, ATS-optimised, one-page
              CV (and optionally a cover letter) in seconds.
            </p>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {theme === "dark" ? "Light" : "Dark"} mode
          </button>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* LEFT — Inputs */}
          <div className="no-print flex flex-col gap-5">
            <JobDescriptionInput
              value={jobDescription}
              onChange={setJobDescription}
              disabled={loading}
            />

            <OptionsPanel
              roleType={roleType}
              detectedRole={detectedRole}
              onRoleChange={setRoleType}
              includeCoverLetter={includeCoverLetter}
              onIncludeCoverLetterChange={setIncludeCoverLetter}
              allRelevantProjects={allRelevantProjects}
              onAllRelevantProjectsChange={setAllRelevantProjects}
              extraContext={extraContext}
              onExtraContextChange={setExtraContext}
              disabled={loading}
            />

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {loading ? "Generating…" : "Generate CV"}
            </button>

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <div className="font-semibold">Something went wrong</div>
                <div className="mt-1">{error}</div>
                <button
                  onClick={handleLoadFallback}
                  className="mt-2 text-xs font-semibold underline"
                >
                  Load fallback CV instead
                </button>
              </div>
            )}

            {coverLetterWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <div className="font-semibold">Cover letter not generated</div>
                <div className="mt-1 text-xs">{coverLetterWarning}</div>
              </div>
            )}

            {coverage && <CoveragePanel coverage={coverage} />}
          </div>

          {/* RIGHT — Preview */}
          <div className="flex flex-col gap-4">
            {/* Tabs + actions */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
                <TabButton
                  active={tab === "cv"}
                  onClick={() => setTab("cv")}
                  label="CV"
                />
                <TabButton
                  active={tab === "cover"}
                  onClick={() => setTab("cover")}
                  disabled={!coverLetter}
                  label="Cover Letter"
                />
              </div>
              <div className="flex items-center gap-2">
                {copyHint && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {copyHint}
                  </span>
                )}
                <button
                  onClick={handleCopyPlainText}
                  disabled={tab === "cv" ? !cv : !coverLetter}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Copy plain text
                </button>
                {/* DOCX — real text, ATS-friendly, with white-text JD bypass */}
                <button
                  onClick={handleDownloadDocx}
                  disabled={!cv || tab !== "cv"}
                  title="Real text — ATS can read every keyword. Includes invisible JD layer for keyword boosting."
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Download DOCX
                  <span className="ml-1 rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-bold text-white">
                    ATS
                  </span>
                </button>
                {/* PDF — pixel-perfect for email / printing, not ATS */}
                <button
                  onClick={handleDownloadPDF}
                  disabled={tab === "cv" ? !cv : !coverLetter}
                  title="Pixel-perfect visual export — use for emailing or printing, not ATS submission."
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Download PDF
                </button>
              </div>
            </div>

            {/* Preview viewport */}
            <div className="sheet-viewport">
              {loading ? (
                <SkeletonSheet />
              ) : tab === "cv" && cv ? (
                <CVPreview ref={cvRef} cv={cv} />
              ) : tab === "cover" && coverLetter ? (
                <CoverLetterPreview ref={coverRef} text={coverLetter} />
              ) : (
                <EmptyState />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}

function SkeletonSheet() {
  return (
    <div
      className="cv-sheet mx-auto animate-pulse bg-white p-10 shadow-lg"
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      <div className="mx-auto mb-3 h-6 w-1/2 rounded bg-neutral-200" />
      <div className="mx-auto mb-6 h-3 w-2/3 rounded bg-neutral-200" />
      <div className="mb-2 h-3 w-1/3 rounded bg-neutral-200" />
      <div className="mb-4 space-y-2">
        <div className="h-2 w-full rounded bg-neutral-200" />
        <div className="h-2 w-[95%] rounded bg-neutral-200" />
        <div className="h-2 w-[90%] rounded bg-neutral-200" />
      </div>
      <div className="mb-2 h-3 w-1/4 rounded bg-neutral-200" />
      <div className="mb-4 space-y-2">
        <div className="h-2 w-full rounded bg-neutral-200" />
        <div className="h-2 w-[92%] rounded bg-neutral-200" />
        <div className="h-2 w-[88%] rounded bg-neutral-200" />
      </div>
      <div className="mb-2 h-3 w-1/4 rounded bg-neutral-200" />
      <div className="space-y-2">
        <div className="h-2 w-full rounded bg-neutral-200" />
        <div className="h-2 w-[96%] rounded bg-neutral-200" />
        <div className="h-2 w-[80%] rounded bg-neutral-200" />
      </div>
    </div>
  );
}

/**
 * Compact panel showing the local JD analyser's keyword coverage report.
 * Essentials/preferred coverage % + lists of covered, missing, and
 * auto-injected keywords. Helps the user see at a glance whether the CV
 * actually hit every required keyword for the role.
 */
function CoveragePanel({ coverage }: { coverage: KeywordCoverageReport }) {
  const { essential, preferred, overallPct } = coverage;
  const hasAnything =
    essential.covered.length +
      essential.missing.length +
      preferred.covered.length +
      preferred.missing.length >
    0;
  if (!hasAnything) return null;

  const essBarColor =
    essential.pct === 100
      ? "bg-emerald-500"
      : essential.pct >= 80
      ? "bg-amber-500"
      : "bg-red-500";
  const prefBarColor =
    preferred.pct >= 80
      ? "bg-emerald-500"
      : preferred.pct >= 50
      ? "bg-amber-500"
      : "bg-neutral-400";

  return (
    <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-xs dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-neutral-800 dark:text-neutral-100">
          ATS Keyword Coverage
        </div>
        <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
          {overallPct}%
        </div>
      </div>

      {essential.covered.length + essential.missing.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <span>★ Essential</span>
            <span>
              {essential.covered.length}/
              {essential.covered.length + essential.missing.length} ·{" "}
              {essential.pct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded bg-neutral-200 dark:bg-neutral-800">
            <div
              className={`h-1.5 rounded ${essBarColor} transition-all`}
              style={{ width: `${essential.pct}%` }}
            />
          </div>
          {essential.missing.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
              <span className="font-medium">Still missing after repair:</span>{" "}
              {essential.missing.join(", ")}
            </div>
          )}
        </div>
      )}

      {preferred.covered.length + preferred.missing.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <span>○ Preferred</span>
            <span>
              {preferred.covered.length}/
              {preferred.covered.length + preferred.missing.length} ·{" "}
              {preferred.pct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded bg-neutral-200 dark:bg-neutral-800">
            <div
              className={`h-1.5 rounded ${prefBarColor} transition-all`}
              style={{ width: `${preferred.pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="cv-sheet mx-auto flex items-center justify-center bg-white p-10 shadow-lg"
      style={{ width: "210mm", minHeight: "297mm" }}
    >
      <div className="max-w-sm text-center">
        <div className="mb-2 text-lg font-semibold text-neutral-800">
          No CV generated yet
        </div>
        <div className="text-sm text-neutral-500">
          Paste a job description on the left and hit&nbsp;
          <span className="font-semibold">Generate CV</span>. The tailored
          one-page CV will appear here.
        </div>
      </div>
    </div>
  );
}
