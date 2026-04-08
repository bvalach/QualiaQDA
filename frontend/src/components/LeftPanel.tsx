import { useState, useRef } from 'react';
import { useProject } from '../contexts/ProjectContext';
import type { CodeNode } from '../types';
import { CodeBook } from './CodeBook';
import { MemoPanel } from './MemoPanel';
import { DocumentList } from './DocumentList';
import { SearchPanel } from './SearchPanel';
import { RelationshipsPanel } from './RelationshipsPanel';
import { TagsPanel } from './TagsPanel';
import { CaseAttributesPanel } from './CaseAttributesPanel';
import { SnapshotsPanel } from './SnapshotsPanel';
import { ReportBuilderPanel } from './ReportBuilderPanel';
import * as api from '../api';
import { exportUrl } from '../api';

export function LeftPanel() {
  const { state, refreshDocuments } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState({
    docs: true, codes: true, memos: false,
    search: false, relationships: false, tags: false,
    caseAttrs: false, snapshots: false, report: false,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await api.uploadDocument(file);
    }
    await refreshDocuments();
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <div className="panel-header">
        <span>{state.project?.name || 'QualiaQDA'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="ghost small"
            title="Exportar"
            onClick={() => {
              const menu = document.getElementById('export-menu');
              if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            }}
          >
            CSV
          </button>
        </div>
      </div>

      <div
        id="export-menu"
        style={{
          display: 'none',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <a
          href={exportUrl('codebook')}
          download
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            padding: '4px 0',
            textDecoration: 'none',
          }}
        >
          Codebook CSV
        </a>
        <a
          href={exportUrl('codings')}
          download
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            padding: '4px 0',
            textDecoration: 'none',
          }}
        >
          Codificaciones CSV
        </a>
        <a
          href={exportUrl('memos')}
          download
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--text-secondary)',
            padding: '4px 0',
            textDecoration: 'none',
          }}
        >
          Memos CSV
        </a>
      </div>

      <div className="panel-content" style={{ padding: 0 }}>
        {/* Documents section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('docs')}>
            <span>
              {sections.docs ? '\u25BC' : '\u25B6'} Documentos ({state.documents.length})
            </span>
            <button
              className="ghost small"
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
            >
              +
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          {sections.docs && (
            <div className="left-section-content">
              <DocumentList />
            </div>
          )}
        </div>

        {/* Codes section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('codes')}>
            <span>
              {sections.codes ? '\u25BC' : '\u25B6'} Codebook ({countCodes(state.codes)})
            </span>
          </div>
          {sections.codes && (
            <div className="left-section-content">
              <CodeBook />
            </div>
          )}
        </div>

        {/* Memos section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('memos')}>
            <span>
              {sections.memos ? '\u25BC' : '\u25B6'} Memos ({state.memos.length})
            </span>
          </div>
          {sections.memos && (
            <div className="left-section-content">
              <MemoPanel />
            </div>
          )}
        </div>

        {/* Search section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('search')}>
            <span>{sections.search ? '\u25BC' : '\u25B6'} Búsqueda KWIC</span>
          </div>
          {sections.search && (
            <div className="left-section-content">
              <SearchPanel />
            </div>
          )}
        </div>

        {/* Relationships section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('relationships')}>
            <span>{sections.relationships ? '\u25BC' : '\u25B6'} Relaciones entre códigos</span>
          </div>
          {sections.relationships && (
            <div className="left-section-content">
              <RelationshipsPanel />
            </div>
          )}
        </div>

        {/* Tags section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('tags')}>
            <span>{sections.tags ? '\u25BC' : '\u25B6'} Tags analíticos</span>
          </div>
          {sections.tags && (
            <div className="left-section-content">
              <TagsPanel />
            </div>
          )}
        </div>

        {/* Case Attributes section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('caseAttrs')}>
            <span>{sections.caseAttrs ? '\u25BC' : '\u25B6'} Atributos de caso</span>
          </div>
          {sections.caseAttrs && (
            <div className="left-section-content">
              <CaseAttributesPanel />
            </div>
          )}
        </div>

        {/* Snapshots section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('snapshots')}>
            <span>{sections.snapshots ? '\u25BC' : '\u25B6'} Snapshots del proyecto</span>
          </div>
          {sections.snapshots && (
            <div className="left-section-content">
              <SnapshotsPanel />
            </div>
          )}
        </div>

        {/* Report builder section */}
        <div className="left-section">
          <div className="left-section-header" onClick={() => toggleSection('report')}>
            <span>{sections.report ? '\u25BC' : '\u25B6'} Informe</span>
          </div>
          {sections.report && (
            <div className="left-section-content">
              <ReportBuilderPanel />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function countCodes(codes: { children: CodeNode[] }[]): number {
  let count = 0;
  for (const c of codes) {
    count += 1 + countCodes(c.children || []);
  }
  return count;
}
