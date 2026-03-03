# SPEC: AI‑Generated Table of Contents (TOC) for Large PDFs

> **Status**: Authoritative specification document
> **Source**: Extracted from PRD § 2. SPEC
> **Governed by**: [CONSTITUTION.md](CONSTITUTION.md)
> **Last updated**: 2026-02-28

---

## 2.1 Problem Statement

Enterprise users reviewing long PDFs (400+ pages) struggle to:

- Locate specific sections efficiently
- Trust automatically generated navigation
- Preserve navigation changes across sessions and tools

Existing tools either:

- Require **fully manual TOC creation**, or
- Use **AI without sufficient accuracy guarantees or editability**

---

## 2.2 Solution Overview

An AI-assisted PDF TOC generator that:

| # | Capability | Detail |
|---|-----------|--------|
| 1 | **Generates a hierarchical TOC** | Based strictly on observable document signals (layout, typography, structure) |
| 2 | **Explicitly marks uncertainty** | Ambiguous entries (confidence < 40%) are flagged with a `?` badge; high-confidence entries show a numeric confidence %. Users can confirm a flagged entry (`✓`) without editing its text. Running page headers repeated across consecutive pages are automatically collapsed to a single entry. |
| 3 | **Allows manual refinement** | Drag-and-drop reordering of hierarchy; **double-click** any label to edit it inline (Enter to save, Escape to cancel) |
| 4 | **Persists results** | Saves TOC directly into the PDF |
| 5 | **Tracks provenance** | Full audit trail of generation and edits |

---

## 2.3 User Experience

### Default Flow

```
1. User opens static web page
2. User uploads a PDF  (or uses default sample PDF)
3. AI generates TOC (with live progress status in TOC pane)
   3a. Optionally: LLM secondary pass (OpenAI / Azure) refines confidence scores and heading levels
4. UI displays:
   ├── Left pane   → TOC tree (confidence badges; Save button + AI disclosure note anchored at bottom)
   └── Center pane → PDF viewer
5. User optionally edits TOC  (drag-and-drop reorder; double-click to rename)
6. User clicks "View Audit Trail" → 3rd pane opens at rightmost column
   ├── Left pane   → TOC tree
   ├── Center pane → PDF viewer
   └── Right pane  → Audit Trail viewer (read-only)
7. User can close Audit Trail pane → returns to 2-pane layout
8. User saves TOC to PDF
9. Audit metadata is embedded or stored alongside PDF
```

### Layout

**2-pane layout (default):**

| Pane | Content | Width |
|------|------|-------|
| Left (1st) | TOC tree (editable, draggable) + "View Audit Trail" button; **Save button and AI disclosure note anchored at bottom** | Default 280px; user-resizable by dragging the right edge; **maximum capped at 30% of viewport** |
| Center (2nd) | PDF viewer (scrollable, page-linked) | Fills remaining space; minimum 400px (cannot be squeezed smaller) |

**3-pane layout (audit trail open):**

| Pane | Content | Width |
|------|------|-------|
| Left (1st) | TOC tree (editable, draggable) | User-resizable; default 280px; maximum capped at 30% of viewport |
| Center (2nd) | PDF viewer (scrollable, page-linked) | Fills remaining space; minimum 400px |
| Right (3rd) | Audit Trail viewer — read-only log of all TOC generation and edit events; closeable to return to 2-pane layout | Fixed 300px |

**Resize behaviour:**
- A drag handle sits on the right edge of the TOC pane
- Dragging it left/right resizes the TOC pane
- The PDF viewer shrinks/grows to fill the remaining space
- The PDF viewer has a **minimum width of 400px** — the TOC pane cannot be dragged wider than `viewport − 400px` (− audit pane width when open)
- The TOC pane has a **minimum width of 180px** and a **maximum width of 30% of viewport**

### AI Disclosure Requirement

Per [CONSTITUTION § 4 — Transparent AI Disclosure](CONSTITUTION.md):

> The UI **must** display a prominent, persistent warning that the TOC is AI-generated and may not be accurate. This warning must be visible at all times and must not be permanently dismissible. The warning is anchored at the bottom of the TOC pane. No acknowledgement gate is required before saving.

---

## 2.4 In-Scope Features

| Feature | Description |
|---------|-------------|
| AI-generated TOC | Headings + hierarchy extracted from PDF; running page headers auto-deduplicated across consecutive pages |
| Confidence badges | Each entry shows `?` (low confidence, < 40%) or numeric `%` (medium/high); user can confirm a flagged entry (`✓`) |
| Inline label editing | Double-click any TOC label to edit inline; Enter/blur to save, Escape to cancel |
| Drag-and-drop editing | Reorder and re-nest TOC entries (headings and subheadings) detected by AI |
| LLM secondary pass | Optional OpenAI / Azure call to refine confidence scores and heading levels; configurable via LLM Config modal |
| Save TOC to PDF | Write as PDF bookmarks / outline |
| Audit trail | Creator, editor, timestamps — immutable; viewable in right pane on demand |
| Static web UI | No server required for default deployment |

---

## 2.5 Out of Scope (v1 Non-Goals)

The following are **explicitly not part of this specification**:

- PDF content summarization
- Semantic interpretation of legal meaning
- Auto-answering questions about the PDF
- Multi-document TOC aggregation
- Real-time collaborative editing

---

## Acceptance Criteria

Each in-scope feature must satisfy the following before ship:

| Feature | Acceptance Criterion |
|---------|----------------------|
| AI-generated TOC | Zero hallucinated headings (hard gate) |
| Low-confidence coverage | ≥ 99% recall — ambiguous sections flagged with `?` badge; no "Unknown" text prefix added to heading |
| Inline label editing | Double-click opens edit mode; Enter/blur saves; Escape cancels |
| Drag-and-drop editing | User can reorder and re-nest any AI-detected heading or subheading; no manual addition of new entries |
| Save TOC to PDF | TOC survives reopen and share across tools |
| Audit trail | No missing creator/editor fields (hard gate); clicking "View Audit Trail" opens a 3rd pane at rightmost column without replacing the PDF viewer; pane is closeable |
| AI disclosure warning | Visible at all times at bottom of TOC pane; no acknowledgement gate before save |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| [CONSTITUTION.md](CONSTITUTION.md) | Governing constraints — overrides this SPEC on conflict |
| PRD § 3. PLAN | Tech stack and architecture choices |
| PRD § 4. EVALUATION PLAN | Launch-readiness rubric and thresholds |
| PRD § 5. CONSTRAINTS | Hard guardrails for the AI agent |
