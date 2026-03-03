#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Evaluate a model-generated TOC Markdown vs a gold TOC.

Implements the rubric in `toc_scoring_rubric.md`:
- Headings: precision / recall / F1 (Strict or Loose normalization)
- Hierarchy: Zhang–Shasha ordered tree edit distance (TED) + normalized similarity
- Pages: exact-match rate + MAE (optional)

Assumptions:
- TOC entries are Markdown bullet lines (e.g., "- **Title** — p. 3")
- Hierarchy is encoded via indentation

Usage:
  python evaluate_toc.py --gold gold.md --pred pred.md --mode strict
  python evaluate_toc.py --gold gold.md --pred pred.md --mode loose --pages
  python evaluate_toc.py --gold gold.md --pred pred.md --mode strict --json
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple


@dataclass
class Node:
    label: str
    page: Optional[int] = None
    children: List["Node"] = field(default_factory=list)


def normalize_label(label: str, mode: str = "strict") -> str:
    """Normalize labels for stable comparison.

    Strict:
      - keeps numbering/prefixes
      - case-insensitive
      - collapses whitespace

    Loose:
      - strips common leading numbering/prefixes (e.g. 2.1, A.2, Appendix B.)
      - case-insensitive
      - collapses whitespace
    """

    # Remove common non-heading annotations injected by models.
    # These are not part of the rubric's heading label.
    s = label.strip()
    s = re.sub(r"\s*[\[(](?:high|medium|low)\s+confidence[\])]\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip().lower()

    if mode == "loose":
        s = re.sub(r"^appendix\s+[a-z]\.?\s+", "", s)
        s = re.sub(r"^[a-z]\.[0-9]+\s+", "", s)  # A.1
        s = re.sub(r"^[0-9]+(?:\.[0-9]+)*\.?\s+", "", s)  # 2.1.3

    return s


_BULLET_RE = re.compile(r"^(\s*)[-*+]\s+(.*)$")


def _strip_md_emphasis(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    return text


def _parse_page_suffix(content: str) -> Tuple[str, Optional[int]]:
    page = None
    m = re.search(
        r"(?:\s*(?:—|--|-)\s*)?"
        r"[\[(]?\s*(?:p|page|pg)\.?\s*:?\s*(\d+)\s*[\])]?\s*"
        r"(?:\s*(?:—|--|-)\s*)?"
        r"(?:[\[(](?:high|medium|low)\s+confidence[\])]\s*)?$",
        content,
        flags=re.IGNORECASE,
    )
    if m:
        page = int(m.group(1))
        content = content[: m.start()].strip()
    return content, page


def parse_toc_md(path: str) -> Node:
    """Parse a Markdown TOC with bullet lines into an ordered tree."""

    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    root = Node("ROOT")
    stack: List[Tuple[int, Node]] = [(-1, root)]

    numbered_re = re.compile(r"^(\s*)(\d+(?:\.\d+)*)\.\s+(.*)$")

    for line in lines:
        raw_indent: str
        content: str

        m = _BULLET_RE.match(line)
        if m:
            raw_indent = m.group(1)
            content = m.group(2).strip()
        else:
            mn = numbered_re.match(line)
            if mn:
                raw_indent = mn.group(1)
                content = f"{mn.group(2)}. {mn.group(3).strip()}"
            else:
                # Also accept non-bullet lines when they include a parseable page marker.
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or stripped.startswith(">"):
                    continue
                tentative, tentative_page = _parse_page_suffix(stripped)
                if tentative_page is None:
                    continue
                raw_indent = line[: len(line) - len(line.lstrip())]
                content = stripped

        indent = len(raw_indent.replace("\t", "    "))

        content, page = _parse_page_suffix(content)
        content = _strip_md_emphasis(content)
        content = content.strip().strip("-–— ")

        if not content:
            continue

        node = Node(content, page=page)

        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        stack[-1][1].children.append(node)
        stack.append((indent, node))

    return root


def _postorder(root: Node) -> List[Node]:
    out: List[Node] = []

    def dfs(n: Node) -> None:
        for ch in n.children:
            dfs(ch)
        out.append(n)

    dfs(root)
    return out


def _compute_lmd_and_keyroots(root: Node) -> Tuple[List[int], List[int], List[Node]]:
    nodes = _postorder(root)
    n = len(nodes)
    index_by_id = {id(node): i + 1 for i, node in enumerate(nodes)}  # 1-based

    def leftmost_descendant_index(node: Node) -> int:
        cur = node
        while cur.children:
            cur = cur.children[0]
        return index_by_id[id(cur)]

    lmd = [0] * (n + 1)
    for i, node in enumerate(nodes, start=1):
        lmd[i] = leftmost_descendant_index(node)

    last_for_lmd: Dict[int, int] = {}
    for i in range(1, n + 1):
        last_for_lmd[lmd[i]] = i
    keyroots = sorted(last_for_lmd.values())

    return lmd, keyroots, nodes


def tree_edit_distance(pred: Node, gold: Node, mode: str = "strict") -> Tuple[int, int, int]:
    """Zhang–Shasha ordered tree edit distance (unit costs)."""

    lmd1, key1, nodes1 = _compute_lmd_and_keyroots(pred)
    lmd2, key2, nodes2 = _compute_lmd_and_keyroots(gold)
    n1, n2 = len(nodes1), len(nodes2)

    def rename_cost(a: Node, b: Node) -> int:
        return 0 if normalize_label(a.label, mode) == normalize_label(b.label, mode) else 1

    treedist = [[0] * (n2 + 1) for _ in range(n1 + 1)]

    for i in key1:
        for j in key2:
            m = i - lmd1[i] + 2
            n = j - lmd2[j] + 2
            fd = [[0] * n for _ in range(m)]

            for di in range(1, m):
                fd[di][0] = fd[di - 1][0] + 1
            for dj in range(1, n):
                fd[0][dj] = fd[0][dj - 1] + 1

            for di in range(1, m):
                for dj in range(1, n):
                    i_idx = lmd1[i] + di - 1
                    j_idx = lmd2[j] + dj - 1

                    if lmd1[i_idx] == lmd1[i] and lmd2[j_idx] == lmd2[j]:
                        fd[di][dj] = min(
                            fd[di - 1][dj] + 1,
                            fd[di][dj - 1] + 1,
                            fd[di - 1][dj - 1] + rename_cost(nodes1[i_idx - 1], nodes2[j_idx - 1]),
                        )
                        treedist[i_idx][j_idx] = fd[di][dj]
                    else:
                        fd[di][dj] = min(
                            fd[di - 1][dj] + 1,
                            fd[di][dj - 1] + 1,
                            fd[di - 1][dj - 1] + treedist[i_idx][j_idx],
                        )

    dist = treedist[n1][n2]
    return dist, max(n1 - 1, 0), max(n2 - 1, 0)


def collect_headings(root: Node, mode: str) -> List[Tuple[str, Optional[int]]]:
    out: List[Tuple[str, Optional[int]]] = []

    def dfs(n: Node) -> None:
        for ch in n.children:
            out.append((normalize_label(ch.label, mode), ch.page))
            dfs(ch)

    dfs(root)
    return out


def evaluate(gold_path: str, pred_path: str, mode: str = "strict", evaluate_pages: bool = False) -> Dict:
    gold = parse_toc_md(gold_path)
    pred = parse_toc_md(pred_path)

    gold_list = collect_headings(gold, mode)
    pred_list = collect_headings(pred, mode)

    gold_set = {h for h, _ in gold_list}
    pred_set = {h for h, _ in pred_list}
    inter = gold_set & pred_set

    precision = len(inter) / len(pred_set) if pred_set else 0.0
    recall = len(inter) / len(gold_set) if gold_set else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    page_metrics = None
    if evaluate_pages:
        gold_pages = {h: p for h, p in gold_list if p is not None}
        pred_pages = {h: p for h, p in pred_list if p is not None}
        matched = [h for h in inter if h in gold_pages and h in pred_pages]
        if matched:
            exact = sum(1 for h in matched if gold_pages[h] == pred_pages[h])
            maes = [abs(gold_pages[h] - pred_pages[h]) for h in matched]
            page_metrics = {
                "matched_with_pages": len(matched),
                "page_exact_match_rate": exact / len(matched),
                "page_mae": sum(maes) / len(maes),
            }
        else:
            page_metrics = {"matched_with_pages": 0, "page_exact_match_rate": None, "page_mae": None}

    dist, n_pred, n_gold = tree_edit_distance(pred, gold, mode=mode)
    denom = max(n_pred, n_gold)
    norm = dist / denom if denom else 0.0
    similarity = 1.0 - norm

    hallucinated = sorted(pred_set - gold_set)
    omitted = sorted(gold_set - pred_set)

    return {
        "mode": mode,
        "headings": {
            "gold_count": len(gold_set),
            "pred_count": len(pred_set),
            "matched": len(inter),
            "precision": precision,
            "recall": recall,
            "f1": f1,
        },
        "pages": page_metrics,
        "hierarchy": {
            "tree_edit_distance": dist,
            "nodes_pred": n_pred,
            "nodes_gold": n_gold,
            "normalized_ted": norm,
            "tree_similarity": similarity,
        },
        "errors": {
            "hallucinated_count": len(hallucinated),
            "omitted_count": len(omitted),
            "hallucinated_headings_sample": hallucinated[:50],
            "omitted_headings_sample": omitted[:50],
        },
    }


def _print_human(res: Dict, show_pages: bool) -> None:
    h = res["headings"]
    print(f"Mode: {res['mode']}")

    print("\n== Headings ==")
    print(f"Gold: {h['gold_count']} | Pred: {h['pred_count']} | Matched: {h['matched']}")
    print(f"Precision: {h['precision']:.3f} | Recall: {h['recall']:.3f} | F1: {h['f1']:.3f}")

    if show_pages:
        print("\n== Pages ==")
        p = res.get("pages")
        if not p:
            print("(no page metrics)")
        else:
            print(f"Matched w/ pages: {p['matched_with_pages']}")
            if p["page_exact_match_rate"] is None:
                print("PageExact@Match: n/a")
                print("PageMAE: n/a")
            else:
                print(f"PageExact@Match: {p['page_exact_match_rate']:.3f}")
                print(f"PageMAE: {p['page_mae']:.3f}")

    hi = res["hierarchy"]
    print("\n== Hierarchy (TED) ==")
    print(f"TED: {hi['tree_edit_distance']} | Nodes pred: {hi['nodes_pred']} | Nodes gold: {hi['nodes_gold']}")
    print(f"Normalized TED: {hi['normalized_ted']:.3f} | TreeSimilarity: {hi['tree_similarity']:.3f}")

    e = res["errors"]
    print("\n== Errors (samples) ==")
    print(f"Hallucinated: {e['hallucinated_count']} | Omitted: {e['omitted_count']}")


def main(argv: Optional[Iterable[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Evaluate a model-generated TOC Markdown vs gold TOC.")
    ap.add_argument("--gold", required=True, help="Path to gold TOC markdown")
    ap.add_argument("--pred", required=True, help="Path to predicted TOC markdown")
    ap.add_argument("--mode", choices=["strict", "loose"], default="strict", help="Label normalization mode")
    ap.add_argument("--pages", action="store_true", help="Evaluate page number accuracy when available")
    ap.add_argument("--json", action="store_true", help="Print JSON output only")
    args = ap.parse_args(list(argv) if argv is not None else None)

    res = evaluate(args.gold, args.pred, mode=args.mode, evaluate_pages=args.pages)

    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return 0

    _print_human(res, show_pages=args.pages)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())