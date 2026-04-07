import { useState, useEffect } from 'react';
import * as api from '../api';
import type { SnapshotOut } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function SnapshotsPanel() {
  const [snaps, setSnaps] = useState<SnapshotOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSnaps(await api.listSnapshots());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const snap = await api.createSnapshot({ label: label.trim(), description: desc.trim() || undefined });
      setSnaps((prev) => [snap, ...prev]);
      setLabel('');
      setDesc('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteSnapshot(id);
    setSnaps((prev) => prev.filter((s) => s.id !== id));
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
      {/* Create form (always visible, compact) */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          placeholder="Etiqueta (ej: v1, pre-análisis-IA)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          className="ghost small"
          onClick={handleCreate}
          disabled={saving || !label.trim()}
          style={{ fontSize: 11, flexShrink: 0 }}
        >
          {saving ? '…' : 'Guardar'}
        </button>
      </div>

      {/* List */}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargando…</div>}
      {!loading && snaps.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin snapshots guardados</div>
      )}

      {snaps.map((s) => (
        <div key={s.id} style={{
          background: 'var(--bg-secondary)',
          borderRadius: 6,
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{s.label}</span>
            <button
              className="ghost small"
              onClick={() => handleDelete(s.id)}
              style={{ fontSize: 10, padding: '1px 5px', color: 'var(--danger)', flexShrink: 0 }}
            >×</button>
          </div>
          {s.description && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.description}</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
            <span>{formatDate(s.created_at)}</span>
            <span>{s.n_codes} códigos · {s.n_codings} codif · {s.n_memos} memos</span>
          </div>
        </div>
      ))}
    </div>
  );
}
