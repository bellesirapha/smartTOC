import React, { useCallback, useRef, useState } from 'react';
import { AiDisclosureBanner } from './components/AiDisclosureBanner';
import { PdfViewer } from './components/PdfViewer';
import { TocTree } from './components/TocTree';
import { AuditTrailPane } from './components/AuditTrailPane';
import type { AppState, TocNode } from './types';
import { extractToc, loadPdf, flattenToc } from './lib/tocExtractor';
import { appendEvent, createAuditLog } from './lib/auditLog';
import './App.css';

const INITIAL_STATE: AppState = {
  pdfFile: null,
  pdfUrl: null,
  tocNodes: [],
  auditLog: createAuditLog(),
  generating: false,
  acknowledged: false,
  auditPaneOpen: false,
  activePage: 1,
};

export default function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [tocWidth, setTocWidth] = useState(280);
  const [resizing, setResizing] = useState(false);
  const isResizing = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // Store the loaded PDFDocumentProxy so generation can be deferred
  const pdfProxyRef = useRef<Awaited<ReturnType<typeof loadPdf>> | null>(null);

  const TOC_MIN = 180;
  const PDF_MIN = 400;
  const AUDIT_WIDTH = 300;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setResizing(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const auditOffset = state.auditPaneOpen ? AUDIT_WIDTH : 0;
      const maxToc = rect.width - PDF_MIN - auditOffset - 6; // 6 = handle width
      const newWidth = Math.min(Math.max(ev.clientX - rect.left, TOC_MIN), maxToc);
      setTocWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      setResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [state.auditPaneOpen]);

  const handleFileSelected = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    pdfProxyRef.current = null;
    setState((s) => ({
      ...s, pdfFile: file, pdfUrl: url, tocNodes: [],
      auditLog: createAuditLog(), generating: false, acknowledged: false,
    }));
    try {
      pdfProxyRef.current = await loadPdf(url);
    } catch (err) {
      console.error('PDF load failed:', err);
    }
  }, []);

  const handleGenerateToc = useCallback(async () => {
    const pdf = pdfProxyRef.current;
    if (!pdf) return;
    const fileName = state.pdfFile?.name ?? 'document';
    setState((s) => ({ ...s, generating: true, tocNodes: [], auditLog: createAuditLog() }));
    try {
      const nodes = await extractToc(pdf);
      setState((s) => ({
        ...s,
        tocNodes: nodes,
        generating: false,
        auditLog: appendEvent(
          s.auditLog, 'generated',
          `AI generated TOC with ${flattenToc(nodes).length} entries from "${fileName}"`
        ),
      }));
    } catch (err) {
      setState((s) => ({ ...s, generating: false }));
      console.error('TOC extraction failed:', err);
    }
  }, [state.pdfFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') handleFileSelected(file);
  }, [handleFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = '';
  }, [handleFileSelected]);

  const handleAcknowledge = useCallback(() => {
    setState((s) => ({ ...s, acknowledged: true }));
  }, []);

  const handleNodesChange = useCallback((nodes: TocNode[]) => {
    setState((s) => ({
      ...s, tocNodes: nodes,
      auditLog: appendEvent(s.auditLog, 'moved', 'TOC entry reordered via drag-and-drop'),
    }));
  }, []);

  const handleNodeClick = useCallback((node: TocNode) => {
    setState((s) => ({ ...s, activePage: node.page }));
  }, []);

  const handleNodeEdited = useCallback((nodeId: string, newLabel: string) => {
    setState((s) => {
      const node = findNode(s.tocNodes, nodeId);
      return {
        ...s,
        tocNodes: editNodeLabel(s.tocNodes, nodeId, newLabel),
        auditLog: appendEvent(
          s.auditLog, 'edited_label',
          `Label changed from "${node?.label ?? '?'}" to "${newLabel}"`,
          { nodeId, nodeLabel: newLabel }
        ),
      };
    });
  }, []);

  const handleNodeDeleted = useCallback((nodeId: string) => {
    setState((s) => {
      const node = findNode(s.tocNodes, nodeId);
      return {
        ...s,
        tocNodes: deleteNode(s.tocNodes, nodeId),
        auditLog: appendEvent(
          s.auditLog, 'deleted',
          `Deleted entry "${node?.label ?? nodeId}"`,
          { nodeId, nodeLabel: node?.label }
        ),
      };
    });
  }, []);

  const handleNodeConfirmed = useCallback((nodeId: string) => {
    setState((s) => {
      const node = findNode(s.tocNodes, nodeId);
      return {
        ...s,
        tocNodes: confirmNodeStatus(s.tocNodes, nodeId),
        auditLog: appendEvent(
          s.auditLog, 'confirmed_unknown',
          `User confirmed accuracy of "${node?.label ?? nodeId}"`,
          { nodeId, nodeLabel: node?.label }
        ),
      };
    });
  }, []);


  const handleAuditTrailOpen = useCallback(() => {
    setState((s) => ({ ...s, auditPaneOpen: true }));
  }, []);

  const handleAuditTrailClose = useCallback(() => {
    setState((s) => ({ ...s, auditPaneOpen: false }));
  }, []);

  const handleSave = useCallback(() => {
    if (!state.acknowledged) {
      alert('Please acknowledge the AI-generated content warning before saving.');
      return;
    }
    setState((s) => ({
      ...s,
      auditLog: appendEvent(s.auditLog, 'saved', 'TOC saved by user'),
    }));
    alert('TOC saved. (PDF bookmark embedding requires a server-side component — audit log updated.)');
  }, [state.acknowledged]);

  const hasToc = state.tocNodes.length > 0 || state.generating;
  const pdfReady = !!state.pdfUrl && !state.generating;

  return (
    <div className={`app${resizing ? ' app--resizing' : ''}`}>
      {hasToc && (
        <AiDisclosureBanner
          acknowledged={state.acknowledged}
          onAcknowledge={handleAcknowledge}
        />
      )}

      <div className="app__toolbar">
        <span className="app__brand">📑 smartTOC</span>
        <label className="app__upload-btn">
          Upload PDF
          <input type="file" accept="application/pdf" onChange={handleFileInput} style={{ display: 'none' }} />
        </label>
        {hasToc && (
          <button
            className={`app__save-btn ${!state.acknowledged ? 'app__save-btn--disabled' : ''}`}
            onClick={handleSave}
          >
            💾 Save TOC
          </button>
        )}
      </div>

      <div className="app__workspace" ref={workspaceRef} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {!state.pdfUrl ? (
          <div className="app__dropzone">
            <div className="app__dropzone-inner">
              <div className="app__dropzone-icon">📄</div>
              <p>Drag &amp; drop a PDF here</p>
              <p>or</p>
              <label className="app__upload-btn app__upload-btn--large">
                Choose file
                <input type="file" accept="application/pdf" onChange={handleFileInput} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        ) : (
          <>
            <div className="app__pane app__pane--toc" style={{ width: tocWidth }}>
              <TocTree
                nodes={state.tocNodes}
                onNodesChange={handleNodesChange}
                onGenerateToc={handleGenerateToc}
                pdfReady={pdfReady}
                onNodeClick={handleNodeClick}
                onAuditTrailOpen={handleAuditTrailOpen}
                onNodeEdited={handleNodeEdited}
                onNodeDeleted={handleNodeDeleted}
                onNodeConfirmed={handleNodeConfirmed}
                generating={state.generating}
              />
            </div>
            <div
              className="app__resize-handle"
              onMouseDown={handleResizeStart}
              title="Drag to resize"
            />
            <div className="app__pane app__pane--pdf">
              <PdfViewer pdfUrl={state.pdfUrl} targetPage={state.activePage} />
            </div>
            {state.auditPaneOpen && (
              <div className="app__pane app__pane--audit">
                <AuditTrailPane log={state.auditLog} onClose={handleAuditTrailClose} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function confirmNodeStatus(nodes: TocNode[], id: string): TocNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, status: 'user_confirmed' as const }
      : { ...n, children: confirmNodeStatus(n.children, id) }
  );
}

function editNodeLabel(nodes: TocNode[], id: string, label: string): TocNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, label } : { ...n, children: editNodeLabel(n.children, id, label) }
  );
}

function deleteNode(nodes: TocNode[], id: string): TocNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: deleteNode(n.children, id) }));
}

function findNode(nodes: TocNode[], id: string): TocNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}
