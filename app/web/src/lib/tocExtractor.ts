/**
 * tocExtractor.ts
 *
 * Deterministic-first TOC extraction from a PDF document.
 *
 * Algorithm (per PLAN § 3.2):
 *   1. Primary signals: font size, font weight (bold), spatial layout
 *   2. Cluster font sizes → assign heading levels
 *   3. Flag ambiguous entries as "Unknown" (confidence < threshold)
 *   4. Never invent headings — only emit what is present in the document
 *
 * CONSTITUTION constraints honoured:
 *   - No hallucinations: only text extracted verbatim from the PDF is used
 *   - Prefer omission: a line must pass ALL filters to be included as a heading
 *   - Ambiguity → "Unknown": anything below confidence threshold is labelled
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { TocNode } from '../types';
import { refineTocWithLlm, type LlmConfig } from './llmRefinement';
import type { LlmCandidate } from './llmRefinement';

// Point PDF.js at its worker (bundled via Vite/CDN)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ── Tuneable thresholds ───────────────────────────────────────────

/** Minimum font size (pt) to even consider a line as a heading candidate */
const MIN_HEADING_SIZE = 10;

/** A line is only a heading candidate if its font is this many pt larger
 *  than the modal (most common) body font size */
const HEADING_SIZE_DELTA = 1.5;

/** Lines shorter than this are unlikely chapter headings */
const MIN_HEADING_CHARS = 3;

/** Lines longer than this are likely body text paragraphs */
const MAX_HEADING_CHARS = 200;

/** Confidence threshold below which a node becomes "Unknown" */
const UNKNOWN_CONFIDENCE_THRESHOLD = 0.4;

// ── Options ───────────────────────────────────────────────────────

export interface ExtractTocOptions {
  /** When provided, a secondary LLM pass refines confidence & levels */
  llmConfig?: LlmConfig;
  /** Abort signal forwarded to the LLM fetch */
  signal?: AbortSignal;
  /** Progress callback: (step, total steps) */
  onProgress?: (step: string) => void;
}

interface RawLine {
  text: string;
  fontSize: number;
  bold: boolean;
  page: number;
  y: number;
}

// ── Helpers ───────────────────────────────────────────────────────

function modalFontSize(lines: RawLine[]): number {
  const counts: Record<number, number> = {};
  for (const l of lines) {
    const rounded = Math.round(l.fontSize * 2) / 2; // 0.5pt buckets
    counts[rounded] = (counts[rounded] ?? 0) + 1;
  }
  let mode = 12;
  let max = 0;
  for (const [size, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      mode = parseFloat(size);
    }
  }
  return mode;
}

function isBold(fontName: string): boolean {
  return /bold|heavy|black/i.test(fontName);
}

let _nodeSeq = 0;
function nodeId(): string {
  return `node-${Date.now()}-${++_nodeSeq}`;
}

// ── Main extractor ────────────────────────────────────────────────

export async function extractToc(
  pdf: pdfjsLib.PDFDocumentProxy,
  options?: ExtractTocOptions
): Promise<TocNode[]> {
  _nodeSeq = 0;

  const onProgress = options?.onProgress;

  // ── Step 1: collect all text items across all pages ──────────────
  onProgress?.('Reading PDF text…');
  const rawLines: RawLine[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items) {
      const ti = item as TextItem;
      if (!ti.str?.trim()) continue;

      const fontSize = Math.abs(ti.transform[0]); // approximate from transform
      const fontName = (ti as unknown as { fontName?: string }).fontName ?? '';

      rawLines.push({
        text: ti.str.trim(),
        fontSize,
        bold: isBold(fontName),
        page: pageNum,
        y: ti.transform[5],
      });
    }
  }

  if (rawLines.length === 0) return [];

  // ── Step 1b: merge multi-line headings ────────────────────────────
  // PDF.js often splits a single heading across multiple text items when
  // it wraps to a new line (e.g. "Part II: Application and" / "Cloud
  // Security"). We merge consecutive items on the same page that share
  // the same font size, bold state, and are vertically adjacent.
  const Y_MERGE_THRESHOLD = 3; // max Y-gap (pt) to consider same line cluster
  const mergedLines: RawLine[] = [];
  for (const line of rawLines) {
    const prev = mergedLines[mergedLines.length - 1];
    if (
      prev &&
      prev.page === line.page &&
      Math.abs(prev.fontSize - line.fontSize) < 0.5 &&
      prev.bold === line.bold &&
      Math.abs(prev.y - line.y) <= prev.fontSize * Y_MERGE_THRESHOLD
    ) {
      // Merge: append text, keep the higher Y (first visual line)
      prev.text = prev.text + ' ' + line.text;
      prev.y = Math.max(prev.y, line.y);
    } else {
      mergedLines.push({ ...line });
    }
  }

  // ── Step 2: determine body font size ─────────────────────────────
  const bodySize = modalFontSize(mergedLines);

  // ── Step 3: filter heading candidates ────────────────────────────
  onProgress?.('Filtering heading candidates…');
  const candidates = mergedLines.filter((l) => {
    if (l.fontSize < MIN_HEADING_SIZE) return false;
    if (l.fontSize < bodySize + HEADING_SIZE_DELTA && !l.bold) return false;
    if (l.text.length < MIN_HEADING_CHARS) return false;
    if (l.text.length > MAX_HEADING_CHARS) return false;
    return true;
  });

  if (candidates.length === 0) return [];

  // ── Step 3b: deduplicate — same text on same page = same heading ──
  // PDF.js sometimes emits the same text span twice (e.g. from header/footer
  // repetition or rendering layers). Keep only the first occurrence.
  const seenKeys = new Set<string>();
  const dedupedCandidates = candidates.filter((c) => {
    const key = `${c.page}::${c.text.toLowerCase().trim()}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  if (dedupedCandidates.length === 0) return [];

  // ── Step 3c: collapse running page headers ────────────────────────
  // A heading that repeats on consecutive pages (gap ≤ 2) is a running
  // header printed at the top of each page in a section — not a new TOC
  // entry. Keep only the first occurrence per text.
  const runningHeaderSeen = new Map<string, number>(); // text → last page kept
  const filteredCandidates = dedupedCandidates.filter((c) => {
    const key = c.text.toLowerCase().trim();
    const lastPage = runningHeaderSeen.get(key);
    if (lastPage !== undefined && c.page - lastPage <= 2) {
      // Same heading on a nearby page → running header, skip it
      return false;
    }
    runningHeaderSeen.set(key, c.page);
    return true;
  });

  if (filteredCandidates.length === 0) return [];

  // ── Step 4: cluster font sizes → heading levels ───────────────────
  const uniqueSizes = [...new Set(filteredCandidates.map((c) => c.fontSize))].sort(
    (a, b) => b - a
  ); // descending: largest = level 1

  const sizeToLevel = new Map<number, number>();
  uniqueSizes.forEach((size, idx) => {
    sizeToLevel.set(size, idx + 1);
  });

  // ── Step 5: assign confidence (heuristic) ─────────────────────────
  onProgress?.('Scoring candidates…');
  const flatNodes: TocNode[] = filteredCandidates.map((c) => {
    const level = sizeToLevel.get(c.fontSize) ?? 1;

    // Confidence heuristic: large delta from body = high confidence
    const sizeDelta = c.fontSize - bodySize;
    const sizeScore = Math.min(sizeDelta / 8, 1); // 8pt delta → 1.0
    const boldBonus = c.bold ? 0.2 : 0;
    const confidence = Math.min(Math.max(sizeScore + boldBonus, 0), 1);

    const isAmbiguous = confidence < UNKNOWN_CONFIDENCE_THRESHOLD;

    return {
      id: nodeId(),
      label: c.text,
      level,
      page: c.page,
      confidence,
      status: isAmbiguous ? 'unknown' : 'confirmed',
      children: [],
      manual: false,
    };
  });

  // ── Step 5b: secondary LLM pass (optional) ───────────────────────
  // Per PLAN § 3.2. The LLM refines confidence, corrects levels, and
  // filters false positives — it never generates text.
  if (options?.llmConfig) {
    onProgress?.('Running LLM refinement pass…');
    try {
      const llmCandidates: LlmCandidate[] = flatNodes.map((n) => ({
        text: n.label,
        page: n.page,
        heuristicConfidence: n.confidence,
        heuristicLevel: n.level,
      }));

      const refinements = await refineTocWithLlm(
        llmCandidates,
        options.llmConfig,
        options.signal,
        (done, total) => onProgress?.(`LLM refinement: ${done}/${total} candidates…`)
      );

      // Merge: update confidence/level from LLM; drop non-headings
      const mergedNodes = flatNodes
        .map((n) => {
          const key = `${n.page}::${n.label}`;
          const r = refinements.get(key);
          if (!r) return n; // LLM didn't return this entry → keep heuristic
          if (!r.isHeading) return null; // LLM says not a heading → drop
          // Rescore: LLM-confirmed headings get a minimum confidence floor so
          // verified entries don't remain in the "low" band.
          // Numeric-prefixed headings (e.g. "1.1 Key Contacts") get ≥ 80%;
          // all other confirmed headings get ≥ 65%.
          const numericPrefix = /^\d+(\.[\d]+)*[\s\.\)]/;
          const minFloor = numericPrefix.test(n.label) ? 0.80 : 0.65;
          const rescored = Math.max(r.confidence, minFloor);
          return {
            ...n,
            level: r.level,
            confidence: rescored,
            status: (rescored < UNKNOWN_CONFIDENCE_THRESHOLD
              ? 'unknown'
              : 'confirmed') as TocNode['status'],
            refined: true,
          };
        })
        .filter((n): n is TocNode => n !== null);

      return buildHierarchy(mergedNodes);
    } catch (err) {
      // LLM pass failed entirely — fall back to heuristic result
      console.warn('[extractToc] LLM pass failed, using heuristic result:', err);
    }
  }

  // ── Step 6: build hierarchy ───────────────────────────────────────
  return buildHierarchy(flatNodes);
}

function buildHierarchy(flat: TocNode[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const node of flat) {
    // pop stack until parent level < current level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

/** Flatten a hierarchy to a simple list (used by DnD and audit) */
export function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];
  function walk(ns: TocNode[]) {
    for (const n of ns) {
      result.push(n);
      walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

// ── Two-phase public API ──────────────────────────────────────────

/**
 * Phase 1 — deterministic heuristic extraction only (no LLM).
 *
 * Returns results immediately so the caller can show them in the UI
 * before kicking off the optional LLM refinement pass.
 */
export async function extractTocHeuristic(
  pdf: pdfjsLib.PDFDocumentProxy,
  options?: Pick<ExtractTocOptions, 'signal' | 'onProgress'>
): Promise<TocNode[]> {
  // Delegate to extractToc without an llmConfig to get heuristic-only result
  return extractToc(pdf, { signal: options?.signal, onProgress: options?.onProgress });
}

/**
 * Phase 2 — LLM refinement applied to an already-extracted node tree.
 *
 * Takes the hierarchical result from Phase 1, flattens it, sends candidates
 * to the LLM, merges the refinements, and returns a corrected hierarchy.
 *
 * CONSTITUTION constraints honoured: text is never modified; only
 * confidence/level are updated and false-positive nodes are dropped.
 */
export async function refineTocNodesWithLlm(
  nodes: TocNode[],
  llmConfig: LlmConfig,
  options?: Pick<ExtractTocOptions, 'signal' | 'onProgress'>
): Promise<TocNode[]> {
  const onProgress = options?.onProgress;

  const flat = flattenToc(nodes);
  if (flat.length === 0) return nodes;

  onProgress?.('Running LLM verification pass…');

  const llmCandidates: LlmCandidate[] = flat.map((n) => ({
    text: n.label,
    page: n.page,
    heuristicConfidence: n.confidence,
    heuristicLevel: n.level,
  }));

  const refinements = await refineTocWithLlm(
    llmCandidates,
    llmConfig,
    options?.signal,
    (done, total) => onProgress?.(`LLM verification: ${done}/${total} candidates…`)
  );

  const mergedFlat = flat
    .map((n) => {
      const key = `${n.page}::${n.label}`;
      const r = refinements.get(key);
      if (!r) return { ...n, children: [] as TocNode[] }; // keep heuristic, clear stale children
      if (!r.isHeading) return null;          // LLM says not a heading → drop
      return {
        ...n,
        children: [] as TocNode[],             // always clear — buildHierarchy re-nests
        level: r.level,
        confidence: r.confidence,
        status: (r.confidence < UNKNOWN_CONFIDENCE_THRESHOLD
          ? 'unknown'
          : 'confirmed') as TocNode['status'],
        refined: true,
      };
    })
    .filter((n): n is TocNode => n !== null);

  return buildHierarchy(mergedFlat);
}

/** Load a PDF from a URL or ArrayBuffer */
export async function loadPdf(
  source: string | ArrayBuffer
): Promise<pdfjsLib.PDFDocumentProxy> {
  const loading =
    typeof source === 'string'
      ? pdfjsLib.getDocument(source)
      : pdfjsLib.getDocument({ data: source });
  return loading.promise;
}
