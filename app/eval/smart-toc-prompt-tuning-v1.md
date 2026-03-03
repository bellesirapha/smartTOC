
# AI Prompt Template: PDF → Structure-Faithful Table of Contents
# Purpose: Improve accuracy & lower thumbs-down risk by guiding the model toward
# conservative, layout-based, source-faithful structural extraction.

---

## 🎯 Goal

Extract a **Table of Contents–style hierarchical outline** from a PDF.  
Focus on **structural accuracy**, **source-faithful phrasing**, and **transparent confidence**, not summarization or interpretation.

This is **not** a creative mind map.  
This is **not** a semantic summary.  
This is a **structure detection task**.

---

## 📌 Core Requirements (Mitigation Matrix Applied)

### 1. Hierarchy Fidelity (High Priority)
- Use **layout cues first**: headings, numbering, bold text, indentation, whitespace.
- If structure is unclear, mark as **Medium/Low Confidence** instead of guessing.
- Do **not** combine unrelated sections.

### 2. Source‑Faithful Labels (Avoid Over‑summaries)
- Prefer **original headings or first clause** of the section.
- Avoid paraphrasing unless strictly needed.
- No over‑confident or interpretive labels.

### 3. Omission Transparency
- Include an **“Unmapped or Uncertain Sections”** block when:
  - OCR confidence is low,
  - heading boundaries are ambiguous,
  - text spans overlap or are unreadable.

### 4. Cross‑Reference Awareness
- Detect references like “See Section 4.2” and preserve them as-is.
- Do **not** fabricate or reinterpret relationships.

### 5. Confidence Indicators
For each node, include:
- **(High Confidence)** when structure is explicit in headings/numbering.
- **(Medium Confidence)** when text segmentation is plausible but not explicit.
- **(Low Confidence)** when the model is uncertain.

### 6. Granularity Controls
Produce the outline in **Standard Mode**:
- Balanced depth (2–3 levels max).
- Optional deeper expansion only where structure is clearly defined.

---

# ✅ Required Markdown Output Specification — Table of Contents

Follow the instructions below **exactly** to generate a valid Table of Contents output.
The format must be parseable by `evaluate_toc.py` for automated evaluation against a gold TOC.

---

## 1. Title Block

Begin with a single level-1 Markdown heading:

```
# Table of Contents — <Document Title>
```

---

## 2. Entry Format

Each entry must be a Markdown bullet line. Use **exactly** this format:

| Level | Format |
|-------|--------|
| Top-level (Chapter) | `- **<heading text>** — p. <page>` |
| Sub-section (Level 2) | `  - <heading text> — p. <page>` |
| Sub-sub-section (Level 3) | `    - <heading text> — p. <page>` |

- Indent with **2 spaces per level** (no tabs).
- Use an **em dash** (`—`) before `p.` — not a hyphen.
- Page number must be a plain integer.
- **Bold** (`**...**`) applies only to top-level (level 1) entries.
- Preserve numbering prefixes verbatim (`1.`, `2.3`, `Appendix A.`).
- Do **not** append confidence annotations to labels.

### Example output

```markdown
# Table of Contents — Financial Estate Planning Workbook

- **1. Household Overview** — p. 3
  - 1.1 Key Contacts — p. 4
  - 1.2 Family & Dependents — p. 5

- **2. Asset Inventory** — p. 7
  - 2.1 Cash & Banking — p. 8
  - 2.2 Investments — p. 9
```

---

## 3. Uncertain Sections

If a block of pages has unclear structure, add a separate level-1 entry at the end:

```markdown
- **Unmapped or Uncertain Sections**
  - <description of ambiguous content> — p. <page>
```

Do **not** guess or fabricate headings for uncertain sections.
