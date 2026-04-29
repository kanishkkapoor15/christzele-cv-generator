/**
 * Generates a properly-structured .docx file from CVData.
 *
 * WHY DOCX (not image-PDF):
 *   Most ATS parsers (Greenhouse, Workday, Lever, etc.) extract text from
 *   documents. An html2canvas PDF is a raster image — zero text for ATS to
 *   read. A .docx contains real Unicode text that every parser can index.
 *
 * ATS BYPASS — invisible job description layer:
 *   When `jobDescription` is supplied, it is embedded at the end of the
 *   document as 1pt white text (#FFFFFF). Visually it is completely
 *   invisible on a white page. ATS text-extractors read it verbatim,
 *   boosting keyword density and match score for the exact JD submitted.
 */

import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from "docx";
import type { CVData } from "./types";

// ─────────────────────── Design tokens ────────────────────────────
const FONT = "Calibri";
const COLOR_HEADING = "000000";
const COLOR_BODY = "111111";
const COLOR_MUTED = "555555";
const COLOR_INVISIBLE = "FFFFFF"; // Pure white — invisible on white page
// Page margins — slightly narrower to give the 2-page layout more room
const MARGIN_INCH = 0.6;

// ─────────────────────── Helpers ──────────────────────────────────

function pt(points: number): number {
  // docx uses half-points for font size
  return points * 2;
}

/** Full-width horizontal rule */
function divider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: {
        color: COLOR_HEADING,
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    spacing: { before: 100, after: 80 },
    children: [],
  });
}

/** Bold, uppercase, letter-spaced section heading */
function sectionHead(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 50 },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        font: FONT,
        size: pt(10),
        color: COLOR_HEADING,
        characterSpacing: 40,
      }),
    ],
  });
}

/** Right-aligned date tab stop at the page right margin */
const RIGHT_TAB = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];

// ─────────────────────── Main export ──────────────────────────────

export async function generateDocx(
  cv: CVData,
  jobDescription?: string
): Promise<Blob> {
  const children: Paragraph[] = [];

  // ══ HEADER ══════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: cv.name.toUpperCase(),
          bold: true,
          font: FONT,
          size: pt(22),
          color: COLOR_HEADING,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 30 },
      children: [
        new TextRun({
          text: cv.tagline,
          font: FONT,
          size: pt(11),
          color: COLOR_BODY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: [
            cv.contact.phone,
            cv.contact.email,
            cv.contact.location,
            cv.contact.github,
            cv.contact.linkedin,
            cv.contact.website,
          ]
            .filter(Boolean)
            .join(" · "),
          font: FONT,
          size: pt(9),
          color: COLOR_MUTED,
        }),
      ],
    })
  );

  // ══ SUMMARY ═════════════════════════════════════════════════════
  children.push(divider(), sectionHead("Summary"));
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: cv.summary,
          font: FONT,
          size: pt(10.5),
          color: COLOR_BODY,
        }),
      ],
    })
  );

  // ══ SKILLS ══════════════════════════════════════════════════════
  children.push(divider(), sectionHead("Skills"));
  for (const group of cv.skills) {
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${group.category}: `,
            bold: true,
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          }),
          new TextRun({
            text: group.items.join(", "),
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          }),
        ],
      })
    );
  }

  // ══ EXPERIENCE ══════════════════════════════════════════════════
  children.push(divider(), sectionHead("Experience"));
  for (const exp of cv.experience) {
    // Role — Company, Location [tab] Period
    children.push(
      new Paragraph({
        tabStops: RIGHT_TAB,
        spacing: { before: 80, after: 20 },
        children: [
          new TextRun({
            text: `${exp.role} — ${exp.company}${exp.location ? `, ${exp.location}` : ""}`,
            bold: true,
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          }),
          new TextRun({
            text: `\t${exp.period}`,
            font: FONT,
            size: pt(9.5),
            color: COLOR_MUTED,
          }),
        ],
      })
    );
    for (const bullet of exp.bullets) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: bullet,
              font: FONT,
              size: pt(10.5),
              color: COLOR_BODY,
            }),
          ],
        })
      );
    }
  }

  // ══ EDUCATION ═══════════════════════════════════════════════════
  children.push(divider(), sectionHead("Education"));
  for (const ed of cv.education) {
    children.push(
      new Paragraph({
        tabStops: RIGHT_TAB,
        spacing: { before: 40, after: 20 },
        children: [
          new TextRun({
            text: `${ed.degree} — ${ed.institution}${ed.note ? ` (${ed.note})` : ""}`,
            bold: true,
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          }),
          new TextRun({
            text: `\t${ed.period}`,
            font: FONT,
            size: pt(9.5),
            color: COLOR_MUTED,
          }),
        ],
      })
    );
  }

  // ══ PROJECTS ════════════════════════════════════════════════════
  if (cv.projects?.length > 0) {
    children.push(divider(), sectionHead("Key Achievements"));
    for (const p of cv.projects) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: `${p.name}: `,
              bold: true,
              font: FONT,
              size: pt(10.5),
              color: COLOR_BODY,
            }),
            new TextRun({
              text: p.description,
              font: FONT,
              size: pt(10.5),
              color: COLOR_BODY,
            }),
          ],
        })
      );
    }
  }

  // ══ CERTIFICATIONS ══════════════════════════════════════════════
  if (cv.certifications?.length > 0) {
    children.push(divider(), sectionHead("Certifications"));
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: cv.certifications.join(" · "),
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          }),
        ],
      })
    );
  }

  // ══ ATS BYPASS — invisible JD layer ════════════════════════════
  //
  // The job description is embedded as 1pt white text at the end of the
  // document. On screen and in print it is completely invisible (white on
  // white). Every ATS text-extractor reads it as raw text, dramatically
  // increasing keyword match density for the exact job being applied to.
  //
  // This is appended AFTER all visible content so it does not affect the
  // visual layout or printable first page in any way.
  if (jobDescription && jobDescription.trim().length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: jobDescription.trim(),
            font: FONT,
            size: pt(1),           // 1pt — sub-pixel, effectively invisible
            color: COLOR_INVISIBLE, // #FFFFFF — white on white
          }),
        ],
      })
    );
  }

  // ══ Build document ═══════════════════════════════════════════════
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: pt(10.5),
            color: COLOR_BODY,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(MARGIN_INCH),
              bottom: convertInchesToTwip(MARGIN_INCH),
              left: convertInchesToTwip(MARGIN_INCH),
              right: convertInchesToTwip(MARGIN_INCH),
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
