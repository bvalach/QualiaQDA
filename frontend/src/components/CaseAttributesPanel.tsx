import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import * as api from '../api';
import type { CaseAttributeOut } from '../types';

const ATTR_TYPES = ['text', 'number', 'date', 'boolean'];

export function CaseAttributesPanel() {
  const { state } = useProject();
  const [attrs, setAttrs] = useState<CaseAttributeOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ document_id: '', attr_name: '', attr_value: '', attr_type: 'text' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setAttrs(await api.listCaseAttributes());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.document_id || !form.attr_name.trim()) return;
    setSaving(true);
    try {
      const attr = await api.createCaseAttribute({
        document_id: form.document_id,
        attr_name: form.attr_name.trim(),
        attr_value: form.attr_value || undefined,
        attr_type: form.attr_type,
      });
      setAttrs((prev) => [...prev, attr]);
      setShowForm(false);
      setForm({ document_id: '', attr_name: '', attr_value: '', attr_type: 'text' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteCaseAttribute(id);
    setAttrs((prev) => prev.filter((a) => a.id !== id));
  };

  const handleEditSave = async (id: string) => {
    await api.updateCaseAttribute(id, { attr_value: editValue });
    setAttrs((prev) => prev.map((a) => a.id === id ? { ...a, attr_value: editValue } : a));
    setEditingId(null);
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '3px 6px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    width: '100%',
    outline: 'none',
  };

  // Group by document
  const grouped: Record<string, CaseAttributeOut[]> = {};
  for (const a of attrs) {
    const key = a.document_name;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="ghost small" onClick={() => setShowForm((v) => !v)} style={{ fontSize: 11 }}>
          {showForm ? 'Cancelar' : '+ Nuevo atributo'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={form.document_id}
            onChange={(e) => setForm((f) => ({ ...f, document_id: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Documento…</option>
            {state.documents.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Nombre del atributo (ej: edad, rol, sector)"
            value={form.attr_name}
            onChange={(e) => setForm((f) => ({ ...f, attr_name: e.target.value }))}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="Valor"
              value={form.attr_value}
              onChange={(e) => setForm((f) => ({ ...f, attr_value: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={form.attr_type}
              onChange={(e) => setForm((f) => ({ ...f, attr_type: e.target.value }))}
              style={{ ...inputStyle, width: 80, flex: 'none' }}
            >
              {ATTR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <button
            className="ghost small"
            onClick={handleCreate}
            disabled={saving || !form.document_id || !form.attr_name.trim()}
            style={{ fontSize: 11, alignSelf: 'flex-end' }}
          >
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargando…</div>}
      {!loading && attrs.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin atributos de caso</div>
      )}

      {Object.entries(grouped).map(([docName, docAttrs]) => (
        <div key={docName}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            padding: '2px 0 4px', borderBottom: '1px solid var(--border-color)', marginBottom: 4,
          }}>
            {docName}
          </div>
          {docAttrs.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '3px 0',
              borderBottom: '1px solid var(--bg-secondary)',
            }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 60 }}>{a.attr_name}</span>
              {editingId === a.id ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditSave(a.id)}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button className="ghost small" onClick={() => handleEditSave(a.id)} style={{ fontSize: 10, padding: '1px 5px' }}>✓</button>
                  <button className="ghost small" onClick={() => setEditingId(null)} style={{ fontSize: 10, padding: '1px 5px' }}>✗</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, color: a.attr_value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {a.attr_value || '—'}
                  </span>
                  <button
                    className="ghost small"
                    onClick={() => { setEditingId(a.id); setEditValue(a.attr_value || ''); }}
                    style={{ fontSize: 10, padding: '1px 5px' }}
                  >✎</button>
                  <button
                    className="ghost small"
                    onClick={() => handleDelete(a.id)}
                    style={{ fontSize: 10, padding: '1px 5px', color: 'var(--danger)' }}
                  >×</button>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
