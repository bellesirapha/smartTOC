# CONSTITUTION: AI‑Generated Table of Contents (TOC)

> **Status**: Governing document — supersedes all other design, product, and engineering decisions where there is conflict.
> **Source**: Extracted from PRD § 1. CONSTITUTION
> **Last updated**: 2026-02-27

---

## Purpose

This Constitution defines the **non-negotiable, highest-order constraints** for the smartTOC system. Every product, design, and engineering decision must comply with the principles below.

---

## Core Principles

### 1. Trust > Coverage

- It is better to **omit** a heading than to include an incorrect one.
- Incorrect hierarchy is **worse** than missing hierarchy.
- When in doubt, leave it out.

---

### 2. Human-in-the-Loop by Design

- AI output is **always editable**.
- Manual correction is a **first-class workflow**, not a fallback.
- The system must never deprive the user of the ability to override AI decisions.

---

### 3. No Hallucinations, Ever

- The system must **never invent** headings, sub-headings, or structure.
- Unclear sections must be labeled explicitly as **"Unknown"**.
- This is a hard gate — any fabricated heading is a blocker for ship.

---

### 4. Transparent AI Disclosure

- The UI must display a **prominent, persistent warning** that the TOC is AI-generated and may not be accurate.
- This warning must be **visible at all times** when viewing AI-generated output and must **not be permanently dismissible**.
- Users must **explicitly acknowledge** the AI-generated nature of the content before saving or exporting.

---

### 5. Deterministic Persistence

- Once saved, the TOC must be **embedded in the PDF and reused**.
- The system must **not regenerate** TOC unless explicitly requested by the user.
- Same PDF + same settings must always produce the same TOC.

---

### 6. Enterprise Accountability

- Every TOC has **provenance**: who generated it, who edited it, when, and how.
- Audit trails are **immutable** — they cannot be deleted or modified after the fact.
- Missing creator/editor metadata is a blocker for ship.

---

### 7. Static-by-Default Delivery

- Initial delivery target is a **static web application**.
- Backend services must be **optional, minimal, and clearly bounded**.
- No hidden server-side dependencies in the default deployment path.

---

## Enforcement

| Principle                  | Violation Type  | Consequence          |
| -------------------------- | --------------- | -------------------- |
| No Hallucinations, Ever    | Hard gate       | No ship              |
| Human-in-the-Loop          | Hard gate       | No ship              |
| Transparent AI Disclosure  | Hard gate       | No ship              |
| Deterministic Persistence  | Hard gate       | No ship              |
| Enterprise Accountability  | Hard gate       | No ship              |
| Trust > Coverage           | Design guidance | Revisit before ship  |
| Static-by-Default Delivery | Architecture    | Revisit before ship  |

---

## Amendment Process

Changes to this Constitution require:

1. Explicit acknowledgement that the change conflicts with the current Constitution.
2. A documented rationale.
3. Update to both this file and the source PRD § 1.
