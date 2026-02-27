# SPEC: AI‑Generated Table of Contents (TOC) for Large PDFs

> **Status**: Authoritative specification document
> **Source**: Extracted from PRD § 2. SPEC
> **Governed by**: [CONSTITUTION.md](CONSTITUTION.md)
> **Last updated**: 2026-02-27

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
| 2 | **Explicitly marks uncertainty** | Ambiguous sections are labeled "Unknown" |
| 3 | **Allows manual refinement** | Drag-and-drop editing of hierarchy |
| 4 | **Persists results** | Saves TOC directly into the PDF |
| 5 | **Tracks provenance** | Full audit trail of generation and edits |

---

## 2.3 User Experience

### Default Flow

```
1. User opens static web page
2. User uploads a PDF  (or uses default sample PDF)
3. AI generates TOC
4. UI displays:
   ├── Left pane   → TOC tree
   └── Center pane → PDF viewer
5. User optionally edits TOC  (drag-and-drop)
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
| Left (1st) | TOC tree (editable, draggable) + "View Audit Trail" button | Default 280px; user-resizable by dragging the right edge |
| Center (2nd) | PDF viewer (scrollable, page-linked) | Fills remaining space; minimum 400px (cannot be squeezed smaller) |

**3-pane layout (audit trail open):**

| Pane | Content | Width |
|------|------|-------|
| Left (1st) | TOC tree (editable, draggable) | User-resizable; default 280px |
| Center (2nd) | PDF viewer (scrollable, page-linked) | Fills remaining space; minimum 400px |
| Right (3rd) | Audit Trail viewer — read-only log of all TOC generation and edit events; closeable to return to 2-pane layout | Fixed 300px |

**Resize behaviour:**
- A drag handle sits on the right edge of the TOC pane
- Dragging it left/right resizes the TOC pane
- The PDF viewer shrinks/grows to fill the remaining space
- The PDF viewer has a **minimum width of 400px** — the TOC pane cannot be dragged wider than `viewport − 400px` (− audit pane width when open)
- The TOC pane has a **minimum width of 180px**

### AI Disclosure Requirement

Per [CONSTITUTION § 4 — Transparent AI Disclosure](CONSTITUTION.md):

> The UI **must** display a prominent, persistent warning that the TOC is AI-generated and may not be accurate. This warning must be visible at all times and must not be permanently dismissible. Users must explicitly acknowledge before saving or exporting.

---

## 2.4 In-Scope Features

| Feature | Description |
|---------|-------------|
| AI-generated TOC | Headings + hierarchy extracted from PDF |
| "Unknown" nodes | Explicit labeling of ambiguous sections |
| Drag-and-drop editing | Reorder and re-nest TOC entries (headings and subheadings) detected by AI |
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
| "Unknown" nodes | ≥ 99% recall on ambiguous sections |
| Drag-and-drop editing | User can reorder and re-nest any AI-detected heading or subheading; no manual addition of new entries |
| Save TOC to PDF | TOC survives reopen and share across tools |
| Audit trail | No missing creator/editor fields (hard gate); clicking "View Audit Trail" opens a 3rd pane at rightmost column without replacing the PDF viewer; pane is closeable |
| AI disclosure warning | Visible at all times; acknowledgement required before save/export |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| [CONSTITUTION.md](CONSTITUTION.md) | Governing constraints — overrides this SPEC on conflict |
| PRD § 3. PLAN | Tech stack and architecture choices |
| PRD § 4. EVALUATION PLAN | Launch-readiness rubric and thresholds |
| PRD § 5. CONSTRAINTS | Hard guardrails for the AI agent |
