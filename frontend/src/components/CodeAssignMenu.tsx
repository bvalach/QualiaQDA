import { useState, useEffect, useRef } from 'react';
import type { CodeNode } from '../types';

interface Props {
  x: number;
  y: number;
  codes: CodeNode[];
  onAssign: (codeId: string) => void;
  onInVivo?: () => void;
  onDismiss: () => void;
  selectedText: string;
}

export function CodeAssignMenu({
  x,
  y,
  codes,
  onAssign,
  onInVivo,
  onDismiss,
  selectedText,
}: Props) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escHandler);
    };
  }, [onDismiss]);

  const flatCodes = flattenCodes(codes);
  const filtered = search
    ? flatCodes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : flatCodes;

  const menuStyle: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 300),
  };

  const inVivoLabel = selectedText.slice(0, 40).trim() + (selectedText.length > 40 ? '...' : '');

  return (
    <div ref={ref} className="context-menu" style={menuStyle}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          "{selectedText.slice(0, 40)}
          {selectedText.length > 40 ? '...' : ''}"
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar codigo..."
          style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {filtered.length === 0 && !search ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
            Sin codigos. Crea uno con el boton de abajo.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
            Sin resultados
          </div>
        ) : (
          filtered.map((code) => (
            <div key={code.id} className="context-menu-item" onClick={() => onAssign(code.id)}>
              <div className="code-color-dot" style={{ backgroundColor: code.color }} />
              <span style={{ fontSize: 12 }}>
                {code.depth > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>{'  '.repeat(code.depth)}</span>
                )}
                {code.name}
              </span>
            </div>
          ))
        )}
      </div>
      {/* In-vivo coding: create new code from selected text */}
      {onInVivo && (
        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            padding: '4px',
          }}
        >
          <div
            className="context-menu-item"
            onClick={onInVivo}
            style={{ color: 'var(--accent)', fontWeight: 500 }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 12 }}>
              Crear codigo: "{inVivoLabel}"
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface FlatCode {
  id: string;
  name: string;
  color: string;
  depth: number;
}

function flattenCodes(codes: CodeNode[], depth: number = 0): FlatCode[] {
  const result: FlatCode[] = [];
  for (const c of codes) {
    result.push({ id: c.id, name: c.name, color: c.color, depth });
    if (c.children?.length) {
      result.push(...flattenCodes(c.children, depth + 1));
    }
  }
  return result;
}
