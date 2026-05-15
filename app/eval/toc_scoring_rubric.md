
# TOC Structure Detection — Scoring Rubric (Precision/Recall + Tree Edit Distance)

This rubric scores a model-generated Table of Contents (TOC) against a gold TOC in Markdown.
It is designed for **PDF structure detection** evaluation (chapters/subsections), especially when PDFs do **not** provide accessibility-tagged headings.

## 1) What counts as a “heading”
A heading is any TOC entry representing a navigable structural node (chapter/section/subsection), e.g.
- `2. Asset Inventory`
- `2.1 Cash & Banking`
- `Appendix A. Templates`

**Not headings**: descriptive blurbs, tips, notes, body paragraphs.

## 2) Normalization rules (so scoring is stable)
The evaluator uses two label modes:

### A. Strict label mode (default)
- Keeps leading numbering/prefixes (`2.1`, `A.2`, `Appendix B.`).
- Case-insensitive comparison.
- Collapses whitespace.

### B. Loose label mode (optional)
- Strips common leading numbering/prefix tokens before comparison:
  - Numeric: `2`, `2.1`, `2.1.3`, `A.1`
  - Appendix prefixes: `Appendix A`, `Appendix B.`, `Appendix 2:`
  - Structural words: `Chapter 1:`, `Section 2.`, `Part III —`, `Unit 4`, `Module B`, `Lesson 5`
    (matches arabic numbers, roman numerals, or single-letter ids; with optional `:`/`.`/`-`/`–`/`—` separator)
- Case-insensitive.
- Collapses whitespace.

Use **Strict** to test whether the model preserved numbering and exact structure.
Use **Loose** to test whether the model recognized semantic headings even if numbering varies.

### Pre-normalization cleanup (applied before both modes)
The evaluator automatically strips these before comparing labels:
- Markdown bold markers: `**label**` → `label`
- Markdown italic markers: `*label*`, `_label_` → `label`
- Confidence annotations appended by the model: `(High Confidence)`, `(Medium Confidence)`, `(Low Confidence)` → removed
- Trailing dashes and em-dashes used as separators

### Page suffix format (gold TOC and predicted TOC)
Page numbers must appear at the end of each bullet line in this form:
```
— p. N
```
where `N` is a positive integer. The evaluator also accepts `- p. N`, `-- p. N`, `[p. N]`, `(p. N)`, `page N`, `pg N`.

### Markdown hierarchy encoding
Indentation encodes parent–child relationships:
- 0 spaces: level 1 (top-level chapter)
- 2 spaces: level 2 (sub-section)
- 4 spaces: level 3 (sub-sub-section)
- Each additional 2 spaces = one extra level

Tabulation (hard tabs) is treated as 4 spaces.

## 3) Metrics

### 3.1 Heading Precision / Recall / F1
Let:
- **G** = set of gold headings
- **P** = set of predicted headings

Then:
- **Precision** = |G ∩ P| / |P|
- **Recall** = |G ∩ P| / |G|
- **F1** = 2·Precision·Recall / (Precision + Recall)

**Interpretation**
- Low precision → model hallucinated headings.
- Low recall → model missed headings.

### 3.2 Page number accuracy (optional)
If the predicted TOC contains page numbers, evaluate:
- **PageCoverage**: fraction of gold headings (with a page) for which the model also produced a matching heading + page. Surfaces silent omissions that PageExact alone hides.
- **PageExact@Match**: fraction of matched headings whose page numbers exactly match.
- **PageMAE**: mean absolute error in page numbers for matched headings (lower is better).

### 3.3 Tree Edit Distance (TED) for hierarchy
Treat each TOC as an **ordered tree**:
- parent-child relationships come from indentation/nesting in the Markdown TOC
- siblings are ordered by appearance

Compute **Zhang–Shasha ordered tree edit distance** using unit costs:
- insert node: 1
- delete node: 1
- rename node: 1 (0 if labels equal under chosen label mode)

Report:
- **TED (raw)**: minimum edit operations to transform predicted tree into gold tree
- **TED (normalized)**: TED / (|nodes_gold| + |nodes_pred|)  
  Uses the additive upper bound (delete-all + insert-all) so the value is always in [0, 1].
- **TreeSimilarity** = max(0, 1 − TED(normalized))  
  Clamped to [0, 1]; very dissimilar trees report 0 rather than a negative number.

### 3.4 Depth-stratified recall
Because overall recall hides *where* the model misses, the evaluator also reports recall grouped by **gold depth**:
- **L1** (top-level bullets, e.g. `Part I`, `1. Household Overview`)
- **L2** (one indent below)
- **L3+** (deeper)

This makes "the extractor stops at chapters" instantly visible: e.g. `L1: 1.000 | L2: 1.000 | L3: 0.000`.

## 4) Suggested thresholds (tune as needed)
Baseline (safe):
- F1 (Strict) ≥ 0.85
- TreeSimilarity (Strict) ≥ 0.80
- PageExact@Match ≥ 0.75 (if pages are expected)

Stretch:
- F1 (Strict) ≥ 0.92
- TreeSimilarity (Strict) ≥ 0.88
- PageExact@Match ≥ 0.85

## 5) Error taxonomy
- Hallucinated heading
- Omitted heading
- Mis-nested (wrong parent)
- Sibling order error
- Page drift
- **Depth truncation** (consistently misses an entire depth level — detect via depth-stratified recall)

## 6) Document title convention
The document title belongs in the `# Table of Contents — <Title>` heading, **not** as a top-level bullet. A bullet that duplicates the document title will be counted as a hallucinated heading.

---
### Example CLI
```bash
python evaluate_toc.py --gold financial_estate_workbook_TOC.md --pred model_output_toc.md --mode strict
python evaluate_toc.py --gold financial_estate_workbook_TOC.md --pred model_output_toc.md --mode loose --pages
