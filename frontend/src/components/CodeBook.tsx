import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import type { CodeNode, CodeGroupOut } from '../types';
import * as api from '../api';

const COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F0B27A',
  '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2', '#A3E4D7', '#F9E79F',
  '#FADBD8', '#D5F5E3', '#E8DAEF', '#D6EAF8', '#FCF3CF', '#FDEDEC',
  '#EBF5FB', '#FEF9E7', '#F4ECF7', '#EAFAF1', '#FDF2E9', '#EBF5FB',
  '#FF5733', '#C70039', '#900C3F', '#581845', '#1B4F72', '#148F77',
  '#B7950B', '#A04000', '#6C3483', '#1A5276',
];

export function CodeBook() {
  const { state, dispatch, refreshCodes } = useProject();
  const selectedCodeId = state.selectedCodeId;
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#FFD700');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Code groups state
  const [groups, setGroups] = useState<CodeGroupOut[]>([]);
  const [showGroups, setShowGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (state.project) {
      api.listCodeGroups().then(setGroups).catch(console.error);
    }
  }, [state.project]);

  const refreshGroups = async () => {
    const g = await api.listCodeGroups();
    setGroups(g);
  };

  const setSelectedCodeId = (id: string | null) => {
    dispatch({ type: 'SET_SELECTED_CODE', payload: id });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await api.createCode({
      name: newName.trim(),
      color: newColor,
      parent_id: parentId || undefined,
    });
    setNewName('');
    setShowCreate(false);
    setParentId(null);
    await refreshCodes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este codigo y sus subcodigos?')) return;
    await api.deleteCode(id);
    await refreshCodes();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await api.updateCode(id, { name: editName.trim() });
    setEditingId(null);
    await refreshCodes();
  };

  const handleAddChild = (pid: string) => {
    setParentId(pid);
    setShowCreate(true);
  };

  // Drag-drop to reorganize hierarchy
  const handleDragOver = (e: React.DragEvent, targetCodeId: string) => {
    const draggedCodeId = e.dataTransfer.types.includes('application/qualia-code-id')
      ? 'pending'
      : null;
    if (!draggedCodeId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(targetCodeId);
  };

  const handleDragLeaveTree = () => {
    setDropTargetId(null);
  };

  const handleDropOnCode = async (e: React.DragEvent, targetCodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    const draggedCodeId = e.dataTransfer.getData('application/qualia-code-id');
    if (!draggedCodeId || draggedCodeId === targetCodeId) return;
    // Don't drop a parent onto its own child (would create cycle)
    if (isDescendant(state.codes, draggedCodeId, targetCodeId)) return;
    await api.updateCode(draggedCodeId, { parent_id: targetCodeId });
    await refreshCodes();
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
    const draggedCodeId = e.dataTransfer.getData('application/qualia-code-id');
    if (!draggedCodeId) return;
    await api.updateCode(draggedCodeId, { parent_id: '' });
    await refreshCodes();
  };

  // Code groups
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await api.createCodeGroup({ name: newGroupName.trim() });
    setNewGroupName('');
    await refreshGroups();
  };

  const handleDropOnGroup = async (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    const codeId = e.dataTransfer.getData('application/qualia-code-id');
    if (!codeId) return;
    await api.addCodeToGroup(groupId, codeId);
    await refreshGroups();
  };

  const handleRemoveFromGroup = async (groupId: string, codeId: string) => {
    await api.removeCodeFromGroup(groupId, codeId);
    await refreshGroups();
  };

  const findCodeName = (codeId: string): string => {
    const found = findCodeInTree(state.codes, codeId);
    return found?.name || codeId.slice(0, 8);
  };

  const findCodeColor = (codeId: string): string => {
    const found = findCodeInTree(state.codes, codeId);
    return found?.color || '#999';
  };

  const renderCode = (code: CodeNode, depth: number = 0) => (
    <div key={code.id}>
      <div
        className={`code-tree-item ${selectedCodeId === code.id ? 'selected' : ''} ${dropTargetId === code.id ? 'drop-target' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => setSelectedCodeId(selectedCodeId === code.id ? null : code.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/qualia-code-id', code.id);
          e.dataTransfer.setData('text/plain', code.name);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragOver={(e) => handleDragOver(e, code.id)}
        onDragLeave={handleDragLeaveTree}
        onDrop={(e) => handleDropOnCode(e, code.id)}
      >
        <div className="code-color-dot" style={{ backgroundColor: code.color }} />
        {editingId === code.id ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename(code.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            onBlur={() => handleRename(code.id)}
            autoFocus
            style={{ flex: 1, padding: '1px 4px', fontSize: 12 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            style={{ flex: 1, fontSize: 13 }}
            onDoubleClick={() => {
              setEditingId(code.id);
              setEditName(code.name);
            }}
          >
            {code.name}
          </span>
        )}
        <button
          className="ghost small"
          onClick={(e) => { e.stopPropagation(); handleAddChild(code.id); }}
          title="Agregar subcodigo"
          style={{ opacity: 0.5, fontSize: 10 }}
        >
          +
        </button>
        <button
          className="ghost small"
          onClick={(e) => { e.stopPropagation(); handleDelete(code.id); }}
          style={{ opacity: 0.5, fontSize: 10 }}
        >
          x
        </button>
      </div>
      {code.children && code.children.length > 0 && (
        <div>{code.children.map((child) => renderCode(child, depth + 1))}</div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button
          className="ghost small"
          onClick={() => { setParentId(null); setShowCreate(!showCreate); }}
        >
          {showCreate ? 'Cancelar' : '+ Nuevo codigo'}
        </button>
        <button
          className="ghost small"
          onClick={() => setShowGroups(!showGroups)}
          style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}
        >
          {showGroups ? 'Ocultar grupos' : 'Grupos'}
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)', marginBottom: 6 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={parentId ? 'Nombre del subcodigo...' : 'Nombre del codigo...'}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
            style={{ width: '100%', marginBottom: 6 }}
          />
          <div className="color-grid">
            {COLORS.map((c) => (
              <div
                key={c}
                className={`color-swatch ${newColor === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <button className="primary small" onClick={handleCreate} style={{ marginTop: 6 }}>
            Crear
          </button>
        </div>
      )}

      {/* Code tree with drag-drop reorganize */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={handleDropOnRoot}
      >
        {state.codes.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>
            Sin codigos. Crea uno para empezar.
          </div>
        ) : (
          state.codes.map((code) => renderCode(code))
        )}
      </div>

      {/* Code groups section */}
      {showGroups && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Grupos
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nombre del grupo..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
              style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}
            />
            <button className="ghost small" onClick={handleCreateGroup}>+</button>
          </div>
          {groups.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px' }}>
              Sin grupos. Arrastra codigos aqui.
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className="code-group-card"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => handleDropOnGroup(e, group.id)}
              >
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
                  {group.name}
                </div>
                {group.code_ids.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Arrastra codigos aqui
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {group.code_ids.map((codeId) => (
                      <span
                        key={codeId}
                        className="code-group-member"
                        style={{ backgroundColor: hexToRgba(findCodeColor(codeId), 0.2), borderColor: findCodeColor(codeId) }}
                      >
                        <span className="code-color-dot" style={{ backgroundColor: findCodeColor(codeId), width: 6, height: 6 }} />
                        {findCodeName(codeId)}
                        <button
                          className="ghost small"
                          onClick={() => handleRemoveFromGroup(group.id, codeId)}
                          style={{ fontSize: 9, padding: '0 2px', opacity: 0.5 }}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function isDescendant(codes: CodeNode[], parentId: string, childId: string): boolean {
  for (const c of codes) {
    if (c.id === parentId) {
      return hasChild(c, childId);
    }
    if (c.children?.length) {
      const found = isDescendant(c.children, parentId, childId);
      if (found) return true;
    }
  }
  return false;
}

function hasChild(node: CodeNode, targetId: string): boolean {
  for (const child of node.children || []) {
    if (child.id === targetId) return true;
    if (hasChild(child, targetId)) return true;
  }
  return false;
}

function findCodeInTree(codes: CodeNode[], id: string): CodeNode | null {
  for (const c of codes) {
    if (c.id === id) return c;
    if (c.children?.length) {
      const found = findCodeInTree(c.children, id);
      if (found) return found;
    }
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
