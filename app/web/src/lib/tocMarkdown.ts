/**
 * tocMarkdown.ts
 *
 * Serialize a TocNode hierarchy to Markdown format compatible with:
 *   - evaluate_toc.py (gold TOC comparison)
 *   - git-diffable plain-text storage in eval/results/
 *
 * Output format mirrors gold_toc_financial_estate.md:
 *   # Table of Contents — <Doc Title>
 *
 *   - **Top Level Heading** — p. 1
 *     - Sub Heading — p. 2
 *       - Sub Sub Heading — p. 3
 *
 * Rules:
 *   - Top-level nodes (depth 0) rendered bold: **label**
 *   - 2 spaces of indentation per depth level
 *   - Page number appended as ` — p. N` when available (page > 0)
 *   - Confidence annotations are NOT included (clean for eval comparison)
 */

import type { TocNode } from '../types';

function renderNode(node: TocNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const label = depth === 0 ? `**${node.label}**` : node.label;
  const page = node.page > 0 ? ` — p. ${node.page}` : '';
  const line = `${indent}- ${label}${page}`;

  const childLines = node.children.map((child) => renderNode(child, depth + 1));
  return [line, ...childLines].join('\n');
}

/**
 * Serialize a TOC node tree to evaluator-compatible Markdown.
 *
 * @param nodes   Top-level TocNode array
 * @param docTitle  Document title to embed in the heading (e.g. from filename)
 * @returns Markdown string
 */
export function tocNodesToMarkdown(nodes: TocNode[], docTitle: string): string {
  if (nodes.length === 0) return '';

  const header = `# Table of Contents — ${docTitle}`;
  const body = nodes.map((n) => renderNode(n, 0)).join('\n\n');
  return `${header}\n\n${body}\n`;
}
