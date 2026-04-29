# Kanishk's CV Generator

A private, single-user Next.js 14 + TypeScript web app that generates tailored, ATS-optimised one-page CVs (and optional cover letters) from any job description you paste in. Powered by the Tensorix API using the `deepseek/deepseek-r1-0528` reasoning model.

## Features

- Pre-loaded with Kanishk Kapoor's full professional profile
- Paste a JD → get a tailored, ATS-optimised, one-page CV
- Auto role detection (Data Analyst / ML Engineer / LLM Engineer / etc.)
- Optional tailored cover letter
- "Top 3 projects" vs "all relevant projects" toggle
- Optional free-text extra context ("emphasise Snowflake", etc.)
- Live preview, PDF export, copy-as-plain-text
- Light/dark theme toggle
- Mobile responsive, no login, no database

## Tech stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **AI:** Tensorix API (OpenAI-compatible) — `deepseek/deepseek-r1-0528`
- **PDF export:** `html2canvas` + `jsPDF`

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure env vars

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

```
TENSORIX_API_KEY=your_key_here
TENSORIX_BASE_URL=https://api.tensorix.ai/v1
TENSORIX_MODEL=deepseek/deepseek-r1-0528
```

### 3. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Production build

```bash
npm run build
npm start
```

## How it works

1. **Paste a JD** in the left pane.
2. The app auto-detects the role type (~1s debounce) via a lightweight Tensorix call, and pre-fills the dropdown.
3. Tweak options: cover letter toggle, top-3 vs all relevant projects, extra context.
4. Hit **Generate CV** — the backend calls Tensorix with a carefully-crafted system prompt forcing structured JSON output.
5. The returned JSON is rendered into a pixel-perfect A4 preview on the right.
6. **Download PDF** uses `html2canvas` + `jsPDF` to snapshot the preview at 2× scale, so the export matches exactly what you see.
7. **Copy plain text** copies an ATS-friendly text version to clipboard.

## File structure

```
app/
  api/generate/route.ts      ← POST (generate CV/cover) + PUT (detect role)
  components/
    CVPreview.tsx            ← renders CV from JSON; also exports cvToPlainText
    CoverLetterPreview.tsx
    JobDescriptionInput.tsx
    OptionsPanel.tsx
  lib/
    profile.ts               ← hardcoded master profile + fallback CV
    prompts.ts               ← system + user prompt builders
    tensorix.ts              ← OpenAI-compatible client for Tensorix
    types.ts                 ← TypeScript types
  layout.tsx
  page.tsx                   ← main UI
  globals.css
.env.local.example
tailwind.config.ts
next.config.js
tsconfig.json
package.json
```

## Editing your profile

All your profile data lives in **`app/lib/profile.ts`**. When your experience changes, edit that one file and the AI will automatically have the updated master profile for all future CVs.

## Testing the Tensorix connection

Quickest smoke test once dev server is running:

```bash
curl -X PUT http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"We are hiring a senior data analyst with Power BI and SQL experience working on marketing analytics in Dublin."}'
```

Expected response:

```json
{ "role": "Data Analyst" }
```

If you get an error about `TENSORIX_API_KEY`, re-check `.env.local`.

## Notes on the rendering approach

- The CV is rendered as a fixed-width A4 (`210mm × 297mm`) React component with inline styles, so PDF export is a perfect 1:1 snapshot of what's on screen.
- `html2canvas` is used instead of the browser print dialog because it gives deterministic output independent of user print settings.
- The CV sheet ignores dark mode (always white + black text) so the PDF always looks like a real CV.

## Troubleshooting

**"The AI returned a response that could not be parsed as JSON"** — `deepseek-r1` occasionally leaks reasoning text. The client already strips code fences and extracts the outermost `{...}` block, but if this happens repeatedly, lower the temperature further in `app/api/generate/route.ts`.

**PDF is blurry** — already rendering at `scale: 2`. For print-quality bump it to `3` in `app/page.tsx:handleDownloadPDF`.

**Layout overflows a single page** — ask the AI (via "Extra context") to "be more concise" or toggle to "Top 3 projects only".
