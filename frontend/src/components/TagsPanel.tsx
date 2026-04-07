import { useState, useEffect } from 'react';
import * as api from '../api';
import type { TagOut } from '../types';

const TAG_TYPES = ['analytical', 'methodological', 'status', 'custom'];

const TAG_COLORS = [
  '#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de',
  '#5ac8fa', '#ffcc00', '#ff6b6b', '#4ecdc4', '#a8e6cf',
];

export function TagsPanel() {
  const [tags, setTags] = useState<TagOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', color: TAG_COLORS[0], tag_type: 'analytical' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTags(await api.listTags());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const tag = await api.createTag({ name: form.name.trim(), color: form.color, tag_type: form.tag_type });
      setTags((prev) => [...prev, tag]);
      setShowForm(false);
      setForm({ name: '', color: TAG_COLORS[0], tag_type: 'analytical' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteTag(id);
    setTags((prev) => prev.filter((t) => t.id !== id));
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

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="ghost small" onClick={() => setShowForm((v) => !v)} style={{ fontSize: 11 }}>
          {showForm ? 'Cancelar' : '+ Nuevo tag'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            placeholder="Nombre del tag"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />

          <select
            value={form.tag_type}
            onChange={(e) => setForm((f) => ({ ...f, tag_type: e.target.value }))}
            style={inputStyle}
          >
            {TAG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Color picker */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: c,
                  border: form.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            className="ghost small"
            onClick={handleCreate}
            disabled={saving || !form.name.trim()}
            style={{ fontSize: 11, alignSelf: 'flex-end' }}
          >
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargando…</div>}
      {!loading && tags.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin tags definidos</div>
      )}

      {tags.map((t) => (
        <div key={t.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          padding: '3px 0',
          borderBottom: '1px solid var(--bg-secondary)',
        }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: t.color || '#888',
            flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontWeight: 500 }}>{t.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{t.tag_type}</span>
          <button
            className="ghost small"
            onClick={() => handleDelete(t.id)}
            style={{ fontSize: 10, padding: '1px 5px', color: 'var(--danger)', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
