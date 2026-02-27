# PRD: AI‑Generated Table of Contents (TOC) for Large PDFs

## 0. Summary

This feature delivers an **AI-generated, editable, and auditable Table of Contents (TOC)** for large PDF documents, optimized for **enterprise users in legal, finance, and compliance-heavy workflows**.

The system prioritizes **navigation reliability over speed**, explicitly **avoids hallucinations**, and supports **human correction** before persisting the TOC back into the PDF.

***

## 1. CONSTITUTION

**(Governing principles & development guidelines)**

This Constitution is the highest-order constraint. All product, design, and engineering decisions must comply with it.

### 1.1 Core Principles

1.  **Trust > Coverage**
    *   It is better to omit a heading than to include an incorrect one.
    *   Incorrect hierarchy is worse than missing hierarchy.

2.  **Human-in-the-Loop by Design**
    *   AI output is always editable.
    *   Manual correction is a first-class workflow, not a fallback.

3.  **No Hallucinations, Ever**
    *   The system must never invent headings, sub-headings, or structure.
    *   Unclear sections must be labeled explicitly as **"Unknown"**.

4.  **Transparent AI Disclosure**
    *   The UI must display a **prominent, persistent warning** that the TOC is AI-generated and may not be accurate.
    *   This warning must be visible at all times when viewing AI-generated output, not dismissible permanently.
    *   Users must acknowledge the AI-generated nature of the content before saving or exporting.

5.  **Deterministic Persistence**
    *   Once saved, the TOC must be embedded in the PDF and reused.
    *   The system must not regenerate TOC unless explicitly requested.

6.  **Enterprise Accountability**
    *   Every TOC has provenance: who generated it, who edited it, when, and how.
    *   Audit trails are immutable.

7.  **Static-by-Default Delivery**
    *   Initial delivery target is a **static web application**:
        *   Built with GitHub Copilot
        *   Deployed via **Azure Static Web Apps**
    *   Backend services must be optional, minimal, and clearly bounded.

***

## 2. SPEC

**(What we are building and why)**

### 2.1 Problem Statement

Enterprise users reviewing long PDFs (400+ pages) struggle to:

*   Locate specific sections efficiently
*   Trust automatically generated navigation
*   Preserve navigation changes across sessions and tools

Existing tools either:

*   Require **fully manual TOC creation**, or
*   Use **AI without sufficient accuracy guarantees or editability**

### 2.2 Solution Overview

An AI-assisted PDF TOC generator that:

1.  **Generates a hierarchical TOC**
    *   Based strictly on observable document signals (layout, typography, structure)
2.  **Explicitly marks uncertainty**
    *   Ambiguous sections are labeled “Unknown”
3.  **Allows manual refinement**
    *   Drag-and-drop editing of hierarchy
4.  **Persists results**
    *   Saves TOC directly into the PDF
5.  **Tracks provenance**
    *   Full audit trail of generation and edits

***

### 2.3 User Experience (High Level)

**Default Flow**

1.  User opens static web page
2.  User uploads a PDF (or uses default sample PDF)
3.  AI generates TOC
4.  UI displays:
    *   PDF viewer (right pane)
    *   TOC tree (left pane)
5.  User optionally edits TOC
6.  User saves TOC to PDF
7.  Audit metadata is embedded or stored alongside PDF

***

### 2.4 In-Scope Features

*   AI-generated TOC (headings + hierarchy)
*   Explicit “Unknown” nodes
*   Drag-and-drop TOC editing
*   Save TOC to PDF (bookmarks / outline)
*   Audit trail (creator, editor, timestamps)
*   Static web UI

### 2.5 Out of Scope (Non-Goals)

*   PDF content summarization
*   Semantic interpretation of legal meaning
*   Auto-answering questions about the PDF
*   Multi-document TOC aggregation
*   Real-time collaborative editing (v1)

***

## 3. PLAN

**(Tech stack & architecture choices)**

### 3.1 Frontend (Static Web App)

*   **Framework**: React (or vanilla TS + Web Components)
*   **PDF Rendering**:
    *   PDF.js
*   **TOC UI**:
    *   Tree-based navigation component
    *   Drag-and-drop (e.g., HTML5 DnD or lightweight library)

### 3.2 AI / TOC Generation Layer

**Approach (Hybrid, Deterministic-First)**

1.  **Primary signals (non-LLM)**
    *   Font size
    *   Font weight
    *   Spatial layout
    *   Repetition patterns
2.  **Secondary AI pass (LLM-assisted)**
    *   Normalize hierarchy
    *   Detect ambiguity
    *   Assign confidence scores

> LLM output must be **structure-only**, not free text.

### 3.3 Persistence

*   **PDF Modification**
    *   Write TOC as:
        *   PDF bookmarks / outline
*   **Audit Metadata**
    *   Stored as:
        *   Embedded PDF metadata (where possible)
        *   Or sidecar JSON (if static-only constraints apply)

### 3.4 Deployment

*   **Source**: GitHub
*   **CI/CD**: GitHub Actions
*   **Hosting**: Azure Static Web Apps
*   **Optional API**: Azure Functions (if AI inference is server-side)

***

## 4. EVALUATION PLAN

**(Launch-readiness rubric & thresholds)**

### 4.1 Quality Dimensions

| Dimension          | Metric                            | Ship Threshold     |
| ------------------ | --------------------------------- | ------------------ |
| Hallucination Rate | % of invented headings            | **0% (hard gate)** |
| Precision          | Correct headings / total headings | ≥ 95%              |
| Hierarchy Accuracy | Correct parent-child mappings     | ≥ 90%              |
| Unknown Usage      | Ambiguous sections labeled        | ≥ 99% recall       |
| Edit Success       | User can fix AI errors            | 100%               |
| Persistence        | TOC survives reopen/share         | 100%               |
| Audit Completeness | Missing audit fields              | 0                  |

***

### 4.2 Launch Readiness Rubric (Excerpt)

**Blockers (Any = No Ship)**

*   Any fabricated heading
*   Incorrect hierarchy with no “Unknown” fallback
*   TOC regenerated without user consent
*   Missing creator/editor metadata

**Warnings (Allowed with Mitigation)**

*   Overuse of “Unknown” (>30%)
*   Manual editing required for >20% of headings

***

## 5. CONSTRAINTS

**(Hard guardrails for the agent)**

These rules are **non-negotiable**.

1.  **Do not invent**
    *   No headings or subheadings not present in the PDF
2.  **If unclear → Unknown**
    *   Ambiguity must be explicit
3.  **Prefer omission**
    *   Missing TOC entries are acceptable; false ones are not
4.  **No semantic guessing**
    *   Do not infer intent or meaning beyond structure
5.  **Stable output**
    *   Same PDF + same settings = same TOC
6.  **Explainability**
    *   Every TOC node must map to a page range

***

## 6. JTBD

**(Product scope through user value)**

### 6.1 Core Job

**When** I review long PDFs  
**I want** a reliable way to navigate to specific sections  
**So that** I can find information quickly without mistrusting the tool

***

### 6.2 Desired Outcomes

*   Reduce time-to-find specific sections
*   Increase confidence in document navigation
*   Avoid rework when reopening or sharing PDFs
*   Maintain accountability in regulated workflows

***

### 6.3 Non-Jobs (Explicitly Not Solved)

*   Understanding legal meaning
*   Judging correctness of content
*   Replacing human review
*   Speed-reading or summarization

***

## 7. Open Questions (Post‑PRD)

*   Should audit metadata be embedded in-PDF or external by default?
*   What is the acceptable upper bound for “Unknown” density?
*   Do we allow multiple saved TOC versions per PDF?

***

## 8. Definition of Done (v1)

✅ Static web app deployed to Azure  
✅ Upload + preview PDF  
✅ AI-generated TOC with no hallucinations  
✅ Manual drag-and-drop editing  
✅ Save TOC to PDF  
✅ Immutable audit trail  
✅ Passes launch rubric thresholds

***

