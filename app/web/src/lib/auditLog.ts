import type { AuditEvent, AuditEventKind, AuditLog } from '../types';

let _seq = 0;

function nextId(): string {
  return `evt-${Date.now()}-${++_seq}`;
}

export function createAuditLog(): AuditLog {
  return { entries: [] };
}

export function appendEvent(
  log: AuditLog,
  kind: AuditEventKind,
  description: string,
  extra?: Partial<Pick<AuditEvent, 'nodeId' | 'nodeLabel'>>
): AuditLog {
  const event: AuditEvent = {
    id: nextId(),
    kind,
    timestamp: new Date().toISOString(),
    actor: 'User',
    description,
    ...extra,
  };
  // Immutable append — never modify existing entries
  return { entries: [...log.entries, event] };
}
