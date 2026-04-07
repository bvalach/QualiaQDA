import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';
import type { RelationshipOut, CodeNode } from '../types';

const REL_TYPES = [
  { value: 'causa_de', label: 'causa de' },
  { value: 'conduce_a', label: 'conduce a' },
  { value: 'contradice', label: 'contradice' },
  { value: 'co_ocurre_con', label: 'co-ocurre con' },
  { value: 'ejemplo_de', label: 'ejemplo de' },
  { value: 'condicion_para', label: 'condición para' },
  { value: 'parte_de', label: 'parte de' },
  { value: 'custom', label: 'relación libre' },
];

function flattenCodes(codes: CodeNode[]): CodeNode[] {
  const result: CodeNode[] = [];
  const visit = (nodes: CodeNode[]) => {
    for (const n of nodes) {
      result.push(n);
      if (n.children?.length) visit(n.children);
    }
  };
  visit(codes);
  return result;
}

export function RelationshipsPanel() {
  const { state } = useProject();
  const [rels, setRels] = useState<RelationshipOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ source_code_id: '', rel_type: 'causa_de', target_code_id: '', label: '' });
  const [saving, setSaving] = useState(false);

  const flatCodes = flattenCodes(state.codes);

  const load = async () => {
    setLoading(true);
    try {
      setRels(await api.listRelationships());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.source_code_id || !form.target_code_id) return;
    setSaving(true);
    try {
      const rel = await api.createRelationship({
        source_code_id: form.source_code_id,
        target_code_id: form.target_code_id,
        rel_type: form.rel_type,
        label: form.label || undefined,
      });
      setRels((prev) => [...prev, rel]);
      setShowForm(false);
      setForm({ source_code_id: '', rel_type: 'causa_de', target_code_id: '', label: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteRelationship(id);
    setRels((prev) => prev.filter((r) => r.id !== id));
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '3px 6px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    width: '100%',
  };

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="ghost small"
          onClick={() => setShowForm((v) => !v)}
          style={{ fontSize: 11 }}
        >
          {showForm ? 'Cancelar' : '+ Nueva relación'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <select style={selectStyle} value={form.source_code_id}
            onChange={(e) => setForm((f) => ({ ...f, source_code_id: e.target.value }))}>
            <option value="">Código origen…</option>
            {flatCodes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select style={selectStyle} value={form.rel_type}
            onChange={(e) => setForm((f) => ({ ...f, rel_type: e.target.value }))}>
            {REL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select style={selectStyle} value={form.target_code_id}
            onChange={(e) => setForm((f) => ({ ...f, target_code_id: e.target.value }))}>
            <option value="">Código destino…</option>
            {flatCodes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {form.rel_type === 'custom' && (
            <input
              type="text"
              placeholder="Etiqueta de la relación"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              style={{ ...selectStyle, outline: 'none' }}
            />
          )}

          <button
            className="ghost small"
            onClick={handleCreate}
            disabled={saving || !form.source_code_id || !form.target_code_id}
            style={{ fontSize: 11, alignSelf: 'flex-end' }}
          >
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      )}

      {/* Relations list */}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargando…</div>}
      {!loading && rels.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin relaciones definidas</div>
      )}
      {rels.map((r) => (
        <div key={r.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          padding: '4px 0',
          borderBottom: '1px solid var(--bg-secondary)',
        }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: r.source_code_color,
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 500 }}>{r.source_code_name}</span>
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>
            {r.rel_label_display}
          </span>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: r.target_code_color,
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 500, flex: 1 }}>{r.target_code_name}</span>
          <button
            className="ghost small"
            onClick={() => handleDelete(r.id)}
            style={{ fontSize: 10, padding: '1px 5px', color: 'var(--danger)', flexShrink: 0 }}
            title="Eliminar relación"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
