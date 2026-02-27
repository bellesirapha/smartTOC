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

// ── Internal types ────────────────────────────────────────────────

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
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<TocNode[]> {
  _nodeSeq = 0;

  // ── Step 1: collect all text items across all pages ──────────────
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

  // ── Step 2: determine body font size ─────────────────────────────
  const bodySize = modalFontSize(rawLines);

  // ── Step 3: filter heading candidates ────────────────────────────
  const candidates = rawLines.filter((l) => {
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

  // ── Step 4: cluster font sizes → heading levels ───────────────────
  const uniqueSizes = [...new Set(dedupedCandidates.map((c) => c.fontSize))].sort(
    (a, b) => b - a
  ); // descending: largest = level 1

  const sizeToLevel = new Map<number, number>();
  uniqueSizes.forEach((size, idx) => {
    sizeToLevel.set(size, idx + 1);
  });

  // ── Step 5: assign confidence & "Unknown" label ───────────────────
  const flatNodes: TocNode[] = dedupedCandidates.map((c) => {
    const level = sizeToLevel.get(c.fontSize) ?? 1;

    // Confidence heuristic: large delta from body = high confidence
    const sizeDelta = c.fontSize - bodySize;
    const sizeScore = Math.min(sizeDelta / 8, 1); // 8pt delta → 1.0
    const boldBonus = c.bold ? 0.2 : 0;
    const confidence = Math.min(Math.max(sizeScore + boldBonus, 0), 1);

    const isAmbiguous = confidence < UNKNOWN_CONFIDENCE_THRESHOLD;

    return {
      id: nodeId(),
      label: isAmbiguous ? `Unknown: ${c.text}` : c.text,
      level,
      page: c.page,
      confidence,
      status: isAmbiguous ? 'unknown' : 'confirmed',
      children: [],
      manual: false,
    };
  });

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
