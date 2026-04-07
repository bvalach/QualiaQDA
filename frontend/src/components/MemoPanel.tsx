import { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';

const MEMO_TYPES = [
  { value: 'free', label: 'Libre' },
  { value: 'theoretical', label: 'Teorico' },
  { value: 'methodological', label: 'Metodologico' },
  { value: 'case', label: 'De caso' },
  { value: 'code', label: 'De codigo' },
  { value: 'reflective', label: 'Reflexivo' },
  { value: 'synthesis', label: 'Sintesis' },
];

const MEMO_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  MEMO_TYPES.map((t) => [t.value, t.label])
);

export function MemoPanel() {
  const { state, refreshMemos } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [memoType, setMemoType] = useState('free');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [search, setSearch] = useState('');

  // Filter memos by search (title + content)
  const filteredMemos = search
    ? state.memos.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(search.toLowerCase()) ||
          m.content.toLowerCase().includes(search.toLowerCase())
      )
    : state.memos;

  const handleCreate = async () => {
    if (!content.trim()) return;
    await api.createMemo({
      title: title.trim() || undefined,
      content: content.trim(),
      memo_type: memoType,
    });
    setTitle('');
    setContent('');
    setMemoType('free');
    setShowCreate(false);
    await refreshMemos();
  };

  const handleUpdate = async (id: string) => {
    await api.updateMemo(id, { title: editTitle, content: editContent });
    setEditingId(null);
    await refreshMemos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este memo?')) return;
    await api.deleteMemo(id);
    await refreshMemos();
  };

  return (
    <div>
      <button
        className="ghost small"
        onClick={() => setShowCreate(!showCreate)}
        style={{ marginBottom: 6 }}
      >
        {showCreate ? 'Cancelar' : '+ Nuevo memo'}
      </button>

      {/* Search memos */}
      {!showCreate && state.memos.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en memos..."
          style={{ width: '100%', marginBottom: 6, fontSize: 12, padding: '4px 8px' }}
        />
      )}

      {showCreate && (
        <div
          style={{
            padding: '6px 0',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: 6,
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titulo (opcional)"
            style={{ width: '100%', marginBottom: 4 }}
          />
          <select
            value={memoType}
            onChange={(e) => setMemoType(e.target.value)}
            style={{ width: '100%', marginBottom: 4, fontSize: 12 }}
          >
            {MEMO_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Contenido del memo..."
            style={{ width: '100%', minHeight: 60 }}
          />
          <button className="primary small" onClick={handleCreate} style={{ marginTop: 4 }}>
            Guardar
          </button>
        </div>
      )}

      {filteredMemos.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>
          {search ? 'Sin resultados.' : 'Sin memos.'}
        </div>
      ) : (
        filteredMemos.map((memo) => (
          <div key={memo.id} className="memo-card">
            {editingId === memo.id ? (
              <div>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Titulo"
                  style={{ width: '100%', marginBottom: 4, fontSize: 12 }}
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={{ width: '100%', minHeight: 60, fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button className="primary small" onClick={() => handleUpdate(memo.id)}>
                    Guardar
                  </button>
                  <button className="ghost small" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => {
                  setEditingId(memo.id);
                  setEditTitle(memo.title || '');
                  setEditContent(memo.content);
                }}
              >
                {memo.title && <div className="memo-title">{memo.title}</div>}
                <div className="memo-preview">{memo.content}</div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {memo.memo_type !== 'free' && (
                      <span
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '1px 4px',
                          borderRadius: 3,
                          marginRight: 4,
                        }}
                      >
                        {MEMO_TYPE_LABELS[memo.memo_type] || memo.memo_type}
                      </span>
                    )}
                    {(memo.links?.length ?? 0) > 0 && (
                      <span style={{ marginRight: 4 }}>
                        {memo.links.length} enlace{memo.links.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {new Date(memo.updated_at).toLocaleString()}
                  </span>
                  <button
                    className="ghost small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(memo.id);
                    }}
                    style={{ fontSize: 10, opacity: 0.5 }}
                  >
                    x
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
