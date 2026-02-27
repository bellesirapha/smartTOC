/**
 * AuditTrailPane — 3rd (rightmost) pane
 *
 * Per SPEC § 2.3: opens alongside the PDF Viewer (not replacing it).
 * Read-only, immutable log of all TOC generation and edit events.
 */

import React from 'react';
import type { AuditLog, AuditEventKind } from '../types';
import './AuditTrailPane.css';

interface Props {
  log: AuditLog;
  onClose: () => void;
}

const KIND_LABELS: Record<AuditEventKind, string> = {
  generated: '🤖 Generated',
  edited_label: '✏️ Edited',
  moved: '↕️ Moved',
  added: '➕ Added',
  deleted: '✕ Deleted',
  saved: '💾 Saved',
  confirmed_unknown: '✓ Confirmed',
};

export const AuditTrailPane: React.FC<Props> = ({ log, onClose }) => {
  return (
    <div className="audit-pane">
      <div className="audit-pane__header">
        <span className="audit-pane__title">Audit Trail</span>
        <button
          className="audit-pane__close-btn"
          onClick={onClose}
          aria-label="Close Audit Trail"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="audit-pane__body">
        {log.entries.length === 0 && (
          <p className="audit-pane__empty">No events recorded yet.</p>
        )}

        <ol className="audit-pane__list">
          {[...log.entries].reverse().map((evt) => (
            <li key={evt.id} className={`audit-evt audit-evt--${evt.kind}`}>
              <div className="audit-evt__kind">
                {KIND_LABELS[evt.kind] ?? evt.kind}
              </div>
              <div className="audit-evt__desc">{evt.description}</div>
              {evt.nodeLabel && (
                <div className="audit-evt__node">
                  Node: <em>{evt.nodeLabel}</em>
                </div>
              )}
              <div className="audit-evt__meta">
                <span className="audit-evt__actor">{evt.actor}</span>
                <span className="audit-evt__time">
                  {new Date(evt.timestamp).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
