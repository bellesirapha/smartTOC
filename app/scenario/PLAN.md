# PLAN: AI‑Generated Table of Contents (TOC) for Large PDFs

> **Status**: Authoritative technical plan
> **Source**: Extracted from PRD § 3. PLAN
> **Governed by**: [CONSTITUTION.md](CONSTITUTION.md)
> **Spec reference**: [SPEC.md](SPEC.md)
> **Last updated**: 2026-02-27

---

## 3.1 Frontend (Static Web App)

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | React or vanilla TS + Web Components | Keep dependency footprint minimal |
| PDF Rendering | PDF.js | Client-side, no server required |
| TOC UI | Tree-based navigation component | Must support drag-and-drop reordering and re-nesting |
| Drag-and-drop | HTML5 DnD or lightweight library | Avoid heavy dependencies |

### UI Layout

**2-pane (default):**

```
┌─────────────────┬────────────────────────┐
│  TOC Tree       │  PDF Viewer            │
│  (editable)     │  (PDF.js)              │
│                 │                        │
│  [View Audit    │                        │
│   Trail]        │                        │
└─────────────────┴────────────────────────┘
```

**3-pane (audit trail open):**

```
┌─────────────────┬────────────────────────┬──────────────────┐
│  TOC Tree       │  PDF Viewer            │  Audit Trail     │
│  (editable)     │  (PDF.js)              │  (read-only)  [✕]│
└─────────────────┴────────────────────────┴──────────────────┘
```

> Closing the Audit Trail pane returns to 2-pane layout. PDF Viewer is never replaced.

---

## 3.2 AI / TOC Generation Layer

**Approach: Hybrid, Deterministic-First**

### Step 1 — Primary signals (non-LLM)

Extract structure from observable document properties only:

| Signal | Purpose |
|--------|---------|
| Font size | Distinguish headings from body text |
| Font weight | Bold text as a heading indicator |
| Spatial layout | Indentation, margins, whitespace patterns |
| Repetition patterns | Consistent formatting across sections |

### Step 2 — Secondary AI pass (LLM-assisted)

Applied only after deterministic extraction:

| Task | Purpose |
|------|---------|
| Normalize hierarchy | Resolve inconsistencies in heading levels |
| Detect ambiguity | Flag sections where structure is unclear |
| Assign confidence scores | Quantify certainty per TOC node |

> **Constraint**: LLM output must be **structure-only** — no free text, no invented headings, no semantic interpretation.  
> See [CONSTITUTION § 3 — No Hallucinations, Ever](CONSTITUTION.md).

### Ambiguity Handling

- Any section that cannot be confidently classified → labeled **"Unknown"**
- "Unknown" nodes are surfaced to the user for manual correction
- The system must never silently discard or guess ambiguous sections

---

## 3.3 Persistence

### PDF Modification

| What | How |
|------|-----|
| TOC structure | Written as **PDF bookmarks / outline** (native PDF feature) |

### Audit Metadata

| Scenario | Storage |
|----------|---------|
| Default | Embedded PDF metadata |
| Static-only constraints apply | Sidecar JSON file alongside the PDF |

Audit record must capture at minimum:

- **Creator** — who triggered TOC generation
- **Editor(s)** — who made manual edits, and what changed
- **Timestamps** — generation time and each edit time
- **Method** — AI-generated vs. manually added per node

> Audit trails are **immutable**. See [CONSTITUTION § 6 — Enterprise Accountability](CONSTITUTION.md).

---

## 3.4 Deployment

| Concern | Choice |
|---------|--------|
| Source control | GitHub |
| CI/CD | GitHub Actions |
| Hosting | Azure Static Web Apps |
| Optional API (if AI is server-side) | Azure Functions |

### Deployment Constraints

- Default deployment must be **fully static** — no required backend
- Backend (Azure Functions) is **opt-in only**, clearly bounded
- See [CONSTITUTION § 7 — Static-by-Default Delivery](CONSTITUTION.md)

### CI/CD Pipeline (Recommended)

```
push to main
  └── GitHub Actions
        ├── Lint + type-check
        ├── Unit tests
        ├── Build static bundle
        └── Deploy → Azure Static Web Apps
```

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| [CONSTITUTION.md](CONSTITUTION.md) | Governing constraints — overrides this PLAN on conflict |
| [SPEC.md](SPEC.md) | What is being built — this PLAN describes how |
| PRD § 4. EVALUATION PLAN | Launch-readiness rubric and quality thresholds |
| PRD § 5. CONSTRAINTS | Hard guardrails for the AI agent |
