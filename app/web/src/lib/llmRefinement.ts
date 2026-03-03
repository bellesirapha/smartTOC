/**
 * llmRefinement.ts
 *
 * Secondary LLM pass (per PLAN § 3.2 — "Secondary AI pass").
 *
 * Purpose:
 *   - Normalize heading hierarchy determined heuristically
 *   - Detect false positives (body text incorrectly promoted to heading)
 *   - Refine confidence scores beyond what font-size alone can assess
 *
 * CONSTITUTION constraints honoured:
 *   - LLM output is STRUCTURE-ONLY: no free text is generated
 *   - The LLM may only rate and re-level existing candidates — never invent
 *   - Every returned entry is validated against the original input set
 *   - Entries not present in the input are silently dropped
 *   - Stable output: temperature=0 ensures determinism
 */

// ── Public config type (persisted in sessionStorage) ─────────────

export interface LlmConfig {
  provider: 'openai' | 'azure' | 'github';
  apiKey: string;
  /**
   * Azure only — full chat completions URL, e.g.:
   * https://<resource>.openai.azure.com/openai/deployments/<deploy>/chat/completions?api-version=2024-08-01-preview
   */
  azureEndpoint?: string;
  /** Model name. Defaults to "gpt-4o-mini" (OpenAI/GitHub) or ignored for Azure (baked into endpoint). */
  model?: string;
}

// ── Internal I/O types ────────────────────────────────────────────

export interface LlmCandidate {
  text: string;
  page: number;
  heuristicConfidence: number;
  heuristicLevel: number;
}

export interface LlmRefinement {
  text: string;
  page: number;
  confidence: number;
  level: number;
  /** False → this candidate is likely body text and should be dropped */
  isHeading: boolean;
}

// ── Constants ─────────────────────────────────────────────────────

/** Max candidates per API request — keeps token count manageable */
const CHUNK_SIZE = 120;

const SYSTEM_PROMPT = `\
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

FALSE POSITIVE SIGNALS (treat as strong negative indicators):
- Repeated identical text on every page (running header/footer)
- Contains a page number inline (e.g. "Page 3 of 30")
- Longer than 120 characters (likely a body sentence)
- Legal disclaimers, copyright notices, or boilerplate notices
- Table column headers or cell contents

HIERARCHY RULES:
- Numbered prefix depth determines level: "1." → level 1, "1.1" → level 2, "1.1.1" → level 3
- Appendix entries belong at level 1 even if labeled "Appendix A"
- Document title / cover page text is level 1
- If numbering is absent, infer level from font size relative to siblings

STRICT OUTPUT RULES — violating any rule makes output invalid:
- DO NOT invent, modify, rephrase, translate, or truncate any "text" value.
- DO NOT add entries absent from the input.
- Return a JSON object with a single key "headings" containing the array.
- Each element must be exactly:
  { "text": <unchanged string>, "page": <integer>, "confidence": <float 0–1>, "level": <integer ≥1>, "is_heading": <boolean> }
- Preserve original document order.
- If an entry is not a heading, set "is_heading": false and confidence ≤ 0.25.`;

// ── Helpers ───────────────────────────────────────────────────────

function buildUserPrompt(candidates: LlmCandidate[]): string {
  const payload = candidates.map((c) => ({
    text: c.text,
    page: c.page,
    heuristic_confidence: c.heuristicConfidence,
    heuristic_level: c.heuristicLevel,
  }));
  return `Analyze these ${candidates.length} candidates and return the JSON array:\n\n${JSON.stringify(payload)}`;
}

async function callApi(
  config: LlmConfig,
  candidates: LlmCandidate[],
  signal?: AbortSignal
): Promise<LlmRefinement[]> {
  const model = config.model ?? 'gpt-4o-mini';

  const requestBody = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(candidates) },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (config.provider === 'azure') {
    if (!config.azureEndpoint) throw new Error('Azure endpoint URL is required.');
    url = config.azureEndpoint;
    headers['api-key'] = config.apiKey;
    // Azure deployment ignores the model field in the body — remove it to avoid confusion
  } else if (config.provider === 'github') {
    // GitHub Models — OpenAI-compatible endpoint, free tier via GitHub token
    url = 'https://models.inference.ai.azure.com/chat/completions';
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(url, { method: 'POST', headers, body: requestBody, signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`LLM API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('Empty LLM response');

  // Parse — LLM may return a plain array or wrap in an object
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM returned non-JSON content');
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : findFirstArray(parsed);

  // ── CONSTITUTION guard: validate every entry against input ────────
  const inputSet = new Set(candidates.map((c) => `${c.page}::${c.text}`));
  const results: LlmRefinement[] = [];

  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;

    const text = typeof r.text === 'string' ? r.text : null;
    const page = typeof r.page === 'number' ? r.page : null;
    const confidence =
      typeof r.confidence === 'number' ? Math.min(Math.max(r.confidence, 0), 1) : null;
    const level =
      typeof r.level === 'number' ? Math.max(1, Math.round(r.level)) : null;
    const isHeading = r.is_heading !== false; // default true if missing

    if (text === null || page === null || confidence === null || level === null) continue;

    // Drop any entry the LLM may have invented
    if (!inputSet.has(`${page}::${text}`)) continue;

    results.push({ text, page, confidence, level, isHeading });
  }

  return results;
}

/** Recursively find the first array value in an unknown object */
function findFirstArray(obj: unknown): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object' && obj !== null) {
    for (const val of Object.values(obj)) {
      const found = findFirstArray(val);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Refine a flat list of heuristic candidates using an LLM.
 *
 * Returns a map of `"page::text" → LlmRefinement` so callers can
 * merge results back into TocNode objects without re-sorting.
 *
 * Entries absent from the map were either unreachable (API failure on
 * a chunk) or explicitly marked non-headings — callers should drop them.
 */
export async function refineTocWithLlm(
  candidates: LlmCandidate[],
  config: LlmConfig,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, LlmRefinement>> {
  const resultMap = new Map<string, LlmRefinement>();
  if (candidates.length === 0) return resultMap;

  // Split into chunks to stay within token limits
  const chunks: LlmCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + CHUNK_SIZE));
  }

  let done = 0;
  for (const chunk of chunks) {
    if (signal?.aborted) break;

    try {
      const refinements = await callApi(config, chunk, signal);
      for (const r of refinements) {
        resultMap.set(`${r.page}::${r.text}`, r);
      }
    } catch (err) {
      // Partial failure: log and keep heuristic scores for this chunk
      console.warn('[llmRefinement] chunk failed, keeping heuristic scores:', err);
    }

    done += chunk.length;
    onProgress?.(done, candidates.length);
  }

  return resultMap;
}

// ── Config persistence (sessionStorage) ──────────────────────────

const STORAGE_KEY = 'smarttoc_llm_config';

export function saveLlmConfig(config: LlmConfig): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // sessionStorage unavailable (private browsing etc.) — silently ignore
  }
}

export function loadLlmConfig(): LlmConfig | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<LlmConfig>;
    if (c.provider && c.apiKey) return c as LlmConfig;
  } catch {
    // ignore
  }
  return null;
}

export function clearLlmConfig(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Load LLM config from Vite environment variables (VITE_LLM_*).
 * Used to pre-configure the app without requiring user input.
 * Falls back to null if no env vars are set.
 */
export function loadEnvLlmConfig(): LlmConfig | null {
  const provider = import.meta.env.VITE_LLM_PROVIDER as string | undefined;
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined;
  const model = import.meta.env.VITE_LLM_MODEL as string | undefined;
  const azureEndpoint = import.meta.env.VITE_LLM_AZURE_ENDPOINT as string | undefined;

  if (!provider || !apiKey) return null;
  if (provider !== 'openai' && provider !== 'azure' && provider !== 'github') return null;

  return {
    provider,
    apiKey,
    ...(model ? { model } : {}),
    ...(azureEndpoint ? { azureEndpoint } : {}),
  };
}
