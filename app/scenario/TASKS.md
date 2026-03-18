# TASKS: AI‑Generated Table of Contents (TOC) for Large PDFs

> **Status**: Active task breakdown
> **Derived from**: [SPEC.md](SPEC.md) · [PLAN.md](PLAN.md)
> **Governed by**: [CONSTITUTION.md](CONSTITUTION.md)
> **Last updated**: 2026-03-18

---

## How to Use This File

- Tasks are grouped by milestone and ordered by dependency
- Each task has a unique ID (`T-###`) for cross-referencing
- **Blocked by** lists prerequisite task IDs
- Status: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Milestone 0 — Project Scaffold

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-001 | Initialise repository structure (`src/`, `public/`, `tests/`) | — | `[x]` |
| T-002 | Set up React (or vanilla TS) project with TypeScript | T-001 | `[x]` |
| T-003 | Configure ESLint + Prettier | T-002 | `[x]` |
| T-004 | Configure GitHub Actions CI workflow (lint, type-check, build) | T-002 | `[x]` |
| T-005 | Configure Azure Static Web Apps deployment via GitHub Actions | T-004 | `[x]` |

---

## Milestone 1 — PDF Upload & Viewer

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-010 | Build PDF upload component (file picker + drag-drop onto page) | T-002 | `[x]` |
| T-011 | Bundle and integrate PDF.js for client-side rendering | T-002 | `[x]` |
| T-012 | Build PDF Viewer pane (scrollable, page-linked) using PDF.js | T-011 | `[x]` |
| T-013 | Load and display bundled sample PDF as default (no upload required) | T-012 | `[ ]` |
| T-014 | Clicking a TOC entry scrolls/jumps PDF Viewer to correct page | T-012 | `[x]` |

---

## Milestone 2 — AI / TOC Generation

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-020 | Extract text + layout metadata from PDF (font size, weight, position) via PDF.js | T-011 | `[x]` |
| T-021 | Implement deterministic heading classifier (primary signals: font size, weight, spatial layout, repetition) | T-020 | `[x]` |
| T-022 | Build hierarchy normalisation pass (resolve inconsistent heading levels) | T-021 | `[x]` |
| T-023 | Implement ambiguity detection — flag nodes that cannot be confidently classified | T-022 | `[x]` |
| T-024 | Flag ambiguous nodes (confidence < 40%) with `?` badge; preserve heading text verbatim (no "Unknown" prefix) | T-023 | `[x]` |
| T-025 | Assign confidence score per TOC node | T-023 | `[x]` |
| T-026 | LLM secondary pass (GitHub Models / OpenAI / Azure) for confidence score + heading level refinement (structure-only output, no free text); configurable via LLM Config modal | T-022 | `[x]` |
| T-026a | Deduplicate running page headers repeated across consecutive pages (gap ≤ 2) | T-021 | `[x]` |
| T-026b | Two-phase extraction: Phase 1 heuristic result shown immediately; Phase 2 LLM verification runs in background and updates if LLM config is available; if no config, LlmConfigModal prompts user | T-026 | `[x]` |
| T-027 | Validate: same PDF + same settings always produces identical TOC (determinism test) | T-021 | `[ ]` |
| T-028 | Validate: zero hallucinated headings against ground-truth test PDFs (hard gate) | T-026 | `[ ]` |

---

## Milestone 3 — TOC Tree UI

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-030 | Build TOC Tree component — hierarchical, collapsible, page-number annotated | T-022 | `[x]` |
| T-031 | Render confidence badge per TOC node: `?` badge when low (< 40%), label terms `Low` / `Mid` / `High` / `Verified`; `✓` after individual user confirmation (sets to 100% `Verified`) | T-030 T-025 | `[x]` |
| T-031a | LLM-verified confidence indicator: LLM-confirmed nodes receive minimum confidence floor (≥ 80% numeric-prefixed, ≥ 65% others); show `·AI` suffix + outline ring; tooltip shows source (LLM-verified vs. heuristic), tier (High / Mid / Low), and key signals | T-031 T-026 | `[x]` |
| T-031b | **Confirm All** button in TOC footer (same row as Save) — confirms all non-manual entries at once, sets `status: user_confirmed` and `confidence: 1.0` (`Verified`) on every node; recorded in audit log | T-031 | `[x]` |
| T-032 | ~~Superseded by T-031~~ | — | `[x]` |
| T-033 | Implement drag-and-drop reordering within TOC tree (`@dnd-kit`) | T-030 | `[x]` |
| T-034 | Implement drag-and-drop re-nesting (change parent-child relationships) | T-033 | `[ ]` |
| T-035 | Inline rename / edit label via **double-click** (Enter/blur to save, Escape to cancel) | T-030 | `[x]` |
| T-036 | Delete TOC nodes manually (remove unwanted AI-detected entries) | T-030 | `[x]` |

---

## Milestone 4 — AI Disclosure Warning

> Required by [CONSTITUTION § 4 — Transparent AI Disclosure](CONSTITUTION.md). Hard gate for ship.

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-040 | Implement persistent AI-generated warning note — anchored at bottom of TOC pane, visible at all times, not permanently dismissible | T-030 | `[x]` |
| T-041 | ~~Acknowledgement modal removed~~ — save gate removed per UX change | — | `[-]` |
| T-042 | ~~Block save until acknowledgement~~ — save gate removed per UX change | — | `[-]` |

---

## Milestone 5 — Audit Trail

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-050 | Define audit record schema (creator, editor, timestamps, method: AI vs manual, diff per edit) | T-002 | `[x]` |
| T-051 | Record audit event on TOC generation (creator, timestamp, method = AI) | T-050 T-026 | `[x]` |
| T-052 | Record audit event on each manual edit (editor, timestamp, node changed, old→new value) | T-050 T-035 | `[x]` |
| T-053 | Make audit log immutable — no delete or overwrite of existing entries | T-051 | `[x]` |
| T-054 | Build Audit Trail Viewer pane (read-only, chronological log) | T-052 | `[x]` |
| T-055 | Add "View Audit Trail" button in TOC Tree pane (left pane) | T-054 | `[x]` |
| T-056 | Clicking "View Audit Trail" opens Audit Trail pane as 3rd rightmost column (PDF Viewer stays in center) | T-055 | `[x]` |
| T-057 | "Close" (✕) button on Audit Trail pane returns to 2-pane layout | T-056 | `[x]` |

---

## Milestone 6 — Persistence

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-060 | Implement save TOC to PDF as native bookmarks / outline | T-033 | `[ ]` |
| T-061 | Embed audit metadata into PDF (XMP or custom metadata field) | T-053 | `[ ]` |
| T-062 | Fallback: write audit metadata to sidecar JSON when static-only constraints prevent PDF embedding | T-061 | `[ ]` |
| T-063 | Validate: reopened PDF retains TOC (bookmarks survive round-trip) | T-060 | `[ ]` |
| T-064 | Validate: shared PDF retains TOC across different PDF viewers | T-063 | `[ ]` |

---

## Milestone 7 — Evaluation & Launch Readiness

| ID | Task | Blocked by | Status |
|----|------|-----------|--------|
| T-069 | Implement dev eval pipeline: `POST /api/save-toc` (Vite middleware) saves TOC Markdown to `eval/results/`; auto-runs `evaluate_toc.py --json` and prints colour-coded rubric table to console | T-026 | `[x]` |
| T-070 | Assemble test PDF corpus (varied layouts, edge cases, ambiguous sections) | — | `[ ]` |
| T-071 | Run hallucination check: 0% fabricated headings (hard gate — any failure blocks ship) | T-028 T-070 | `[ ]` |
| T-072 | Measure precision: ≥ 95% correct headings / total headings | T-071 | `[ ]` |
| T-073 | Measure hierarchy accuracy: ≥ 90% correct parent-child mappings | T-071 | `[ ]` |
| T-074 | Measure low-confidence badge coverage: ≥ 99% of ambiguous sections flagged with `?` (no "Unknown" prefix) | T-071 | `[ ]` |
| T-075 | Verify edit success: user can fully correct every AI error via UI | T-036 | `[ ]` |
| T-076 | Verify persistence: TOC survives reopen + share (100%) | T-064 | `[ ]` |
| T-077 | Verify audit completeness: no missing creator/editor fields (hard gate) | T-061 | `[ ]` |
| T-078 | Verify AI disclosure warning: visible at all times at bottom of TOC pane; no acknowledgement gate before save | T-040 | `[ ]` |
| T-079 | Full deployment smoke test on Azure Static Web Apps | T-005 T-060 | `[ ]` |

---

## Hard Gates (Any Failure = No Ship)

| Gate | Task |
|------|------|
| Zero hallucinated headings | T-071 |
| Incorrect hierarchy with no low-confidence badge fallback | T-074 |
| TOC not regenerated without user consent | T-027 |
| No missing creator/editor metadata | T-077 |
| AI disclosure warning present at all times (no save gate required) | T-078 |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| [CONSTITUTION.md](CONSTITUTION.md) | Governing constraints |
| [SPEC.md](SPEC.md) | What is being built |
| [PLAN.md](PLAN.md) | Tech stack and architecture |
