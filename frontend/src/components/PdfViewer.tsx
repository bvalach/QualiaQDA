import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useProject } from '../contexts/ProjectContext';
import { CodeAssignMenu } from './CodeAssignMenu';
import * as api from '../api';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Props {
  documentId: string;
  pageCount: number;
}

interface PdfSelection {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
}

export function PdfViewer({ documentId, pageCount }: Props) {
  const { state, dispatch, refreshCodings } = useProject();
  const { currentPage } = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.5);
  const [rendering, setRendering] = useState(false);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const selectionRef = useRef<PdfSelection | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      const url = `/api/documents/${documentId}/image`;
      const doc = await pdfjsLib.getDocument(url).promise;
      if (!cancelled) setPdfDoc(doc);
    };
    loadPdf().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Render current page: canvas + text layer
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current || !pageRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    const renderPage = async () => {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled || !canvasRef.current || !textLayerRef.current || !pageRef.current) return;

        const viewport = page.getViewport({ scale });
        const scaleFactor = `${viewport.scale}`;
        const pageDiv = pageRef.current;
        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;
        const context = canvas.getContext('2d', { alpha: false });

        if (!context) return;

        pageDiv.style.setProperty('--scale-factor', scaleFactor);
        pdfjsLib.setLayerDimensions(pageDiv, viewport);

        textLayerDiv.replaceChildren();
        textLayerDiv.style.setProperty('--scale-factor', scaleFactor);
        pdfjsLib.setLayerDimensions(textLayerDiv, viewport);

        const outputScale = new pdfjsLib.OutputScale();
        const canvasWidth = Math.max(1, Math.ceil(viewport.width * outputScale.sx));
        const canvasHeight = Math.max(1, Math.ceil(viewport.height * outputScale.sy));
        const transform = outputScale.scaled
          ? [canvasWidth / viewport.width, 0, 0, canvasHeight / viewport.height, 0, 0]
          : undefined;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        renderTask = page.render({ canvasContext: context, viewport, transform });
        await renderTask.promise;

        if (cancelled) return;

        textLayer = new TextLayer({
          textContentSource: page.streamTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();

        const endOfContent = document.createElement('div');
        endOfContent.className = 'endOfContent';
        textLayerDiv.append(endOfContent);
      } catch (err) {
        if (
          err instanceof pdfjsLib.RenderingCancelledException ||
          (err instanceof Error && err.name === 'AbortException')
        ) {
          return;
        }
        console.error('[PDF Page] Rendering failed:', err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderPage().catch(console.error);
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdfDoc, currentPage, scale]);

  // Handle text selection in text layer
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !textLayerRef.current) return;

    const selectedText = sel.toString();
    if (!selectedText.trim()) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const preRange = document.createRange();
    preRange.selectNodeContents(textLayerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;

    const selData: PdfSelection = {
      start: startOffset,
      end: startOffset + selectedText.length,
      text: selectedText,
      x: rect.right + 8,
      y: rect.top,
    };
    setSelection(selData);
    selectionRef.current = selData;
  }, []);

  const handleAssignCode = async (codeId: string) => {
    if (!selection) return;
    await api.createCoding({
      document_id: documentId,
      code_id: codeId,
      start_pos: selection.start,
      end_pos: selection.end,
      text: selection.text,
      page_number: currentPage,
    });
    setSelection(null);
    selectionRef.current = null;
    window.getSelection()?.removeAllRanges();
    await refreshCodings();
  };

  const dismissSelection = () => {
    setSelection(null);
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const codeId = e.dataTransfer.getData('application/qualia-code-id');
      const sel = selectionRef.current;
      if (codeId && sel) {
        await api.createCoding({
          document_id: documentId,
          code_id: codeId,
          start_pos: sel.start,
          end_pos: sel.end,
          text: sel.text,
          page_number: currentPage,
        });
        selectionRef.current = null;
        setSelection(null);
        window.getSelection()?.removeAllRanges();
        await refreshCodings();
      }
    },
    [documentId, currentPage, refreshCodings]
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);
  const fitWidth = useCallback(() => {
    if (!containerRef.current || !pdfDoc) return;
    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current!.clientWidth - 48;
      setScale(containerWidth / viewport.width);
    });
  }, [pdfDoc, currentPage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* PDF toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <button className="ghost small" onClick={zoomOut} title="Reducir">
          -
        </button>
        <span style={{ color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button className="ghost small" onClick={zoomIn} title="Ampliar">
          +
        </button>
        <button className="ghost small" onClick={fitWidth} title="Ajustar al ancho">
          Ajustar
        </button>
        <div className="separator" />
        <span style={{ color: 'var(--text-muted)' }}>
          {rendering ? 'Renderizando...' : `Pagina ${currentPage} de ${pageCount}`}
        </span>
      </div>

      {/* Canvas + text layer container */}
      <div
        ref={containerRef}
        className={isDragOver ? 'drag-over' : ''}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: 16,
          background: '#e8e8e0',
        }}
      >
        {/* Relative wrapper — canvas + textLayer must share exact same coordinate space */}
        <div
          ref={pageRef}
          style={{
            position: 'relative',
            display: 'inline-block',
            overflow: 'hidden',
            boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
            borderRadius: 2,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%', background: 'white' }}
          />
          <div ref={textLayerRef} className="textLayer" onMouseUp={handleMouseUp} />
        </div>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          className="ghost small"
          disabled={currentPage <= 1}
          onClick={() => dispatch({ type: 'SET_PAGE', payload: currentPage - 1 })}
        >
          Anterior
        </button>
        <span>
          Pagina {currentPage} de {pageCount}
        </span>
        <button
          className="ghost small"
          disabled={currentPage >= pageCount}
          onClick={() => dispatch({ type: 'SET_PAGE', payload: currentPage + 1 })}
        >
          Siguiente
        </button>
      </div>

      {/* Code assignment menu */}
      {selection && (
        <CodeAssignMenu
          x={selection.x}
          y={selection.y}
          codes={state.codes}
          onAssign={handleAssignCode}
          onDismiss={dismissSelection}
          selectedText={selection.text}
        />
      )}
    </div>
  );
}
