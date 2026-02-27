// ────────────────────────────────────────────────────────────────
// Core domain types — governed by CONSTITUTION.md
// ────────────────────────────────────────────────────────────────

export type TocNodeStatus = 'confirmed' | 'unknown' | 'user_confirmed';

export interface TocNode {
  /** Unique stable ID for this node */
  id: string;
  /** Heading text — never invented; "Unknown" when ambiguous */
  label: string;
  /** Heading depth: 1 = top-level, 2 = sub-heading, etc. */
  level: number;
  /** 1-based page number where this heading appears */
  page: number;
  /** Confidence score 0–1 from the extraction pass */
  confidence: number;
  /** Whether the node is a confirmed heading or an ambiguous one */
  status: TocNodeStatus;
  /** Child nodes (nested headings) */
  children: TocNode[];
  /** Whether this node was added manually (not by AI) */
  manual: boolean;
}

export type AuditEventKind =
  | 'generated'
  | 'edited_label'
  | 'moved'
  | 'added'
  | 'deleted'
  | 'saved'
  | 'confirmed_unknown';

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  timestamp: string; // ISO-8601
  /** Display name of the actor — defaults to "User" in static context */
  actor: string;
  nodeId?: string;
  nodeLabel?: string;
  /** Human-readable description of what changed */
  description: string;
}

export interface AuditLog {
  /** Immutable — entries are only ever appended */
  entries: AuditEvent[];
}

export interface AppState {
  pdfFile: File | null;
  pdfUrl: string | null;
  tocNodes: TocNode[];
  auditLog: AuditLog;
  generating: boolean;
  acknowledged: boolean; // user acknowledged AI disclosure
  auditPaneOpen: boolean;
  activePage: number;
}
