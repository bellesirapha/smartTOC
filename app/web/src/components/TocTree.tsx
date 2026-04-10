/**
 * TocTree — left pane
 *
 * Renders the hierarchical TOC with:
 *   - Drag-and-drop reorder/re-nest (@dnd-kit)
 *   - Inline label editing
 *   - Add / delete nodes
 *   - "Unknown" visual indicator
 *   - Confidence badge
 *   - "View Audit Trail" button
 */

import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import type { TocNode as TocNodeType } from '../types';
import { SortableTocItem } from './SortableTocItem';
import './TocTree.css';

interface Props {
  nodes: TocNode[];
  onNodesChange: (nodes: TocNode[]) => void;
  onNodeClick: (node: TocNodeType) => void;
  onAuditTrailOpen: () => void;
  onNodeEdited: (nodeId: string, newLabel: string) => void;
  onNodeDeleted: (nodeId: string) => void;
  onNodeConfirmed: (nodeId: string) => void;
  /** Insert a new node below the given nodeId */
  onNodeInsertBelow: (nodeId: string) => void;
  /** Trigger TOC generation from the loaded PDF */
  onGenerateToc: () => void;
  /** True when a PDF is loaded and ready for generation */
  pdfReady: boolean;
  generating: boolean;
  /** True while the secondary LLM verification pass is running */
  llmRefining?: boolean;
  /** Live progress text during generation (from extractToc onProgress) */
  generationStatus?: string;
  /** Save callback — shown in footer when TOC exists */
  onSave?: () => void;
  /** When set, shows how many nodes had confidence updated by LLM */
  llmRefinedCount?: { refined: number; total: number } | null;
}

// Re-export for convenience
export type TocNode = TocNodeType;

/** Recursively replace the children of the node with the given id */
function updateNodeChildren(
  nodes: TocNodeType[],
  parentId: string,
  newChildren: TocNodeType[]
): TocNodeType[] {
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: newChildren };
    return { ...n, children: updateNodeChildren(n.children, parentId, newChildren) };
  });
}

/** Sort top-level nodes: mapped first, then unknown — returns the index
 *  where the uncategorized section starts (or -1 if none). */
function uncategorizedStartIndex(nodes: TocNodeType[]): number {
  const idx = nodes.findIndex((n) => n.status === 'unknown');
  return idx;
}

export const TocTree: React.FC<Props> = ({
  nodes,
  onNodesChange,
  onNodeClick,
  onAuditTrailOpen,
  onNodeEdited,
  onNodeDeleted,
  onNodeConfirmed,
  onNodeInsertBelow,
  onGenerateToc,
  pdfReady,
  generating,
  llmRefining,
  generationStatus,
  onSave,
  llmRefinedCount,
}) => {
  const sensors = useSensors(useSensor(PointerSensor));

  const topLevelIds = nodes.map((n) => n.id);
  const uncatIdx = uncategorizedStartIndex(nodes);
  const uncatCount = uncatIdx >= 0 ? nodes.filter((n) => n.status === 'unknown').length : 0;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = nodes.findIndex((n) => n.id === active.id);
    const newIndex = nodes.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onNodesChange(arrayMove(nodes, oldIndex, newIndex));
  }

  function handleChildrenChange(parentId: string, newChildren: TocNodeType[]) {
    onNodesChange(updateNodeChildren(nodes, parentId, newChildren));
  }

  return (
    <div className="toc-tree">
      <div className="toc-tree__header">
        <span className="toc-tree__title">Table of Contents</span>
        <div className="toc-tree__header-actions">
          {pdfReady && nodes.length === 0 && (
            <button
              className="toc-tree__generate-btn"
              onClick={onGenerateToc}
              title="Generate TOC from PDF"
            >
              ✨ Generate
            </button>
          )}
          <button
            className="toc-tree__audit-btn"
            onClick={onAuditTrailOpen}
            title="View Audit Trail"
          >
            🕒 Audit Trail
          </button>
        </div>
      </div>

      {generating && (
        <div className="toc-tree__generating">
          {generationStatus || 'Generating TOC…'}
        </div>
      )}

      {llmRefining && (
        <div className="toc-tree__llm-refining">
          🤖 {generationStatus || 'AI verifying headings…'}
        </div>
      )}

      {!llmRefining && llmRefinedCount && (
        <div className="toc-tree__llm-verified">
          ✦ LLM verified {llmRefinedCount.total} headings
          {llmRefinedCount.refined > 0 && (
            <> — <strong>{llmRefinedCount.refined}</strong> confidence scores updated</>
          )}
          {llmRefinedCount.refined === 0 && <> — all scores match heuristic</>}
        </div>
      )}

      {!generating && nodes.length === 0 && (
        <div className="toc-tree__empty">
          {pdfReady
            ? 'PDF loaded. Click ✨ Generate to build the Table of Contents.'
            : 'No TOC generated yet. Upload a PDF to begin.'}
        </div>
      )}

      {nodes.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={topLevelIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="toc-tree__list">
              {nodes.map((node, idx) => (
                <React.Fragment key={node.id}>
                  {/* Inline divider before number the first uncategorized node */}
                  {uncatIdx >= 0 && idx === uncatIdx && (
                    <li className="toc-tree__uncategorized-divider">
                      Uncategorized ({uncatCount})
                    </li>
                  )}
                  <SortableTocItem
                    node={node}
                    depth={0}
                    onClick={onNodeClick}
                    onEdit={onNodeEdited}
                    onDelete={onNodeDeleted}
                    onConfirm={onNodeConfirmed}
                    onInsertBelow={onNodeInsertBelow}
                    onChildrenChange={handleChildrenChange}
                  />
                </React.Fragment>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {nodes.length > 0 && (
        <div className="toc-tree__footer">
          <div className="toc-tree__footer-actions">
            {onSave && (
              <button className="toc-tree__save-btn" onClick={onSave}>
                💾 Save
              </button>
            )}
          </div>
          <p className="toc-tree__ai-note">
            ⚠ AI-generated — verify before use
          </p>
        </div>
      )}
    </div>
  );
};
