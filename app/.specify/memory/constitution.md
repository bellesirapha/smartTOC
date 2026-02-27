# smartTOC Constitution

> This Constitution is the highest-order constraint. All product, design, and engineering decisions must comply with it.

## Core Principles

### I. Trust > Coverage
It is better to omit a heading than to include an incorrect one; Incorrect hierarchy is worse than missing hierarchy; When in doubt, leave it out.

### II. Human-in-the-Loop by Design
AI output is always editable; Manual correction is a first-class workflow, not a fallback; The system must never deprive the user of the ability to override AI decisions.

### III. No Hallucinations, Ever (NON-NEGOTIABLE)
The system must never invent headings, sub-headings, or structure; Unclear sections must be labeled explicitly as "Unknown"; Any fabricated heading is a hard blocker — no ship.

### IV. Transparent AI Disclosure (NON-NEGOTIABLE)
The UI must display a prominent, persistent warning that the TOC is AI-generated and may not be accurate; This warning must be visible at all times when viewing AI-generated output and must not be permanently dismissible; Users must explicitly acknowledge the AI-generated nature of the content before saving or exporting.

### V. Deterministic Persistence
Once saved, the TOC must be embedded in the PDF and reused; The system must not regenerate TOC unless explicitly requested by the user; Same PDF + same settings must always produce the same TOC.

### VI. Enterprise Accountability
Every TOC has provenance: who generated it, who edited it, when, and how; Audit trails are immutable — entries are append-only, never deleted or modified; Missing creator/editor metadata is a hard blocker — no ship.

### VII. Static-by-Default Delivery
Initial delivery target is a static web application built with GitHub Copilot and deployed via Azure Static Web Apps; Backend services must be optional, minimal, and clearly bounded; No hidden server-side dependencies in the default deployment path.

## Hard Gates (Any Failure = No Ship)

| Gate | Principle |
|------|-----------|
| Zero hallucinated headings | III |
| Incorrect hierarchy with no "Unknown" fallback | I + III |
| TOC regenerated without user consent | V |
| Missing creator/editor metadata | VI |
| AI disclosure warning not visible or not acknowledged before save/export | IV |

## Governance

This Constitution supersedes all other product, design, and engineering practices where there is conflict; All implementation decisions must be verified against these principles before merging; Amendments require explicit acknowledgement of the conflict, a documented rationale, and updates to both this file and PRD § 1; Complexity must be justified against the principles — simplicity is preferred where constraints are equally satisfied.

**Version**: 1.0.0 | **Ratified**: 2026-02-27 | **Last Amended**: 2026-02-27
