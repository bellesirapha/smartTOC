/**
 * PdfViewer
 *
 * Renders a PDF using PDF.js, one page at a time.
 * Exposes a `targetPage` prop to jump to a specific page when a TOC entry is clicked.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import './PdfViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface Props {
  pdfUrl: string | null;
  targetPage: number;
  onPageChange?: (page: number) => void;
}

export const PdfViewer: React.FC<Props> = ({ pdfUrl, targetPage, onPageChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load PDF when URL changes
  useEffect(() => {
    if (!pdfUrl) {
      setPdf(null);
      setNumPages(0);
      return;
    }
    setLoading(true);
    setError(null);
    pdfjsLib
      .getDocument(pdfUrl)
      .promise.then((doc) => {
        setPdf(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch((err) => {
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });
  }, [pdfUrl]);

  // Jump to target page when TOC entry clicked
  useEffect(() => {
    if (targetPage >= 1 && targetPage <= numPages) {
      setCurrentPage(targetPage);
      onPageChange?.(targetPage);
    }
  }, [targetPage, numPages, onPageChange]);

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    pdf.getPage(currentPage).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;

      const containerWidth = containerRef.current?.clientWidth ?? 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      const task = page.render({ canvas, canvasContext: ctx, viewport: scaledViewport });
      renderTaskRef.current = task;
      task.promise.catch(() => {/* cancelled — ignore */});
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, currentPage]);

  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));

  if (!pdfUrl) {
    return (
      <div className="pdf-viewer pdf-viewer--empty">
        <p>Upload a PDF to begin.</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {loading && <div className="pdf-viewer__loading">Loading PDF…</div>}
      {error && <div className="pdf-viewer__error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="pdf-viewer__toolbar">
            <button onClick={prevPage} disabled={currentPage <= 1}>‹ Prev</button>
            <span>
              Page {currentPage} of {numPages}
            </span>
            <button onClick={nextPage} disabled={currentPage >= numPages}>
              Next ›
            </button>
          </div>
          <div className="pdf-viewer__canvas-wrap">
            <canvas ref={canvasRef} />
          </div>
        </>
      )}
    </div>
  );
};
