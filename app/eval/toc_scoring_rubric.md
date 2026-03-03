
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
- Strips common leading numbering/prefix tokens (e.g. `2.1`, `3`, `A.2`, `B.1`, `Appendix` + letter).
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
- **TED (normalized)**: TED / max(|nodes_gold|, |nodes_pred|)
- **TreeSimilarity** = 1 − TED(normalized)

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

---
### Example CLI
```bash
python evaluate_toc.py --gold financial_estate_workbook_TOC.md --pred model_output_toc.md --mode strict
python evaluate_toc.py --gold financial_estate_workbook_TOC.md --pred model_output_toc.md --mode loose --pages
