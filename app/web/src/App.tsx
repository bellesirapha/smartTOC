import React, { useCallback, useRef, useState } from 'react';
import { PdfViewer } from './components/PdfViewer';
import { TocTree } from './components/TocTree';
import { AuditTrailPane } from './components/AuditTrailPane';
import { LlmConfigModal } from './components/LlmConfigModal';
import type { AppState, TocNode } from './types';
import { extractTocHeuristic, refineTocNodesWithLlm, loadPdf, flattenToc } from './lib/tocExtractor';
import { tocNodesToMarkdown } from './lib/tocMarkdown';
import { appendEvent, createAuditLog } from './lib/auditLog';
import {
  type LlmConfig,
  loadEnvLlmConfig,
  loadLlmConfig,
  saveLlmConfig,
  clearLlmConfig,
} from './lib/llmRefinement';
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
  // LLM config: prefer env vars, fall back to sessionStorage, or prompt user
  const [llmConfig, setLlmConfig] = useState<LlmConfig | null>(
    () => loadEnvLlmConfig() ?? loadLlmConfig()
  );
  const [llmRefining, setLlmRefining] = useState(false);
  const [showLlmModal, setShowLlmModal] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  /** Count of nodes whose confidence was updated by the LLM pass (cleared on new generation) */
  const [llmRefinedCount, setLlmRefinedCount] = useState<{ refined: number; total: number } | null>(null);
  const isResizing = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // Store the loaded PDFDocumentProxy so generation can be deferred
  const pdfProxyRef = useRef<Awaited<ReturnType<typeof loadPdf>> | null>(null);
  // Holds heuristic nodes while waiting for the user to configure LLM
  const pendingHeuristicNodesRef = useRef<TocNode[] | null>(null);

  // ── Eval: silently save TOC markdown + run evaluate_toc.py ──────
  const saveTocForEval = useCallback((nodes: TocNode[], fileName: string) => {
    if (nodes.length === 0) return;
    const docTitle = fileName.replace(/\.pdf$/i, '');
    const markdown = tocNodesToMarkdown(nodes, docTitle);
    fetch('/api/save-toc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.evalOutput) {
          console.groupCollapsed('[smartTOC eval] Results — ' + new Date().toLocaleTimeString());
          console.log(result.evalOutput);
          console.groupEnd();
        }
      })
      .catch(() => { /* eval endpoint only available in dev */ });
  }, []);

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
      const maxTocByPdf = rect.width - PDF_MIN - auditOffset - 6; // 6 = handle width
      const maxTocByPct = Math.floor(rect.width * 0.30);
      const maxToc = Math.min(maxTocByPdf, maxTocByPct);
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

  // ── Phase 2: LLM verification pass on top of heuristic nodes ────
  const runLlmRefinementPass = useCallback(async (
    heuristicNodes: TocNode[],
    config: LlmConfig,
    fileName: string
  ) => {
    setLlmRefining(true);
    setGenerationStatus('Verifying with AI…');
    try {
      const refinedNodes = await refineTocNodesWithLlm(heuristicNodes, config, {
        onProgress: (step) => setGenerationStatus(step),
      });
      setGenerationStatus('');
      const flat = flattenToc(refinedNodes);
      const refinedCount = flat.filter((n) => n.refined).length;
      setLlmRefinedCount({ refined: refinedCount, total: flat.length });
      setState((s) => ({
        ...s,
        tocNodes: refinedNodes,
        auditLog: appendEvent(
          s.auditLog,
          'generated',
          `LLM verified and refined TOC to ${flat.length} entries (${refinedCount} confidence scores updated) from "${fileName}"`
        ),
      }));
      saveTocForEval(refinedNodes, fileName);
    } catch (err) {
      setGenerationStatus('');
      console.warn('[App] LLM refinement pass failed, keeping heuristic result:', err);
    } finally {
      setLlmRefining(false);
    }
  }, [saveTocForEval]);

  // ── Phase 1: deterministic extraction → show immediately ─────────
  const handleGenerateToc = useCallback(async () => {
    const pdf = pdfProxyRef.current;
    if (!pdf) return;
    const fileName = state.pdfFile?.name ?? 'document';

    setGenerationStatus('Starting…');
    setLlmRefinedCount(null);
    setState((s) => ({ ...s, generating: true, tocNodes: [], auditLog: createAuditLog() }));

    let heuristicNodes: TocNode[] = [];
    try {
      heuristicNodes = await extractTocHeuristic(pdf, {
        onProgress: (step) => setGenerationStatus(step),
      });
    } catch (err) {
      setGenerationStatus('');
      setState((s) => ({ ...s, generating: false }));
      console.error('TOC extraction failed:', err);
      return;
    }

    // Show heuristic result immediately — user sees headings right away
    setGenerationStatus('');
    setState((s) => ({
      ...s,
      tocNodes: heuristicNodes,
      generating: false,
      auditLog: appendEvent(
        s.auditLog,
        'generated',
        `Extracted ${flattenToc(heuristicNodes).length} heading candidates from "${fileName}" (heuristic pass)`
      ),
    }));

    // Phase 2 — LLM verification
    if (llmConfig) {
      await runLlmRefinementPass(heuristicNodes, llmConfig, fileName);
      // saveTocForEval is called inside runLlmRefinementPass after success
    } else {
      // No LLM config — save heuristic result for eval and prompt user
      saveTocForEval(heuristicNodes, fileName);
      pendingHeuristicNodesRef.current = heuristicNodes;
      setShowLlmModal(true);
    }
  }, [state.pdfFile, llmConfig, runLlmRefinementPass, saveTocForEval]);

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

  const handleConfirmAll = useCallback(() => {
    setState((s) => ({
      ...s,
      tocNodes: confirmAllNodes(s.tocNodes),
      auditLog: appendEvent(
        s.auditLog, 'confirmed_unknown',
        'User confirmed all TOC entries (Confirm All)'
      ),
    }));
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


  const handleLlmModalSave = useCallback((config: LlmConfig) => {
    saveLlmConfig(config);
    setLlmConfig(config);
    setShowLlmModal(false);
    const pending = pendingHeuristicNodesRef.current;
    pendingHeuristicNodesRef.current = null;
    if (pending) {
      const fileName = state.pdfFile?.name ?? 'document';
      void runLlmRefinementPass(pending, config, fileName);
    }
  }, [runLlmRefinementPass, state.pdfFile]);

  const handleLlmModalSkip = useCallback(() => {
    pendingHeuristicNodesRef.current = null;
    setShowLlmModal(false);
  }, []);

  const handleLlmModalClear = useCallback(() => {
    clearLlmConfig();
    setLlmConfig(null);
    setShowLlmModal(false);
  }, []);

  const handleAuditTrailOpen = useCallback(() => {
    setState((s) => ({ ...s, auditPaneOpen: true }));
  }, []);

  const handleAuditTrailClose = useCallback(() => {
    setState((s) => ({ ...s, auditPaneOpen: false }));
  }, []);

  const handleSave = useCallback(() => {
    setState((s) => ({
      ...s,
      auditLog: appendEvent(s.auditLog, 'saved', 'TOC saved by user'),
    }));
    alert('TOC saved. (PDF bookmark embedding requires a server-side component — audit log updated.)');
  }, []);

  const hasToc = state.tocNodes.length > 0 || state.generating;
  const pdfReady = !!state.pdfUrl && !state.generating;

  return (
    <div className={`app${resizing ? ' app--resizing' : ''}`}>
      <div className="app__toolbar">
        <span className="app__brand">📑 smartTOC</span>
        <label className="app__upload-btn">
          Upload PDF
          <input type="file" accept="application/pdf" onChange={handleFileInput} style={{ display: 'none' }} />
        </label>
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
                onConfirmAll={handleConfirmAll}
                generating={state.generating}
                llmRefining={llmRefining}
                generationStatus={generationStatus}
                llmRefinedCount={llmRefinedCount}
                onSave={hasToc ? handleSave : undefined}
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
      {showLlmModal && (
        <LlmConfigModal
          initial={llmConfig}
          onSave={handleLlmModalSave}
          onSkip={handleLlmModalSkip}
          onClear={handleLlmModalClear}
        />
      )}
    </div>
  );
}

function confirmAllNodes(nodes: TocNode[]): TocNode[] {
  return nodes.map((n) => ({
    ...n,
    status: n.manual ? n.status : 'user_confirmed' as const,
    confidence: n.manual ? n.confidence : 1.0,
    children: confirmAllNodes(n.children),
  }));
}

function confirmNodeStatus(nodes: TocNode[], id: string): TocNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, status: 'user_confirmed' as const, confidence: 1.0 }
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
