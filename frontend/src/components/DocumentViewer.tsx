import { useState, useRef } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { CodeAssignMenu } from './CodeAssignMenu';
import { PdfViewer } from './PdfViewer';
import { AudioPlayer } from './AudioPlayer';
import type { CodingOut } from '../types';
import * as api from '../api';

interface TextSelection {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
}

export function DocumentViewer() {
  const { state, dispatch, refreshCodings, refreshCodes } = useProject();
  const { activeDocument: doc, codings, currentPage } = state;

  const [selection, setSelection] = useState<TextSelection | null>(null);
  const selectionRef = useRef<TextSelection | null>(null);
  const [hoveredCoding, setHoveredCoding] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const content = doc?.content || '';
  const pages =
    doc?.doc_type === 'pdf' && content.includes('--- PAGE_BREAK ---')
      ? content.split('\n\n--- PAGE_BREAK ---\n\n')
      : null;
  const pageCount = pages ? pages.length : 1;
  const displayContent = pages ? pages[currentPage - 1] || '' : content;
  const pageOffset = pages
    ? pages
        .slice(0, currentPage - 1)
        .reduce((acc, p) => acc + p.length + '\n\n--- PAGE_BREAK ---\n\n'.length, 0)
    : 0;

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !viewerRef.current) return;

    const range = sel.getRangeAt(0);
    const container = viewerRef.current;

    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;

    const selectedText = sel.toString();
    if (!selectedText.trim()) return;

    const rect = range.getBoundingClientRect();
    const selData: TextSelection = {
      start: pageOffset + startOffset,
      end: pageOffset + startOffset + selectedText.length,
      text: selectedText,
      x: rect.right + 8,
      y: rect.top,
    };
    setSelection(selData);
    selectionRef.current = selData;
  };

  const handleAssignCode = async (codeId: string) => {
    if (!selection || !doc) return;
    await api.createCoding({
      document_id: doc.id,
      code_id: codeId,
      start_pos: selection.start,
      end_pos: selection.end,
      text: selection.text,
      page_number: pages ? currentPage : undefined,
    });
    setSelection(null);
    selectionRef.current = null;
    window.getSelection()?.removeAllRanges();
    await refreshCodings();
  };

  const handleInVivoCoding = async () => {
    if (!selection || !doc) return;
    const code = await api.createCode({
      name: selection.text.slice(0, 50).trim(),
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
    });
    await api.createCoding({
      document_id: doc.id,
      code_id: code.id,
      start_pos: selection.start,
      end_pos: selection.end,
      text: selection.text,
      page_number: pages ? currentPage : undefined,
    });
    setSelection(null);
    selectionRef.current = null;
    window.getSelection()?.removeAllRanges();
    await refreshCodes();
    await refreshCodings();
  };

  const handleDeleteCoding = async (codingId: string) => {
    await api.deleteCoding(codingId);
    await refreshCodings();
  };

  const dismissMenu = () => {
    setSelection(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const codeId = e.dataTransfer.getData('application/qualia-code-id');
    const sel = selectionRef.current;
    if (codeId && sel && doc) {
      await api.createCoding({
        document_id: doc.id,
        code_id: codeId,
        start_pos: sel.start,
        end_pos: sel.end,
        text: sel.text,
        page_number: pages ? currentPage : undefined,
      });
      selectionRef.current = null;
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      await refreshCodings();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.coded-segment') === null &&
      !window.getSelection()?.toString()
    ) {
      selectionRef.current = null;
      setSelection(null);
    }
  };

  // PDF: render with pdf.js
  if (doc && doc.doc_type === 'pdf' && doc.page_count) {
    return <PdfViewer documentId={doc.id} pageCount={doc.page_count} />;
  }

  // Audio viewer (with or without transcript)
  if (doc && doc.doc_type === 'audio') {
    const hasTranscript = !!doc.content;
    if (!hasTranscript) {
      // No transcript yet — show player + transcribe button
      return (
        <AudioPlayer
          documentId={doc.id}
          documentName={doc.name}
          hasTranscript={false}
        />
      );
    }
    // Has transcript — show player on top, then codeable text below
    // (falls through to the normal text rendering below)
  }

  // Image viewer
  if (!doc || !doc.content) {
    if (doc && doc.doc_type === 'image') {
      return (
        <div
          className="document-viewer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img
            src={`/api/documents/${doc.id}/image`}
            alt={doc.name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      );
    }
    return (
      <div className="empty-state">
        <div>Sin contenido de texto disponible</div>
      </div>
    );
  }

  // Filter codings for current page
  const pageCodings = codings.filter((c) => {
    const cStart = c.start_pos - pageOffset;
    const cEnd = c.end_pos - pageOffset;
    return cEnd > 0 && cStart < displayContent.length;
  });

  const highlightedContent = buildHighlightedContent(
    displayContent,
    pageCodings,
    pageOffset,
    hoveredCoding,
    setHoveredCoding,
    handleDeleteCoding
  );

  // Collect unique code labels for margin display
  const seenCodes = new Set<string>();
  const marginLabels: { codingId: string; codeName: string; codeColor: string }[] = [];
  for (const c of pageCodings) {
    if (!seenCodes.has(c.code_id)) {
      seenCodes.add(c.code_id);
      marginLabels.push({ codingId: c.id, codeName: c.code_name, codeColor: c.code_color });
    }
  }

  const isAudioWithTranscript = doc?.doc_type === 'audio' && !!doc.content;

  return (
    <>
      {/* Audio player bar for transcribed audio */}
      {isAudioWithTranscript && doc && (
        <AudioPlayer
          documentId={doc.id}
          documentName={doc.name}
          hasTranscript={true}
        />
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Text content area */}
        <div
          ref={viewerRef}
          className={`document-viewer ${isDragOver ? 'drag-over' : ''}`}
          onMouseUp={handleMouseUp}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          style={{ flex: 1 }}
        >
          {highlightedContent}
        </div>

        {/* Right margin: code labels */}
        {marginLabels.length > 0 && (
          <div className="code-margin">
            {marginLabels.map((ml) => (
              <div
                key={ml.codingId}
                className="code-margin-label"
                style={{ backgroundColor: ml.codeColor }}
                title={ml.codeName}
              >
                {ml.codeName}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination for PDFs */}
      {pageCount > 1 && (
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
      )}

      {/* Code assignment menu */}
      {selection && (
        <CodeAssignMenu
          x={selection.x}
          y={selection.y}
          codes={state.codes}
          onAssign={handleAssignCode}
          onInVivo={handleInVivoCoding}
          onDismiss={dismissMenu}
          selectedText={selection.text}
        />
      )}
    </>
  );
}

function buildHighlightedContent(
  text: string,
  codings: CodingOut[],
  pageOffset: number,
  hoveredCoding: string | null,
  setHoveredCoding: (id: string | null) => void,
  onDelete: (id: string) => void
): React.ReactNode[] {
  if (codings.length === 0) {
    return [<span key="all">{text}</span>];
  }

  type Event = { pos: number; type: 'start' | 'end'; coding: CodingOut };
  const events: Event[] = [];

  for (const c of codings) {
    const localStart = Math.max(0, c.start_pos - pageOffset);
    const localEnd = Math.min(text.length, c.end_pos - pageOffset);
    events.push({ pos: localStart, type: 'start', coding: c });
    events.push({ pos: localEnd, type: 'end', coding: c });
  }

  events.sort((a, b) => a.pos - b.pos || (a.type === 'end' ? -1 : 1));

  const result: React.ReactNode[] = [];
  let currentPos = 0;
  const activeCodes: CodingOut[] = [];

  for (const event of events) {
    if (event.pos > currentPos) {
      const segment = text.slice(currentPos, event.pos);
      if (activeCodes.length > 0) {
        const topCoding = activeCodes[activeCodes.length - 1];
        const bgColor = hexToRgba(topCoding.code_color, 0.25);
        const borderColor = hexToRgba(topCoding.code_color, 0.6);
        result.push(
          <span
            key={`seg-${currentPos}`}
            className="coded-segment"
            style={{
              backgroundColor: bgColor,
              borderBottom: `2px solid ${borderColor}`,
              opacity: hoveredCoding && hoveredCoding !== topCoding.id ? 0.6 : 1,
            }}
            onMouseEnter={() => setHoveredCoding(topCoding.id)}
            onMouseLeave={() => setHoveredCoding(null)}
            title={`${topCoding.code_name} — click derecho para eliminar`}
            onContextMenu={(e) => {
              e.preventDefault();
              onDelete(topCoding.id);
            }}
          >
            {segment}
          </span>
        );
      } else {
        result.push(<span key={`plain-${currentPos}`}>{segment}</span>);
      }
    }

    if (event.type === 'start') {
      activeCodes.push(event.coding);
    } else {
      const idx = activeCodes.findIndex((c) => c.id === event.coding.id);
      if (idx !== -1) activeCodes.splice(idx, 1);
    }
    currentPos = event.pos;
  }

  if (currentPos < text.length) {
    result.push(<span key={`tail-${currentPos}`}>{text.slice(currentPos)}</span>);
  }

  return result;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
