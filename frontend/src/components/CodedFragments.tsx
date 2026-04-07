import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import type { CodingOut, CodeNode } from '../types';
import * as api from '../api';

export function CodedFragments() {
  const { state, dispatch, openDocument, refreshCodings } = useProject();
  const { selectedCodeId, codes } = state;
  const [fragments, setFragments] = useState<CodingOut[]>([]);
  const [fetchedCodeId, setFetchedCodeId] = useState<string | null>(null);

  // Find the selected code info
  const selectedCode = selectedCodeId ? findCode(codes, selectedCodeId) : null;

  // Loading is derived: true while waiting for fragments to arrive for the selected code
  const loading = selectedCodeId !== null && fetchedCodeId !== selectedCodeId;

  // Fetch fragments when selected code changes
  useEffect(() => {
    if (!selectedCodeId) return;
    let cancelled = false;
    api
      .getCodingsForCode(selectedCodeId)
      .then((data) => {
        if (!cancelled) {
          setFragments(data);
          setFetchedCodeId(selectedCodeId);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedCodeId]);

  if (!selectedCodeId || !selectedCode) {
    return (
      <div className="coded-fragments-empty">
        Selecciona un codigo en el codebook para ver sus fragmentos
      </div>
    );
  }

  const handleNavigate = async (fragment: CodingOut) => {
    await openDocument(fragment.document_id);
    if (fragment.page_number) {
      dispatch({ type: 'SET_PAGE', payload: fragment.page_number });
    }
  };

  const handleDelete = async (codingId: string) => {
    await api.deleteCoding(codingId);
    setFragments((prev) => prev.filter((f) => f.id !== codingId));
    await refreshCodings();
  };

  return (
    <div className="coded-fragments">
      <div className="coded-fragments-header">
        <div className="code-color-dot" style={{ backgroundColor: selectedCode.color }} />
        <span className="coded-fragments-title">{selectedCode.name}</span>
        <span className="coded-fragments-count">{fragments.length}</span>
        <button
          className="ghost small"
          onClick={() => dispatch({ type: 'SET_SELECTED_CODE', payload: null })}
          title="Cerrar"
          style={{ marginLeft: 'auto', fontSize: 11 }}
        >
          x
        </button>
      </div>

      {loading ? (
        <div className="coded-fragments-empty">Cargando...</div>
      ) : fragments.length === 0 ? (
        <div className="coded-fragments-empty">Sin fragmentos codificados</div>
      ) : (
        <div className="coded-fragments-list">
          {fragments.map((f) => (
            <div key={f.id} className="fragment-card" onClick={() => handleNavigate(f)}>
              <div className="fragment-source">
                {f.document_name || 'Documento'}
                {f.page_number ? ` — p.${f.page_number}` : ''}
              </div>
              <div className="fragment-text">{f.text || '(sin texto)'}</div>
              <button
                className="ghost small fragment-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(f.id);
                }}
                title="Eliminar codificacion"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function findCode(
  codes: CodeNode[],
  id: string
): { name: string; color: string } | null {
  for (const c of codes) {
    if (c.id === id) return { name: c.name, color: c.color };
    if (c.children?.length) {
      const found = findCode(c.children, id);
      if (found) return found;
    }
  }
  return null;
}
