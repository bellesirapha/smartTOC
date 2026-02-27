# 📑 smartTOC

> AI-generated, editable, and auditable Table of Contents for large PDF documents — built as a fully static web application.

---

## Overview

**smartTOC** is a browser-based tool that helps enterprise users navigate long PDFs (400+ pages) by automatically generating a hierarchical Table of Contents (TOC). It is designed for legal, finance, and compliance-heavy workflows where **accuracy, transparency, and accountability** are non-negotiable.

Key design principles (see [CONSTITUTION](app/scenario/CONSTITUTION.md)):

- **Trust over Coverage** — it is better to omit a heading than to invent one.
- **Human-in-the-Loop** — AI output is always editable; manual correction is a first-class workflow.
- **No Hallucinations, Ever** — ambiguous sections are labelled "Unknown", never guessed.
- **Transparent AI Disclosure** — a persistent, non-dismissible warning is shown whenever AI-generated content is displayed.
- **Enterprise Accountability** — every TOC has an immutable audit trail recording who generated and edited it, and when.

---

## Features

| Feature | Description |
|---------|-------------|
| **PDF Upload** | Drag-and-drop or file picker; PDF is processed entirely in the browser |
| **AI TOC Generation** | Deterministic extraction using font size, weight, and spatial layout via PDF.js |
| **"Unknown" nodes** | Ambiguous sections are explicitly labelled instead of silently skipped |
| **Confidence scores** | Each TOC entry shows how confidently the AI classified it |
| **Drag-and-drop editing** | Reorder top-level TOC entries with a pointer sensor |
| **Inline label editing** | Double-click any TOC entry to rename it |
| **Delete entries** | Remove unwanted AI-detected entries |
| **Audit trail** | Immutable, chronological log of all generation and edit events |
| **AI disclosure banner** | Always-visible warning; acknowledgement required before saving |
| **Resizable layout** | Drag the divider between the TOC and PDF panes |

### Layout

**2-pane (default):**
```
┌─────────────────┬────────────────────────┐
│  TOC Tree       │  PDF Viewer            │
│  (editable)     │  (PDF.js)              │
│  [Audit Trail]  │                        │
└─────────────────┴────────────────────────┘
```

**3-pane (audit trail open):**
```
┌─────────────────┬────────────────────────┬──────────────────┐
│  TOC Tree       │  PDF Viewer            │  Audit Trail  [✕]│
└─────────────────┴────────────────────────┴──────────────────┘
```

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| PDF rendering | PDF.js (`pdfjs-dist`) |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Linting | ESLint + TypeScript-ESLint |
| Formatting | Prettier |
| CI/CD | GitHub Actions |
| Hosting | Azure Static Web Apps |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
cd app/web
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build
```

The production-ready static bundle is output to `app/web/dist/`.

### Lint & Type-check

```bash
npm run lint
npx tsc --noEmit
```

---

## Project Structure

```
smartTOC/
├── app/
│   ├── web/                  # React + TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/   # UI components (TocTree, PdfViewer, AuditTrailPane, …)
│   │   │   ├── lib/          # Core logic (tocExtractor, auditLog)
│   │   │   └── types/        # Domain types (TocNode, AuditLog, AppState)
│   │   └── package.json
│   └── scenario/             # Product documentation
│       ├── CONSTITUTION.md   # Governing principles (highest priority)
│       ├── PRD.md            # Full product requirements
│       ├── SPEC.md           # Authoritative feature specification
│       ├── PLAN.md           # Tech stack & architecture decisions
│       └── TASKS.md          # Task breakdown by milestone
├── .github/workflows/ci.yml  # CI: type-check + build + artifact upload
└── LICENSE                   # MIT
```

---

## How It Works

1. **Upload** a PDF (drag-and-drop or file picker).
2. Click **✨ Generate** to extract the TOC — the algorithm:
   - Collects all text items across every page via PDF.js.
   - Identifies the body font size (statistical mode).
   - Filters heading candidates by font size delta and bold weight.
   - Deduplicates repeated text (e.g. headers/footers).
   - Clusters font sizes into heading levels (largest = H1).
   - Assigns a confidence score; anything below the threshold is labelled **"Unknown"**.
   - Builds a nested hierarchy from the flat list.
3. **Edit** the TOC — rename, delete, or reorder entries.
4. **Acknowledge** the AI-generated content warning.
5. Click **💾 Save TOC** — the audit log records the save event. *(PDF bookmark embedding requires a server-side component and is planned for a future milestone.)*
6. Optionally open the **Audit Trail** pane (🕒 Audit Trail button) to review the immutable change history.

---

## Roadmap

Completed milestones:

- ✅ Milestone 0 — Project scaffold (React, TypeScript, ESLint, CI)
- ✅ Milestone 1 — PDF upload & viewer
- ✅ Milestone 2 — AI / TOC generation (deterministic, confidence-scored, "Unknown" labelling)
- ✅ Milestone 3 — TOC tree UI (drag-and-drop, inline edit, delete)
- ✅ Milestone 4 — AI disclosure warning
- ✅ Milestone 5 — Audit trail

Planned:

- ⬜ Milestone 6 — Persistence (save TOC as native PDF bookmarks; audit metadata embedding)
- ⬜ Milestone 7 — Evaluation & launch readiness (hallucination hard gate, quality metrics)

See [TASKS.md](app/scenario/TASKS.md) for the full task breakdown.

---

## Contributing

This project follows a [CONSTITUTION](app/scenario/CONSTITUTION.md)-driven development model. Before contributing, read the Constitution — it is the highest-order constraint and overrides all other design and engineering decisions.

---

## License

[MIT](LICENSE) © 2026 Belle Podeanu
