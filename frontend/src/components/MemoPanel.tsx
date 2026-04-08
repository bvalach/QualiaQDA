import { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';
import type { CodeNode, EntityLinkData, MemoOut } from '../types';

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

function flattenCodes(codes: CodeNode[]): CodeNode[] {
  const result: CodeNode[] = [];
  const visit = (nodes: CodeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(codes);
  return result;
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function splitMemoLinks(links: EntityLinkData[]) {
  return {
    documentIds: links.filter((link) => link.target_type === 'document').map((link) => link.target_id),
    codeIds: links.filter((link) => link.target_type === 'code').map((link) => link.target_id),
  };
}

function buildMemoLinks(documentIds: string[], codeIds: string[]): EntityLinkData[] {
  return [
    ...documentIds.map((target_id) => ({ target_type: 'document' as const, target_id })),
    ...codeIds.map((target_id) => ({ target_type: 'code' as const, target_id })),
  ];
}

async function syncMemoLinks(memoId: string, currentLinks: EntityLinkData[], nextLinks: EntityLinkData[]) {
  const isSupported = (link: EntityLinkData) => link.target_type === 'document' || link.target_type === 'code';
  const current = currentLinks.filter(isSupported);
  const next = nextLinks.filter(isSupported);

  const currentKeys = new Set(current.map((link) => `${link.target_type}:${link.target_id}`));
  const nextKeys = new Set(next.map((link) => `${link.target_type}:${link.target_id}`));

  const operations: Promise<unknown>[] = [];

  for (const link of next) {
    const key = `${link.target_type}:${link.target_id}`;
    if (!currentKeys.has(key)) {
      operations.push(api.addMemoLink(memoId, link));
    }
  }

  for (const link of current) {
    const key = `${link.target_type}:${link.target_id}`;
    if (!nextKeys.has(key)) {
      operations.push(api.removeMemoLink(memoId, link));
    }
  }

  if (operations.length > 0) {
    await Promise.all(operations);
  }
}

function linkLabel(
  link: EntityLinkData,
  documentsById: Record<string, string>,
  codesById: Record<string, { name: string; color: string }>
) {
  if (link.target_type === 'document') return documentsById[link.target_id] || 'Documento';
  if (link.target_type === 'code') return codesById[link.target_id]?.name || 'Codigo';
  return `${link.target_type}:${link.target_id}`;
}

interface LinkSelectorProps {
  title: string;
  items: { id: string; label: string; color?: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}

function LinkSelector({ title, items, selectedIds, onToggle, emptyText }: LinkSelectorProps) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emptyText}</div>
      ) : (
        <div
          style={{
            maxHeight: 112,
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            background: 'var(--bg-surface)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '2px 0',
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
                {item.color && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: item.color,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MemoPanel() {
  const { state, refreshMemos } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [memoType, setMemoType] = useState('free');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editMemoType, setEditMemoType] = useState('free');
  const [editDocumentIds, setEditDocumentIds] = useState<string[]>([]);
  const [editCodeIds, setEditCodeIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const flatCodes = flattenCodes(state.codes);
  const documentsById = Object.fromEntries(state.documents.map((doc) => [doc.id, doc.name]));
  const codesById = Object.fromEntries(flatCodes.map((code) => [code.id, { name: code.name, color: code.color }]));
  const documentOptions = state.documents.map((doc) => ({ id: doc.id, label: doc.name }));
  const codeOptions = flatCodes.map((code) => ({ id: code.id, label: code.name, color: code.color }));

  const filteredMemos = search
    ? state.memos.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(search.toLowerCase()) ||
          m.content.toLowerCase().includes(search.toLowerCase())
      )
    : state.memos;

  const resetCreateForm = () => {
    setTitle('');
    setContent('');
    setMemoType('free');
    setSelectedDocumentIds([]);
    setSelectedCodeIds([]);
  };

  const startEditing = (memo: MemoOut) => {
    const { documentIds, codeIds } = splitMemoLinks(memo.links || []);
    setEditingId(memo.id);
    setEditTitle(memo.title || '');
    setEditContent(memo.content);
    setEditMemoType(memo.memo_type);
    setEditDocumentIds(documentIds);
    setEditCodeIds(codeIds);
  };

  const handleCreate = async () => {
    if (!content.trim()) return;
    await api.createMemo({
      title: title.trim() || undefined,
      content: content.trim(),
      memo_type: memoType,
      links: buildMemoLinks(selectedDocumentIds, selectedCodeIds),
    });
    resetCreateForm();
    setShowCreate(false);
    await refreshMemos();
  };

  const handleUpdate = async (memo: MemoOut) => {
    const nextLinks = buildMemoLinks(editDocumentIds, editCodeIds);
    await api.updateMemo(memo.id, {
      title: editTitle.trim(),
      content: editContent,
      memo_type: editMemoType,
    });
    await syncMemoLinks(memo.id, memo.links || [], nextLinks);
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
        onClick={() => {
          setShowCreate(!showCreate);
          if (showCreate) resetCreateForm();
        }}
        style={{ marginBottom: 6 }}
      >
        {showCreate ? 'Cancelar' : '+ Nuevo memo'}
      </button>

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
            padding: '6px 0 10px',
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
            style={{ width: '100%', minHeight: 72 }}
          />
          <LinkSelector
            title="Vincular a documentos"
            items={documentOptions}
            selectedIds={selectedDocumentIds}
            onToggle={(id) => setSelectedDocumentIds((prev) => toggleId(prev, id))}
            emptyText="No hay documentos disponibles."
          />
          <LinkSelector
            title="Vincular a codigos"
            items={codeOptions}
            selectedIds={selectedCodeIds}
            onToggle={(id) => setSelectedCodeIds((prev) => toggleId(prev, id))}
            emptyText="No hay codigos disponibles."
          />
          <button className="primary small" onClick={handleCreate} style={{ marginTop: 8 }}>
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
                <select
                  value={editMemoType}
                  onChange={(e) => setEditMemoType(e.target.value)}
                  style={{ width: '100%', marginBottom: 4, fontSize: 12 }}
                >
                  {MEMO_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={{ width: '100%', minHeight: 72, fontSize: 12 }}
                />
                <LinkSelector
                  title="Documentos vinculados"
                  items={documentOptions}
                  selectedIds={editDocumentIds}
                  onToggle={(id) => setEditDocumentIds((prev) => toggleId(prev, id))}
                  emptyText="No hay documentos disponibles."
                />
                <LinkSelector
                  title="Codigos vinculados"
                  items={codeOptions}
                  selectedIds={editCodeIds}
                  onToggle={(id) => setEditCodeIds((prev) => toggleId(prev, id))}
                  emptyText="No hay codigos disponibles."
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  <button className="primary small" onClick={() => handleUpdate(memo)}>
                    Guardar
                  </button>
                  <button className="ghost small" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => startEditing(memo)}
              >
                {memo.title && <div className="memo-title">{memo.title}</div>}
                <div className="memo-preview">{memo.content}</div>
                {(memo.links?.length ?? 0) > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                      marginTop: 6,
                    }}
                  >
                    {memo.links.slice(0, 6).map((link) => (
                      <span
                        key={`${link.target_type}:${link.target_id}`}
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {link.target_type === 'document' ? 'Doc' : link.target_type === 'code' ? 'Codigo' : link.target_type}
                        {': '}
                        {linkLabel(link, documentsById, codesById)}
                      </span>
                    ))}
                    {memo.links.length > 6 && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        +{memo.links.length - 6} mas
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 6,
                    gap: 8,
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
