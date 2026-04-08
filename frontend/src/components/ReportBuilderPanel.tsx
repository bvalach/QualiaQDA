import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { MarkdownViewer } from './MarkdownViewer';
import * as api from '../api';
import type { CodeNode, ReportPreview, ReportRequest } from '../types';

function flattenCodes(nodes: CodeNode[]): CodeNode[] {
  const result: CodeNode[] = [];
  const walk = (items: CodeNode[]) => {
    items.forEach((item) => {
      result.push(item);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export function ReportBuilderPanel() {
  const { state } = useProject();
  const flatCodes = useMemo(() => flattenCodes(state.codes), [state.codes]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [includeMemos, setIncludeMemos] = useState(true);
  const [includeRelationships, setIncludeRelationships] = useState(true);
  const [includeCaseAttributes, setIncludeCaseAttributes] = useState(true);
  const [coOccurrenceLevel, setCoOccurrenceLevel] = useState<'excerpt' | 'document'>('excerpt');
  const [maxCoOccurrences, setMaxCoOccurrences] = useState(20);
  const [maxRelationshipEvidence, setMaxRelationshipEvidence] = useState(3);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingMarkdown, setDownloadingMarkdown] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  useEffect(() => {
    setSelectedDocumentIds((current) => {
      const validIds = new Set(state.documents.map((document) => document.id));
      const next = current.filter((id) => validIds.has(id));
      return next.length > 0 || state.documents.length === 0 ? next : state.documents.map((document) => document.id);
    });
  }, [state.documents]);

  useEffect(() => {
    setSelectedCodeIds((current) => {
      const validIds = new Set(flatCodes.map((code) => code.id));
      const next = current.filter((id) => validIds.has(id));
      return next.length > 0 || flatCodes.length === 0 ? next : flatCodes.map((code) => code.id);
    });
  }, [flatCodes]);

  const requestData: ReportRequest = useMemo(
    () => ({
      document_ids: selectedDocumentIds,
      code_ids: selectedCodeIds,
      include_memos: includeMemos,
      include_relationships: includeRelationships,
      include_case_attributes: includeCaseAttributes,
      co_occurrence_level: coOccurrenceLevel,
      max_co_occurrences: maxCoOccurrences,
      max_relationship_evidence: maxRelationshipEvidence,
    }),
    [
      selectedDocumentIds,
      selectedCodeIds,
      includeMemos,
      includeRelationships,
      includeCaseAttributes,
      coOccurrenceLevel,
      maxCoOccurrences,
      maxRelationshipEvidence,
    ]
  );

  const canGenerate = selectedDocumentIds.length > 0 && selectedCodeIds.length > 0;

  const toggleSelection = (
    id: string,
    setSelectedIds: Dispatch<SetStateAction<string[]>>
  ) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const handlePreview = async () => {
    if (!canGenerate || loadingPreview) return;
    setLoadingPreview(true);
    try {
      const result = await api.previewReport(requestData);
      setPreview(result);
    } catch (error) {
      console.error('Report preview error:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadMarkdown = async () => {
    if (!canGenerate || downloadingMarkdown) return;
    setDownloadingMarkdown(true);
    try {
      const blob = await api.downloadReportMarkdown(requestData);
      triggerDownload(blob, 'informe-qualia.md');
    } catch (error) {
      console.error('Markdown report download error:', error);
    } finally {
      setDownloadingMarkdown(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!canGenerate || downloadingCsv) return;
    setDownloadingCsv(true);
    try {
      const blob = await api.downloadReportCsvBundle(requestData);
      triggerDownload(blob, 'informe-qualia-csv.zip');
    } catch (error) {
      console.error('CSV bundle download error:', error);
    } finally {
      setDownloadingCsv(false);
    }
  };

  return (
    <div className="report-builder">
      <div className="report-builder-grid">
        <div className="report-builder-column">
          <div className="report-builder-header">
            <span>Documentos</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="ghost small"
                type="button"
                onClick={() => setSelectedDocumentIds(state.documents.map((document) => document.id))}
              >
                Todos
              </button>
              <button className="ghost small" type="button" onClick={() => setSelectedDocumentIds([])}>
                Ninguno
              </button>
            </div>
          </div>
          <div className="report-builder-list">
            {state.documents.map((document) => (
              <label key={document.id} className="report-builder-option">
                <input
                  type="checkbox"
                  checked={selectedDocumentIds.includes(document.id)}
                  onChange={() => toggleSelection(document.id, setSelectedDocumentIds)}
                />
                <span>{document.name}</span>
              </label>
            ))}
            {state.documents.length === 0 && <div className="report-builder-empty">Sin documentos</div>}
          </div>
        </div>

        <div className="report-builder-column">
          <div className="report-builder-header">
            <span>Códigos</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="ghost small"
                type="button"
                onClick={() => setSelectedCodeIds(flatCodes.map((code) => code.id))}
              >
                Todos
              </button>
              <button className="ghost small" type="button" onClick={() => setSelectedCodeIds([])}>
                Ninguno
              </button>
            </div>
          </div>
          <div className="report-builder-list">
            {flatCodes.map((code) => (
              <label key={code.id} className="report-builder-option">
                <input
                  type="checkbox"
                  checked={selectedCodeIds.includes(code.id)}
                  onChange={() => toggleSelection(code.id, setSelectedCodeIds)}
                />
                <span>{code.name}</span>
              </label>
            ))}
            {flatCodes.length === 0 && <div className="report-builder-empty">Sin códigos</div>}
          </div>
        </div>
      </div>

      <div className="report-builder-settings">
        <label className="report-builder-toggle">
          <input type="checkbox" checked={includeMemos} onChange={(e) => setIncludeMemos(e.target.checked)} />
          <span>Incluir memos vinculados</span>
        </label>
        <label className="report-builder-toggle">
          <input
            type="checkbox"
            checked={includeRelationships}
            onChange={(e) => setIncludeRelationships(e.target.checked)}
          />
          <span>Incluir relaciones entre códigos y fragmentos ilustrativos</span>
        </label>
        <label className="report-builder-toggle">
          <input
            type="checkbox"
            checked={includeCaseAttributes}
            onChange={(e) => setIncludeCaseAttributes(e.target.checked)}
          />
          <span>Incluir atributos de caso</span>
        </label>
      </div>

      <div className="report-builder-controls">
        <label className="report-builder-field">
          <span>Co-ocurrencia</span>
          <select value={coOccurrenceLevel} onChange={(e) => setCoOccurrenceLevel(e.target.value as 'excerpt' | 'document')}>
            <option value="excerpt">Mismo fragmento</option>
            <option value="document">Mismo documento</option>
          </select>
        </label>
        <label className="report-builder-field">
          <span>Top co-ocurrencias</span>
          <input
            type="number"
            min={5}
            max={100}
            value={maxCoOccurrences}
            onChange={(e) => setMaxCoOccurrences(Number(e.target.value) || 20)}
          />
        </label>
        <label className="report-builder-field">
          <span>Fragmentos por relación</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxRelationshipEvidence}
            onChange={(e) => setMaxRelationshipEvidence(Number(e.target.value) || 3)}
          />
        </label>
      </div>

      <div className="report-builder-actions">
        <button className="ghost small" type="button" disabled={!canGenerate || loadingPreview} onClick={handlePreview}>
          {loadingPreview ? 'Generando...' : 'Vista previa'}
        </button>
        <button
          className="ghost small"
          type="button"
          disabled={!canGenerate || downloadingMarkdown}
          onClick={handleDownloadMarkdown}
        >
          {downloadingMarkdown ? 'Preparando...' : 'Markdown'}
        </button>
        <button className="ghost small" type="button" disabled={!canGenerate || downloadingCsv} onClick={handleDownloadCsv}>
          {downloadingCsv ? 'Preparando...' : 'CSV ZIP'}
        </button>
      </div>

      {!canGenerate && (
        <div className="report-builder-empty" style={{ marginTop: 8 }}>
          Selecciona al menos un documento y un código.
        </div>
      )}

      {preview && (
        <div className="report-builder-preview">
          <div className="report-builder-preview-header">
            <div>
              <div style={{ fontWeight: 600 }}>{preview.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {preview.summary.documents} docs · {preview.summary.codes} códigos · {preview.summary.codings} codificaciones
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{preview.generated_at.slice(0, 16).replace('T', ' ')}</div>
          </div>
          <div className="report-builder-preview-files">
            {preview.csv_files.map((filename) => (
              <span key={filename} className="report-builder-chip">
                {filename}
              </span>
            ))}
          </div>
          <div className="report-builder-markdown">
            <MarkdownViewer content={preview.markdown} />
          </div>
        </div>
      )}
    </div>
  );
}
