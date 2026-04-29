"use client";

import { forwardRef } from "react";
import { PROFILE } from "@/app/lib/profile";

interface Props {
  text: string;
}

const CoverLetterPreview = forwardRef<HTMLDivElement, Props>(
  function CoverLetterPreview({ text }, ref) {
    const today = new Date().toLocaleDateString("en-IE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    return (
      <div
        ref={ref}
        className="cv-sheet bg-white text-black mx-auto shadow-lg"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "22mm 22mm",
          fontFamily:
            "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          fontSize: "11pt",
          lineHeight: 1.5,
          color: "#111",
        }}
      >
        <div style={{ marginBottom: "18pt" }}>
          <div style={{ fontWeight: 700, fontSize: "14pt" }}>
            {PROFILE.name}
          </div>
          <div style={{ fontSize: "10pt", color: "#444" }}>
            {PROFILE.contact.email} · {PROFILE.contact.phone} ·{" "}
            {PROFILE.contact.location}
          </div>
          <div style={{ fontSize: "10pt", color: "#444" }}>
            {PROFILE.contact.linkedin} · {PROFILE.contact.github}
          </div>
        </div>

        <div style={{ marginBottom: "14pt", fontSize: "10pt", color: "#444" }}>
          {today}
        </div>

        <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
      </div>
    );
  }
);

export default CoverLetterPreview;
