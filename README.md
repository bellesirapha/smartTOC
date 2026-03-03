# 📑 smartTOC

> AI-generated, editable, and auditable Table of Contents for large PDF documents — built as a fully static web application.

---

## How TOC Generation Works

When a user clicks **✨ Generate**, the app runs a two-phase pipeline:

### Phase 1 — Heuristic Extraction (instant, no API key required)

The PDF is scanned using [PDF.js](https://mozilla.github.io/pdf.js/). Every text item's font size, font weight (bold), and position is analysed to identify heading candidates:

1. **Font clustering** — the modal (most common) body font size is computed; lines significantly larger or bolder than body text are promoted to candidates.
2. **Filtering** — lines that are too short, too long, or repeat across consecutive pages (running headers/footers) are dropped.
3. **Level assignment** — unique font sizes are ranked largest-to-smallest to assign heading levels (H1, H2, H3, …).
4. **Confidence scoring** — each candidate receives a heuristic confidence score based on its size delta and boldness. Entries below 40% are flagged with a `?` badge.

Results appear in the TOC pane **immediately** — no waiting for the AI.

### Phase 2 — LLM Verification (optional, requires API key)

While the heuristic TOC is already visible, a secondary AI pass runs in the background:

1. All candidates are sent to the configured LLM (OpenAI / Azure OpenAI / GitHub Models) as a structured JSON array.
2. The LLM decides whether each candidate is a genuine heading or a false positive (footer, caption, body sentence, etc.), refines its confidence score, and corrects its heading level.
3. The model is instructed to **never invent, paraphrase, or modify heading text** — it only rates and re-levels what was extracted.
4. Only entries validated by the LLM update the UI. Entries the LLM marks as non-headings are removed. The heuristic result is kept as fallback if the LLM call fails.

A **"🤖 AI verifying headings…"** banner is shown while Phase 2 runs.

#### Configuring the LLM

Set these environment variables before `npm run dev` (or in `.env.local`):

| Variable | Description |
|---|---|
| `VITE_LLM_PROVIDER` | `openai`, `azure`, or `github` |
| `VITE_LLM_API_KEY` | Your API key |
| `VITE_LLM_MODEL` | Model name (default: `gpt-4o-mini`) |
| `VITE_LLM_AZURE_ENDPOINT` | Full Azure deployment URL (Azure only) |

If no env vars are set, a **Configure AI** modal prompts for credentials (stored in `sessionStorage` for the session).

---

## Automated Evaluation (dev only)

Every time a TOC is generated, the app silently:

1. Serialises the result to Markdown in the format used by the gold TOC.
2. Saves it to `eval/results/toc_<datetime>.md`.
3. Runs `app/eval/evaluate_toc.py` against the gold TOC (`app/eval/plain text pdf/gold_toc_financial_estate.md`).
4. Prints a colour-coded rubric threshold table to the **npm terminal**:

```
── Rubric Threshold Comparison ──────────────────────────────
│ Metric           │ Result  │ Ship Threshold │ Status    │
│ Precision        │ 1.000   │ ≥ 0.85         │ 🟢 PASS   │
│ Recall           │ 0.967   │ ≥ 0.80         │ 🟢 PASS   │
│ F1               │ 0.983   │ ≥ 0.82         │ 🟢 PASS   │
│ PageExact@Match  │ 1.000   │ ≥ 0.70         │ 🟢 PASS   │
│ PageMAE          │ 0.00    │ ≤ 2 pages      │ 🟢 PASS   │
│ TreeSimilarity   │ 0.900   │ ≥ 0.75         │ 🟢 PASS   │
│ Normalized TED   │ 0.100   │ ≤ 0.25         │ 🟢 PASS   │
│ Hallucinated     │ 0       │ 0–2            │ 🟢 PASS   │
│ Omitted          │ 1 (3.3%)│ ≤ 15% of gold  │ 🟢 PASS   │
```

---

## Project Structure

```
smartTOC/
├── app/
│   ├── web/                        # React + TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/         # UI components
│   │   │   │   ├── TocTree         # TOC pane with drag-and-drop, inline edit
│   │   │   │   ├── PdfViewer       # PDF.js viewer
│   │   │   │   ├── AuditTrailPane  # Immutable audit log panel
│   │   │   │   ├── LlmConfigModal  # API key configuration dialog
│   │   │   │   └── SortableTocItem # Individual draggable TOC row
│   │   │   ├── lib/
│   │   │   │   ├── tocExtractor.ts # Phase 1 heuristic + Phase 2 LLM merge
│   │   │   │   ├── llmRefinement.ts# LLM API client + system prompt
│   │   │   │   ├── tocMarkdown.ts  # TocNode[] → evaluator-compatible Markdown
│   │   │   │   └── auditLog.ts     # Immutable audit event log
│   │   │   └── types/              # Domain types (TocNode, AuditLog, AppState)
│   │   ├── vite.config.ts          # Dev eval middleware (save + run evaluate_toc.py)
│   │   └── package.json
│   ├── eval/                       # Evaluation suite
│   │   ├── evaluate_toc.py         # Precision/Recall/F1 + TED scorer
│   │   ├── toc_scoring_rubric.md   # Rubric definition & threshold bands
│   │   ├── smart-toc-prompt-tuning-v1.md  # LLM prompt template & output spec
│   │   └── plain text pdf/
│   │       ├── financial_estate_workbook_sample_30p.pdf  # Test PDF
│   │       └── gold_toc_financial_estate.md              # Ground-truth TOC
│   └── scenario/                   # Product documentation
│       ├── CONSTITUTION.md         # Governing principles (highest priority)
│       ├── PRD.md                  # Full product requirements + eval thresholds
│       ├── SPEC.md                 # Authoritative feature specification
│       ├── PLAN.md                 # Tech stack & architecture decisions
│       └── TASKS.md                # Task breakdown by milestone
├── eval/
│   └── results/                    # Auto-saved TOC Markdown outputs per run
├── .github/workflows/ci.yml        # CI: type-check + build + artifact upload
└── LICENSE                         # MIT
```

---

## License

[MIT](LICENSE) © 2026 Belle Podeanu
