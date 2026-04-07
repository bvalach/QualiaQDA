import { useState } from 'react';
import * as api from '../api';
import type { KwicResult } from '../types';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KwicResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const resp = await api.searchText(query.trim(), 80, useRegex);
      setResults(resp.results);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Error al buscar');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Group results by document
  const grouped: Record<string, KwicResult[]> = {};
  if (results) {
    for (const r of results) {
      if (!grouped[r.document_name]) grouped[r.document_name] = [];
      grouped[r.document_name].push(r);
    }
  }

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Search input row */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en documentos…"
          style={{
            flex: 1,
            fontSize: 12,
            padding: '4px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            outline: 'none',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          className="ghost small"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >
          {loading ? '…' : '↵'}
        </button>
      </div>

      {/* Regex toggle */}
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={useRegex}
          onChange={(e) => setUseRegex(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        Regex
      </label>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', padding: '4px 0' }}>{error}</div>
      )}

      {/* Results summary */}
      {results !== null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {results.length === 0
            ? 'Sin resultados'
            : `${results.length} ocurrencia${results.length !== 1 ? 's' : ''} en ${Object.keys(grouped).length} documento${Object.keys(grouped).length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* KWIC Results */}
      {results && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
          {Object.entries(grouped).map(([docName, hits]) => (
            <div key={docName}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                padding: '2px 0 4px 0',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: 4,
              }}>
                {docName} ({hits.length})
              </div>
              {hits.map((r, i) => (
                <div key={i} style={{
                  fontSize: 11,
                  lineHeight: 1.5,
                  padding: '4px 0',
                  borderBottom: '1px solid var(--bg-secondary)',
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-word',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{r.context_before}</span>
                  <mark style={{
                    background: 'rgba(255, 149, 0, 0.3)',
                    color: 'var(--text-primary)',
                    borderRadius: 2,
                    padding: '0 1px',
                    fontWeight: 600,
                  }}>
                    {r.match_text}
                  </mark>
                  <span style={{ color: 'var(--text-muted)' }}>{r.context_after}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
