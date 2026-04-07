import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';

const TYPE_ICONS: Record<string, string> = {
  text: 'TXT',
  markdown: 'MD',
  pdf: 'PDF',
  image: 'IMG',
  audio: 'AUD',
};

export function DocumentList() {
  const { state, openDocument, refreshDocuments } = useProject();

  const handleDelete = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!confirm('Eliminar este documento?')) return;
    await api.deleteDocument(docId);
    await refreshDocuments();
  };

  if (state.documents.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>
        Sin documentos. Pulsa + para importar.
      </div>
    );
  }

  return (
    <div>
      {state.documents.map((doc) => (
        <div
          key={doc.id}
          className={`doc-item ${state.activeDocumentId === doc.id ? 'active' : ''}`}
          onClick={() => openDocument(doc.id)}
        >
          <span className="doc-type">{TYPE_ICONS[doc.doc_type] || 'DOC'}</span>
          <span
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {doc.name}
          </span>
          <button
            className="ghost small"
            onClick={(e) => handleDelete(e, doc.id)}
            style={{ opacity: 0.5, fontSize: 10 }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
