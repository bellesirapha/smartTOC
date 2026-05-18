import React, { useState } from 'react';
import type { TocNode } from '../types';
import './SortableTocItem.css';

interface Props {
  node: TocNode;
  depth: number;
  onClick: (node: TocNode) => void;
  onDelete: (nodeId: string) => void;
  /** Confirm an Unknown/Omitted node — flips status to user_confirmed */
  onConfirm?: (nodeId: string) => void;
  /** Insert a new node below this one */
  onInsertBelow?: (nodeId: string) => void;
}

/**
 * TocItem — a single TOC entry row.
 *
 * View-mostly: drag-and-drop reordering and inline label editing have
 * been removed. Users can still click an entry to navigate the PDF,
 * collapse/expand subtrees, confirm Unknown/Omitted entries, insert a
 * sibling below, or delete an entry.
 *
 * (Component name retained to avoid churn across imports.)
 */
export const SortableTocItem: React.FC<Props> = ({
  node,
  depth,
  onClick,
  onDelete,
  onConfirm,
  onInsertBelow,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const style: React.CSSProperties = {
    paddingLeft: `${16 + depth * 20}px`,
  };

  const isUnknown = node.status === 'unknown';
  const isOmitted = node.status === 'omitted';
  const isUserConfirmed = node.status === 'user_confirmed';

  return (
    <li
      style={style}
      className={`toc-item ${isUnknown ? 'toc-item--unknown' : ''} ${isOmitted ? 'toc-item--omitted' : ''} ${node.manual ? 'toc-item--manual' : ''}`}
    >
      <div className="toc-item__row">
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

        {/* Label — click navigates the PDF to this entry's page */}
        <span
          className="toc-item__label"
          onClick={() => onClick(node)}
          title={`Jump to page ${node.page}`}
        >
          {isUnknown && (
            <button
              className="toc-item__unknown-badge toc-item__unknown-badge--btn"
              title="Click to confirm accuracy"
              onClick={(e) => { e.stopPropagation(); onConfirm?.(node.id); }}
            >?</button>
          )}
          {isOmitted && (
            <button
              className="toc-item__omitted-badge toc-item__omitted-badge--btn"
              title="Excluded by AI — click to keep as a heading"
              onClick={(e) => { e.stopPropagation(); onConfirm?.(node.id); }}
            >⊘</button>
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

        {/* Page number */}
        <span className="toc-item__page">p.{node.page}</span>

        {/* Actions */}
        <div className="toc-item__actions">
          <button
            className="toc-item__btn toc-item__btn--add"
            onClick={(e) => { e.stopPropagation(); onInsertBelow?.(node.id); }}
            title="Insert entry below"
          >
            +
          </button>
          <button
            className="toc-item__btn toc-item__btn--delete"
            onClick={() => onDelete(node.id)}
            title="Delete entry"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Children */}
      {node.children.length > 0 && !collapsed && (
        <ul className="toc-item__children">
          {node.children.map((child) => (
            <SortableTocItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onClick={onClick}
              onDelete={onDelete}
              onConfirm={onConfirm}
              onInsertBelow={onInsertBelow}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
