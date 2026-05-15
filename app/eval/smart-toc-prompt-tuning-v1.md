
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
- Capture **every heading the document actually contains**, up to and including **3 levels of depth** (chapter → section → sub-section).
- Do **not** stop at chapter level when the source clearly contains sub-sections — the evaluator measures depth-stratified recall and will report `L3 = 0.000` if leaves are dropped.
- Only collapse a level when the document genuinely has none at that depth.
- Optional 4th-level expansion only when sub-sub-sections are explicit (numbered or visually distinct).

### 7. Detecting Sub-section Headings Without Numbering
Many real-world PDFs use visual styling alone (bold or slightly larger
font) to mark sub-sections, with no `1.1` / `2.3` numeric prefix. These
**must still be emitted as level-3 entries**.
- A short Title-Case phrase (≤ 80 characters) that names a topic — e.g.
  *"Types of Cyber Threats"*, *"Authentication Mechanisms"*,
  *"Shared Responsibility Model"* — is almost certainly a sub-section
  heading when it follows a chapter-style heading.
- Trust the heuristic level signal even when its confidence is low.
  Do **not** drop a candidate solely because it lacks numbering or
  because the heuristic confidence is below 0.5.
- The cover-page document title (largest font, page 1 only) is **not**
  a heading; it lives in the document H1 line only and must never appear
  as a top-level bullet.

### 8. IEEE / ACM / Conference-Paper Numbering Convention
Research papers in IEEE, ACM, and similar formats use a fixed
three-tier numbering scheme that is easy to miss because the markers
are short and visually similar to in-line list bullets:

| Level | Marker pattern | Examples |
|-------|----------------|----------|
| Top-level section | Roman numeral + `.` + Title Case | `I. Introduction`, `II. Threat Model and Preliminaries`, `VI. Conclusion`, plus `References`, `Acknowledgements`, `Appendix` |
| Sub-section | Single capital letter + `.` + Title Case | `A. Setup`, `B. Privacy–utility trade-off`, `C. Cross-dataset comparison` |
| Sub-sub-section | `1)` `2)` `3)` + Title Case | `1) Dataset`, `2) Metrics` |

Rules for these documents:
- Roman-numeral sections (`I.`, `II.`, …, plus `References` /
  `Appendix`) are **always level-1 (chapter-equivalent)** entries, even
  when the only larger text on page 1 is the paper title.
- Single-capital-letter markers (`A.`, `B.`, `C.`, …) appearing under
  a roman-numeral section are **always level-2 sub-sections** — emit
  them. Do **not** treat them as inline list items, author initials, or
  bibliography entries.
- `1)` / `2)` / `a)` markers under an `A.`/`B.` block are level-3
  sub-sub-sections.
- The paper title (large font, page 1) is the document title and lives
  only in the `# Table of Contents — …` heading; it is **not** a
  level-1 bullet for IEEE-style papers either.
- Do **not** emit individual reference entries (`[1] Abadi et al.`,
  `[2] Bassily et al.`, …) as headings. `References` itself is the
  level-1 entry; the items below it are bibliography rows, not
  sub-sections.

#### Common failure: missing `A./B./C.` sub-sections
In IEEE / ACM two-column layouts the alphabetic sub-section markers are
often typeset at **body font size with only a bold weight change** —
they do *not* sit on a larger heading line. This means they can be
dropped by font-size-only heuristics. Prompt-side mitigation:
- Treat any **bold short line** (≤ 60 characters) that begins with
  `A.`, `B.`, `C.`, … (single capital letter + period + space + Title
  Case) as a **mandatory level-2 sub-section**, regardless of its
  heuristic confidence or font size.
- When the document contains a roman-numeral section called
  `Experiments`, `Evaluation`, `Methods`, `Results`, or `Discussion`,
  expect 2–5 alphabetic sub-sections beneath it (`A. Setup`, `B. …`,
  `C. …`). If none are emitted, audit the candidate list — they were
  almost certainly dropped upstream, not absent from the source.
- Never collapse alphabetic sub-sections into a single line or omit
  them as "minor". They are the unit at which depth-stratified recall
  is measured.

### 9. Heuristic-side requirements (extractor → LLM hand-off)
The system prompt can only refine candidates the heuristic extractor in
[`tocExtractor.ts`](../web/src/lib/tocExtractor.ts) actually surfaces.
For prompt-side rules to take effect, the extractor must guarantee that
every structurally-recognizable heading reaches the LLM. The current
contract is:

- **Structural-marker bypass** — any line matching one of the canonical
  outline regexes (`STRUCTURAL_HEADING_PATTERNS`) is accepted as a
  candidate even when its font size matches body and PDF.js does not
  report it as bold. The supported markers are:
    - `1.`, `1.1`, `4.1.2` (numeric outline)
    - `I.`, `II.`, `IV.`, `VI.` (roman-numeral sections)
    - `A.`, `B.`, `C.` (alphabetic sub-sections)
    - `Appendix A`, `Chapter 4`, `Part III`, `Section 3`
    - bare `References`, `Acknowledgements`, `Bibliography`, `Index`
- **Bold-token broadening** — `isBold()` matches
  `bold|heavy|black|demi|semibold|bd|bk|MT-Bd|w[6-9]` so embedded
  PostScript abbreviations (e.g. `Times-Bd`, `NimbusSan-Demi`,
  `Roboto-w7`) are not silently classified as regular.
- **Structural-prefix protection in the multi-line merge** — the merge
  step does not absorb a follow-up text item into a previous line that
  already matches a structural heading pattern. This keeps `A. Setup`
  from being concatenated with the body paragraph that follows it
  (which would push the merged line past `MAX_HEADING_CHARS` and drop
  it from the candidate set).

If a class of headings is consistently missing from the LLM output,
check the extractor first: add the new marker shape to
`STRUCTURAL_HEADING_PATTERNS` before tuning the prompt.

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

The document title lives **only** in this heading. Do **not** repeat it as a top-level bullet — a bullet that duplicates the title is scored as a hallucinated heading.

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
- Preserve numbering prefixes verbatim (`1.`, `2.3`, `Chapter 4:`, `Part III:`, `Appendix A.`). The evaluator's Strict mode requires them; Loose mode strips them automatically, so preserving them never hurts.
- Do **not** append confidence annotations to labels.

### Example output

```markdown
# Table of Contents — Cybersecurity Principles: Defending the Digital Landscape

- **Part I: Security Fundamentals** — p. 2
  - Chapter 1: The Threat Landscape — p. 2
    - Types of Cyber Threats — p. 2
    - Threat Actors and Motivations — p. 2

- **Part II: Application and Cloud Security** — p. 9
  - Chapter 4: Secure Software Development — p. 9
    - OWASP Top Ten Vulnerabilities — p. 9
```

Notice the third level (`Types of Cyber Threats`, `OWASP Top Ten Vulnerabilities`). Skipping these collapses the score because depth-stratified recall is computed against the gold tree.

### Example output — IEEE-style research paper

```markdown
# Table of Contents — Differential Privacy in Federated Recommender Systems via Local Noise Calibration

- **I. Introduction** — p. 1
- **II. Threat Model and Preliminaries** — p. 1
- **III. The DP-FedRec Algorithm** — p. 2
- **IV. Experiments** — p. 2
  - A. Setup — p. 2
  - B. Privacy–utility trade-off — p. 2
  - C. Cross-dataset comparison — p. 2
- **V. Related Work** — p. 2
- **VI. Conclusion** — p. 2
- **References** — p. 2
```

The `A.` / `B.` / `C.` lines under `IV. Experiments` are real sub-section headings, not inline list bullets. Dropping them sets `L2 = 0.000` in depth-stratified recall and caps overall recall well below 1.0.

---

## 3. Uncertain Sections

If a block of pages has unclear structure, add a separate level-1 entry at the end:

```markdown
- **Unmapped or Uncertain Sections**
  - <description of ambiguous content> — p. <page>
```

Do **not** guess or fabricate headings for uncertain sections.

---

# 📡 Live SYSTEM_PROMPT (sent to the model at runtime)

> **Source of truth:** [`app/web/src/lib/llmRefinement.ts`](../web/src/lib/llmRefinement.ts) — `SYSTEM_PROMPT` constant.
>
> This block is a verbatim mirror of the prompt actually shipped to the LLM during the secondary refinement pass. The candidate JSON described above is delivered via the `user` message; this block is the `system` message. Keep this section in lock-step with the code — diff this file against `llmRefinement.ts` after any prompt-tuning change.

```text
You are a document structure analyzer for enterprise PDF documents.

You receive a JSON array of candidate headings extracted heuristically from a PDF.
Each candidate has: text (verbatim from PDF), page number, heuristic_confidence, heuristic_level.

Your task:
1. Decide whether each candidate is a genuine section heading or a false positive
   (footer, running header, caption, body sentence, table cell, disclaimer text, etc.).
2. Assign a refined confidence score 0.0–1.0.
3. Assign the correct heading level (1 = top-level chapter, 2 = sub-section, 3 = sub-sub-section).

HEADING DETECTION SIGNALS (treat as strong positive indicators):
- Starts with a numeric prefix: "1.", "2.3", "4.1.2", "Appendix A.", "Section 3"
- All-caps short phrase that is a document title or major section name
- Bold text that is shorter than a typical sentence (< 80 characters)
- A line that is significantly larger or bolder than surrounding body text
- A short Title-Case phrase (< 80 characters) that names a topic
  (e.g. "Types of Cyber Threats", "Authentication Mechanisms",
  "Shared Responsibility Model"). These are sub-section headings even
  without numeric prefixes — KEEP them and assign confidence ≥ 0.55.
  Do NOT drop a candidate solely because heuristic_confidence is low or
  because it lacks numbering; lean on the text shape and surrounding
  context instead.
- IEEE / ACM / conference-paper markers:
    • Roman numeral + "." + Title Case ("I. Introduction",
      "IV. Experiments", "VI. Conclusion") — LEVEL 1, confidence ≥ 0.85.
    • Single capital letter + "." + Title Case ("A. Setup",
      "B. Privacy–utility trade-off", "C. Cross-dataset comparison")
      — LEVEL 2, confidence ≥ 0.75. KEEP every one of these even when
      the heuristic_confidence is low or the line is body-sized but
      bold; they are the canonical IEEE sub-section markers and must
      never be dropped or treated as author initials, list bullets, or
      bibliography entries.
    • "1)", "2)", "a)" + Title Case under an A./B. block — LEVEL 3.
    • Bare words "References", "Acknowledgements", "Appendix" — LEVEL 1.

FALSE POSITIVE SIGNALS (treat as strong negative indicators):
- Repeated identical text on every page (running header/footer)
- Contains a page number inline (e.g. "Page 3 of 30")
- Longer than 120 characters (likely a body sentence)
- Legal disclaimers, copyright notices, or boilerplate notices
- Table column headers or cell contents
- Document cover-page subtitle / publication date lines (e.g.
  "A Comprehensive Reference Guide", "Published 2026") — these are
  cover-page metadata, not headings.

HIERARCHY RULES:
- Numbered prefix depth determines level: "1." → level 1, "1.1" → level 2, "1.1.1" → level 3
- Appendix entries belong at level 1 even if labeled "Appendix A"
- Part-style entries ("Part I:", "Part II:") sit at level 1, with
  Chapter-style entries ("Chapter 1:", "Chapter 2:") nested at level 2
  beneath them, and unnumbered topic headings at level 3.
- The document's cover-page title belongs in the markdown H1 only —
  never emit it as a level-1 bullet (set is_heading=false for it).
- If numbering is absent, infer level from font size relative to
  siblings AND from the heuristic_level passed in (trust it unless
  clearly wrong). Default to level 3 for short Title-Case topic lines
  that follow a chapter heading.

STRICT OUTPUT RULES — violating any rule makes output invalid:
- DO NOT invent, modify, rephrase, translate, or truncate any "text" value.
- DO NOT add entries absent from the input.
- Return a JSON object with a single key "headings" containing the array.
- Each element must be exactly:
  { "text": <unchanged string>, "page": <integer>, "confidence": <float 0–1>, "level": <integer ≥1>, "is_heading": <boolean> }
- Preserve original document order.
- If an entry is not a heading, set "is_heading": false and confidence ≤ 0.25.
```

### User-message envelope

The runtime wraps each chunk of up to **120** candidates in this user message:

```text
Analyze these <N> candidates and return the JSON array:

[{"text":"…","page":1,"heuristic_confidence":0.72,"heuristic_level":1}, …]
```

Returned entries are validated against the input set and any text the model did not receive verbatim is silently dropped (see the `inputSet` guard in `callApi`).
