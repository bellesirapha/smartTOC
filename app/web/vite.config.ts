import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname, basename, extname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Scripts & gold TOC live in app/eval/
const APP_EVAL_DIR = resolve(__dirname, '../eval')
// Results saved to top-level eval/results/ (as requested)
const RESULTS_DIR = resolve(__dirname, '../../eval/results')
// Default gold (used when no PDF filename is supplied or no match is found)
const DEFAULT_GOLD_TOC = join(APP_EVAL_DIR, 'multi column pdf', 'cybersecurity-principles-toc.md')
const EVAL_SCRIPT = join(APP_EVAL_DIR, 'evaluate_toc.py')

// Files inside app/eval/ that look like prompt/rubric docs, not gold TOCs.
const NON_GOLD_BASENAMES = new Set(['toc_scoring_rubric.md', 'smart-toc-prompt-tuning-v1.md'])

function listGoldFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      out.push(...listGoldFiles(full))
    } else if (extname(name).toLowerCase() === '.md' && !NON_GOLD_BASENAMES.has(name)) {
      out.push(full)
    }
  }
  return out
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(pdf|md)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeForMatch(s).split(/\s+/).filter((t) => t.length >= 3))
}

function tokenSimilarity(a: string, b: string): number {
  const ta = tokenSet(a)
  const tb = tokenSet(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size)
}

function selectGold(pdfFileName: string | undefined): { path: string; reason: string } {
  if (!pdfFileName) return { path: DEFAULT_GOLD_TOC, reason: 'no fileName supplied' }
  const candidates = listGoldFiles(APP_EVAL_DIR)
  if (candidates.length === 0) return { path: DEFAULT_GOLD_TOC, reason: 'no gold files found' }
  let best: { path: string; score: number } | null = null
  for (const c of candidates) {
    const score = tokenSimilarity(pdfFileName, basename(c))
    if (!best || score > best.score) best = { path: c, score }
  }
  if (best && best.score >= 0.5) return { path: best.path, reason: `best match (sim=${best.score.toFixed(2)})` }
  return { path: DEFAULT_GOLD_TOC, reason: `no good match (best sim=${best?.score.toFixed(2) ?? '0'})` }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'smarttoc-eval',
      configureServer(server) {
        // POST /api/save-toc  { markdown: string, docTitle: string }
        // → saves eval/results/<datetime>.md and runs evaluate_toc.py
        server.middlewares.use('/api/save-toc', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { markdown, fileName } = JSON.parse(body) as { markdown: string; fileName?: string }

              if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })

              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
              const predPath = join(RESULTS_DIR, `toc_${ts}.md`)
              writeFileSync(predPath, markdown, 'utf8')
              console.log(`\n\x1b[36m[eval]\x1b[0m Saved TOC → ${predPath}`)

              const { path: GOLD_TOC, reason } = selectGold(fileName)
              console.log(`\x1b[36m[eval]\x1b[0m Gold: ${GOLD_TOC} (${reason})`)

              // Run evaluate_toc.py if gold exists
              if (!existsSync(GOLD_TOC)) {
                console.warn('[eval] Gold TOC not found — skipping evaluation')
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ saved: predPath, evalOutput: '', exitCode: null }))
                return
              }

              console.log(`\x1b[36m[eval]\x1b[0m Running evaluate_toc.py (loose + pages)…`)
              const proc = spawn('python3', [
                EVAL_SCRIPT,
                '--gold', GOLD_TOC,
                '--pred', predPath,
                '--mode', 'loose',
                '--pages',
                '--json',
              ])

              let stdout = ''
              proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
              proc.stderr.on('data', (d: Buffer) => {
                process.stderr.write(`\x1b[31m[eval stderr] ${d.toString()}\x1b[0m`)
              })
              proc.on('close', (code) => {
                try {
                  const r = JSON.parse(stdout)
                  const h = r.headings
                  const hi = r.hierarchy
                  const p = r.pages
                  const e = r.errors
                  const goldCount = h.gold_count as number
                  const omittedPct = goldCount > 0 ? (e.omitted_count / goldCount) * 100 : 0

                  // ── Human-readable summary ──────────────────────────────
                  const summary = [
                    '',
                    `\x1b[36m[eval]\x1b[0m Mode: loose`,
                    `\x1b[36m[eval]\x1b[0m Gold: ${h.gold_count} | Pred: ${h.pred_count} | Matched: ${h.matched}`,
                    `\x1b[36m[eval]\x1b[0m Precision: ${h.precision.toFixed(3)} | Recall: ${h.recall.toFixed(3)} | F1: ${h.f1.toFixed(3)}`,
                    p ? `\x1b[36m[eval]\x1b[0m PageExact@Match: ${p.page_exact_match_rate?.toFixed(3) ?? 'n/a'} | PageMAE: ${p.page_mae?.toFixed(3) ?? 'n/a'}` : '',
                    `\x1b[36m[eval]\x1b[0m TED: ${hi.tree_edit_distance} | NormTED: ${hi.normalized_ted.toFixed(3)} | TreeSimilarity: ${hi.tree_similarity.toFixed(3)}`,
                    `\x1b[36m[eval]\x1b[0m Hallucinated: ${e.hallucinated_count} | Omitted: ${e.omitted_count} (${omittedPct.toFixed(1)}% of gold)`,
                  ].filter(Boolean).join('\n')
                  process.stdout.write(`\x1b[33m${summary}\x1b[0m\n`)

                  // ── Threshold comparison table ──────────────────────────
                  type Row = { metric: string; value: string; threshold: string; status: string }
                  const G = '\x1b[32m🟢 PASS\x1b[0m'
                  const Y = '\x1b[33m🟡 FIX \x1b[0m'
                  const R = '\x1b[31m🔴 FAIL\x1b[0m'
                  const band = (v: number, good: number, ok: number, higherIsBetter = true): string => {
                    if (higherIsBetter) return v >= good ? G : v >= ok ? Y : R
                    return v <= good ? G : v <= ok ? Y : R
                  }

                  const rows: Row[] = [
                    { metric: 'Precision',        value: h.precision.toFixed(3),                threshold: '≥ 0.85',      status: band(h.precision, 0.85, 0.70) },
                    { metric: 'Recall',            value: h.recall.toFixed(3),                  threshold: '≥ 0.80',      status: band(h.recall, 0.80, 0.65) },
                    { metric: 'F1',                value: h.f1.toFixed(3),                       threshold: '≥ 0.82',      status: band(h.f1, 0.82, 0.70) },
                    { metric: 'PageExact@Match',   value: p?.page_exact_match_rate?.toFixed(3) ?? 'n/a', threshold: '≥ 0.70', status: p?.page_exact_match_rate != null ? band(p.page_exact_match_rate, 0.70, 0.50) : '-' },
                    { metric: 'PageMAE',           value: p?.page_mae?.toFixed(2) ?? 'n/a',     threshold: '≤ 2 pages',   status: p?.page_mae != null ? band(p.page_mae, 2, 4, false) : '-' },
                    { metric: 'TreeSimilarity',    value: hi.tree_similarity.toFixed(3),         threshold: '≥ 0.75',      status: band(hi.tree_similarity, 0.75, 0.60) },
                    { metric: 'Normalized TED',    value: hi.normalized_ted.toFixed(3),          threshold: '≤ 0.25',      status: band(hi.normalized_ted, 0.25, 0.40, false) },
                    { metric: 'Hallucinated',      value: String(e.hallucinated_count),          threshold: '0–2',         status: e.hallucinated_count <= 2 ? G : e.hallucinated_count <= 6 ? Y : R },
                    { metric: 'Omitted',           value: `${e.omitted_count} (${omittedPct.toFixed(1)}%)`, threshold: '≤ 15% of gold', status: omittedPct <= 15 ? G : omittedPct <= 30 ? Y : R },
                  ]

                  const colW = [22, 14, 16, 10]
                  const line = '─'.repeat(colW.reduce((a, b) => a + b + 3, 1))
                  const row = (cells: string[], widths: number[]) =>
                    '│ ' + cells.map((c, i) => c.padEnd(widths[i])).join(' │ ') + ' │'

                  const tableLines = [
                    '',
                    '\x1b[1m\x1b[36m── Rubric Threshold Comparison ──────────────────────────────\x1b[0m',
                    line,
                    row(['Metric', 'Result', 'Ship Threshold', 'Status'], colW),
                    line,
                    ...rows.map(r => row([r.metric, r.value, r.threshold, r.status], colW)),
                    line,
                    '',
                  ]
                  process.stdout.write(tableLines.join('\n') + '\n')
                } catch {
                  // JSON parse failed — print raw
                  process.stdout.write(`\x1b[33m${stdout}\x1b[0m\n`)
                }

                console.log(`\x1b[36m[eval]\x1b[0m evaluate_toc.py exited with code ${code}\n`)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ saved: predPath, evalOutput: stdout, exitCode: code }))
              })
            } catch (err) {
              console.error('[eval] Error:', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
        })
      },
    },
  ],
})
