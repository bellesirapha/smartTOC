import React, { useEffect, useState } from 'react';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TocNode } from '../types';
import './SortableTocItem.css';

interface Props {
  node: TocNode;
  depth: number;
  onClick: (node: TocNode) => void;
  onEdit: (nodeId: string, newLabel: string) => void;
  onDelete: (nodeId: string) => void;
  /** Confirm an Unknown node's accuracy — flips status to user_confirmed */
  onConfirm?: (nodeId: string) => void;
  /** Called when a direct child of this node is reordered */
  onChildrenChange?: (parentId: string, newChildren: TocNode[]) => void;
}

export const SortableTocItem: React.FC<Props> = ({
  node,
  depth,
  onClick,
  onEdit,
  onDelete,
  onConfirm,
  onChildrenChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label);
  const [collapsed, setCollapsed] = useState(false);

  // Keep draft in sync when node label is updated externally (e.g. after LLM pass)
  useEffect(() => {
    if (!editing) setDraft(node.label);
  }, [node.label, editing]);

  const sensors = useSensors(useSensor(PointerSensor));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${16 + depth * 20}px`,
  };

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== node.label) {
      onEdit(node.id, trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') {
      setDraft(node.label);
      setEditing(false);
    }
  }

  function handleChildDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = node.children.findIndex((c) => c.id === active.id);
    const newIdx = node.children.findIndex((c) => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(node.children, oldIdx, newIdx);
    onChildrenChange?.(node.id, reordered);
  }

  const confidencePct = Math.round(node.confidence * 100);
  const isUnknown = node.status === 'unknown';
  const isUserConfirmed = node.status === 'user_confirmed';
  const isRefined = !!node.refined;

  /**
   * Build a tooltip that explains confidence criteria:
   * - Source: LLM-verified vs. heuristic-only
   * - Tier: what the score means
   * - Key signals that drive the score
   */
  function confidenceTooltip(pct: number, refined: boolean): string {
    const source = refined
      ? 'LLM-verified'
      : 'Heuristic (font size / weight)';
    let tier: string;
    let signals: string;
    if (pct >= 75) {
      tier = 'High';
      signals = refined
        ? 'Signals: numeric prefix, bold/large font, short phrase'
        : 'Signals: large font delta, bold weight';
    } else if (pct >= 40) {
      tier = 'Medium';
      signals = refined
        ? 'Signals: likely heading but ambiguous structure'
        : 'Signals: moderate font delta or bold only';
    } else {
      tier = 'Low — flagged for review';
      signals = refined
        ? 'Signals: ambiguous (no numeric prefix, not distinctly bold/large)'
        : 'Signals: small font delta, not bold';
    }
    return `Confidence: ${pct}% · ${tier}\nSource: ${source}\n${signals}`;
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`toc-item ${isUnknown ? 'toc-item--unknown' : ''} ${node.manual ? 'toc-item--manual' : ''}`}
    >
      <div className="toc-item__row">
        {/* Drag handle */}
        <span
          className="toc-item__drag-handle"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Collapse toggle (if has children) */}
        {node.children.length > 0 && (
          <button
            className="toc-item__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}

        {/* Label / edit input */}
        {editing ? (
          <input
            className="toc-item__edit-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <span
            className="toc-item__label"
            onClick={() => onClick(node)}
            onDoubleClick={(e) => { e.stopPropagation(); setDraft(node.label); setEditing(true); }}
            title={`Double-click to edit · Page ${node.page}`}
          >
            {isUnknown && (
              <button
                className="toc-item__unknown-badge toc-item__unknown-badge--btn"
                title="Click to confirm accuracy"
                onClick={(e) => { e.stopPropagation(); onConfirm?.(node.id); }}
              >?</button>
            )}
            {isUserConfirmed && (
              <span className="toc-item__userconfirmed-badge" title="Confirmed by user">✓</span>
            )}
            {node.label}
            {node.manual && (
              <span className="toc-item__manual-badge" title="Manually added">
                ✏
              </span>
            )}
          </span>
        )}

        {/* Page number */}
        <span className="toc-item__page">p.{node.page}</span>

        {/* Confidence */}
        {!node.manual && (
          <span
            className={`toc-item__confidence toc-item__confidence--${confidenceClass(node.confidence, node.status)}${isRefined && !isUserConfirmed ? ' toc-item__confidence--refined' : ''}`}
            title={confidenceTooltip(confidencePct, isRefined)}
          >
            {confidenceLabel(node.confidence, node.status)}
            {isRefined && !isUserConfirmed && <span className="toc-item__confidence-ai" aria-label="LLM-verified">·AI</span>}
          </span>
        )}

        {/* Actions */}
        <div className="toc-item__actions">
          <button
            className="toc-item__btn toc-item__btn--delete"
            onClick={() => onDelete(node.id)}
            title="Delete entry"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Children — each subtree gets its own DndContext */}
      {node.children.length > 0 && !collapsed && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleChildDragEnd}
        >
          <SortableContext
            items={node.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="toc-item__children">
              {node.children.map((child) => (
                <SortableTocItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onClick={onClick}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onConfirm={onConfirm}
                  onChildrenChange={onChildrenChange}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </li>
  );
};

function confidenceClass(c: number, status?: string): string {
  if (status === 'user_confirmed') return 'verified';
  if (c >= 0.75) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

function confidenceLabel(c: number, status?: string): string {
  if (status === 'user_confirmed') return 'Verified';
  if (c >= 0.75) return 'High';
  if (c >= 0.4) return 'Mid';
  return 'Low';
}


