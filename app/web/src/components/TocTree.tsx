/**
 * TocTree — left pane
 *
 * Renders the hierarchical TOC as a view-mostly list:
 *   - Click to navigate the PDF
 *   - Confirm Unknown / Uncategorized entries
 *   - Insert / delete entries
 *   - "Unknown" and "Uncategorized" section dividers
 *   - "View Audit Trail" button
 *
 * Drag-and-drop reordering and inline label editing have been removed
 * intentionally — TOC entries are no longer editable in place.
 */

import React from 'react';
import type { TocNode as TocNodeType } from '../types';
import { SortableTocItem } from './SortableTocItem';
import './TocTree.css';

interface Props {
  nodes: TocNode[];
  onNodeClick: (node: TocNodeType) => void;
  onAuditTrailOpen: () => void;
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
  /** Save-as-copy callback — exposed via the Save split-button dropdown */
  onSaveAsCopy?: () => void;
  /** Discard the generated TOC and return to the pre-generate state */
  onCancel?: () => void;
}

// Re-export for convenience
export type TocNode = TocNodeType;

/** Find the index where the first node of a given status appears
 *  (or -1 if none). Used to position inline section dividers. */
function firstIndexOfStatus(
  nodes: TocNodeType[],
  status: TocNodeType['status']
): number {
  return nodes.findIndex((n) => n.status === status);
}

export const TocTree: React.FC<Props> = ({
  nodes,
  onNodeClick,
  onAuditTrailOpen,
  onNodeDeleted,
  onNodeConfirmed,
  onNodeInsertBelow,
  onGenerateToc,
  pdfReady,
  generating,
  llmRefining,
  generationStatus,
  onSave,
  onSaveAsCopy,
  onCancel,
}) => {
  const unmappedIdx = firstIndexOfStatus(nodes, 'unknown');
  const unmappedCount = nodes.filter((n) => n.status === 'unknown').length;
  const omittedIdx = firstIndexOfStatus(nodes, 'omitted');
  const omittedCount = nodes.filter((n) => n.status === 'omitted').length;

  // Save split-button dropdown
  const [saveMenuOpen, setSaveMenuOpen] = React.useState(false);
  const saveMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!saveMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!saveMenuRef.current?.contains(e.target as Node)) {
        setSaveMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSaveMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [saveMenuOpen]);

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


      {!generating && nodes.length === 0 && (
        <div className="toc-tree__empty">
          {pdfReady
            ? 'PDF loaded. Click ✨ Generate to build the Table of Contents.'
            : 'No TOC generated yet. Upload a PDF to begin.'}
        </div>
      )}

      {nodes.length > 0 && (
        <ul className="toc-tree__list">
          {nodes.map((node, idx) => (
            <React.Fragment key={node.id}>
              {/* Inline divider before the first unmapped node */}
              {unmappedIdx >= 0 && idx === unmappedIdx && (
                <li className="toc-tree__uncategorized-divider">
                  Unmapped ({unmappedCount})
                </li>
              )}
              {/* Inline divider before the first omitted node */}
              {omittedIdx >= 0 && idx === omittedIdx && (
                <li className="toc-tree__omitted-divider">
                  Uncategorized ({omittedCount})
                  <span className="toc-tree__omitted-hint">
                    AI excluded — click an entry to jump to its page,
                    or ⊘ to keep it as a heading
                  </span>
                </li>
              )}
              <SortableTocItem
                node={node}
                depth={0}
                onClick={onNodeClick}
                onDelete={onNodeDeleted}
                onConfirm={onNodeConfirmed}
                onInsertBelow={onNodeInsertBelow}
              />
            </React.Fragment>
          ))}
        </ul>
      )}

      {nodes.length > 0 && (
        <div className="toc-tree__footer">
          <div className="toc-tree__footer-actions">
            {onSave && (
              <div className="toc-tree__save-split" ref={saveMenuRef}>
                <button
                  className="toc-tree__save-btn toc-tree__save-btn--primary"
                  onClick={() => { setSaveMenuOpen(false); onSave(); }}
                  title="Save TOC"
                >
                  💾 Save
                </button>
                <button
                  className="toc-tree__save-btn toc-tree__save-caret"
                  onClick={() => setSaveMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={saveMenuOpen}
                  aria-label="More save options"
                  title="More save options"
                >
                  ▾
                </button>
                {saveMenuOpen && (
                  <div className="toc-tree__save-menu" role="menu">
                    <button
                      className="toc-tree__save-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setSaveMenuOpen(false);
                        onSaveAsCopy?.();
                      }}
                      disabled={!onSaveAsCopy}
                    >
                      Save as copy…
                    </button>
                  </div>
                )}
              </div>
            )}
            {onCancel && (
              <button
                className="toc-tree__cancel-btn"
                onClick={onCancel}
                title="Discard the generated TOC and start over"
              >
                ✕ Cancel
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
