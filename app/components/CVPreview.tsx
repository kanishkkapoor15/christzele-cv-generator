"use client";

import { forwardRef } from "react";
import { CVData } from "@/app/lib/types";

interface Props {
  cv: CVData;
}

/**
 * Renders the CV in a tight, ATS-friendly single-page layout.
 * Uses a fixed-width A4 container so the PDF export preserves exactly what's shown.
 */
const CVPreview = forwardRef<HTMLDivElement, Props>(function CVPreview(
  { cv },
  ref
) {
  return (
    <div
      ref={ref}
      className="cv-sheet bg-white text-black mx-auto shadow-lg"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "14mm 15mm",
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: "10.5pt",
        lineHeight: 1.35,
        color: "#111",
      }}
    >
      {/* Header */}
      <header className="text-center">
        <h1
          style={{
            fontSize: "22pt",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            marginBottom: "2px",
          }}
        >
          {cv.name}
        </h1>
        <div style={{ fontSize: "10.5pt", fontWeight: 500, color: "#333" }}>
          {cv.tagline}
        </div>
        <div
          style={{
            fontSize: "9pt",
            color: "#444",
            marginTop: "4px",
          }}
        >
          {cv.contact.phone} · {cv.contact.email} · {cv.contact.location} ·{" "}
          {cv.contact.github} · {cv.contact.linkedin} · {cv.contact.website}
        </div>
      </header>

      <Divider />

      {/* Summary */}
      <Section title="Summary">
        <p style={{ textAlign: "justify" }}>{cv.summary}</p>
      </Section>

      <Divider />

      {/* Skills */}
      <Section title="Skills">
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {cv.skills.map((group, i) => (
            <div key={i}>
              <span style={{ fontWeight: 600 }}>{group.category}:</span>{" "}
              {group.items.join(", ")}
            </div>
          ))}
        </div>
      </Section>

      <Divider />

      {/* Experience */}
      <Section title="Experience">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {cv.experience.map((exp, i) => (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {exp.role} — {exp.company}
                  {exp.location ? `, ${exp.location}` : ""}
                </div>
                <div style={{ fontSize: "9.5pt", color: "#555" }}>
                  {exp.period}
                </div>
              </div>
              <ul
                style={{
                  margin: "3px 0 0 0",
                  paddingLeft: "16px",
                  listStyleType: "disc",
                }}
              >
                {exp.bullets.map((b, j) => (
                  <li key={j} style={{ marginBottom: "1px" }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Divider />

      {/* Education */}
      <Section title="Education">
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {cv.education.map((ed, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{ed.degree}</span> —{" "}
                {ed.institution}
                {ed.note ? ` (${ed.note})` : ""}
              </div>
              <div style={{ fontSize: "9.5pt", color: "#555" }}>{ed.period}</div>
            </div>
          ))}
        </div>
      </Section>

      <Divider />

      {/* Projects */}
      <Section title="Key Achievements">
        <ul
          style={{
            margin: 0,
            paddingLeft: "16px",
            listStyleType: "disc",
          }}
        >
          {cv.projects.map((p, i) => (
            <li key={i} style={{ marginBottom: "2px" }}>
              <span style={{ fontWeight: 600 }}>{p.name}:</span> {p.description}
            </li>
          ))}
        </ul>
      </Section>

      {/* Certifications — hidden entirely if empty so we never render a dangling header */}
      {cv.certifications && cv.certifications.length > 0 && (
        <>
          <Divider />
          <Section title="Certifications">
            <div>{cv.certifications.join(" · ")}</div>
          </Section>
        </>
      )}
    </div>
  );
});

function Divider() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid #222",
        margin: "7px 0",
      }}
    />
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: "10pt",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
          margin: "0 0 4px 0",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

export default CVPreview;

/**
 * Utility: render a CV as plain text (for the Copy-as-plain-text button).
 */
export function cvToPlainText(cv: CVData): string {
  const lines: string[] = [];
  lines.push(cv.name.toUpperCase());
  lines.push(cv.tagline);
  lines.push(
    [
      cv.contact.phone,
      cv.contact.email,
      cv.contact.location,
      cv.contact.github,
      cv.contact.linkedin,
      cv.contact.website,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  lines.push("");
  lines.push("SUMMARY");
  lines.push(cv.summary);
  lines.push("");
  lines.push("SKILLS");
  cv.skills.forEach((g) => lines.push(`${g.category}: ${g.items.join(", ")}`));
  lines.push("");
  lines.push("EXPERIENCE");
  cv.experience.forEach((e) => {
    lines.push(`${e.role} — ${e.company}, ${e.location}    ${e.period}`);
    e.bullets.forEach((b) => lines.push(`• ${b}`));
    lines.push("");
  });
  lines.push("EDUCATION");
  cv.education.forEach((ed) =>
    lines.push(
      `${ed.degree} — ${ed.institution}${ed.note ? ` (${ed.note})` : ""}    ${ed.period}`
    )
  );
  lines.push("");
  lines.push("PROJECTS (github.com/kanishkkapoor15)");
  cv.projects.forEach((p) => lines.push(`• ${p.name}: ${p.description}`));
  lines.push("");
  lines.push("CERTIFICATIONS");
  lines.push(cv.certifications.join(" · "));
  return lines.join("\n");
}
