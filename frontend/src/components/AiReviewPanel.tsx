import { useState, useEffect } from 'react';
import type { AiSuggestionOut, AiSuggestionsStats } from '../types';
import * as api from '../api';
import { useProject } from '../contexts/ProjectContext';

type FilterStatus = 'pending' | 'accepted' | 'rejected' | 'all';

export function AiReviewPanel() {
  const { refreshCodings, refreshCodes } = useProject();
  const [suggestions, setSuggestions] = useState<AiSuggestionOut[]>([]);
  const [stats, setStats] = useState<AiSuggestionsStats | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listAiSuggestions(filter === 'all' ? undefined : filter),
      api.aiSuggestionsStats(),
    ])
      .then(([suggs, st]) => {
        if (!cancelled) {
          setSuggestions(suggs);
          setStats(st);
        }
      })
      .catch(() => {
        // silently handle — panel may load before any suggestions exist
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [suggs, st] = await Promise.all([
        api.listAiSuggestions(filter === 'all' ? undefined : filter),
        api.aiSuggestionsStats(),
      ]);
      setSuggestions(suggs);
      setStats(st);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id: string) => {
    setActionInProgress(id);
    try {
      await api.acceptSuggestion(id);
      await fetchData();
      await refreshCodings();
      await refreshCodes();
    } catch (err) {
      console.error('Error accepting suggestion:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionInProgress(id);
    try {
      await api.rejectSuggestion(id);
      await fetchData();
    } catch (err) {
      console.error('Error rejecting suggestion:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAcceptAll = async () => {
    const pending = suggestions.filter((s) => s.status === 'pending');
    for (const s of pending) {
      try {
        await api.acceptSuggestion(s.id);
      } catch {
        // continue with rest
      }
    }
    await fetchData();
    await refreshCodings();
    await refreshCodes();
  };

  const handleRejectAll = async () => {
    const pending = suggestions.filter((s) => s.status === 'pending');
    for (const s of pending) {
      try {
        await api.rejectSuggestion(s.id);
      } catch {
        // continue with rest
      }
    }
    await fetchData();
  };

  const confidenceColor = (confidence: number | null): string => {
    if (confidence === null) return 'var(--text-muted)';
    if (confidence >= 0.8) return 'var(--success)';
    if (confidence >= 0.5) return 'var(--warning)';
    return 'var(--danger)';
  };

  const pendingCount = stats?.pending ?? 0;

  return (
    <div className="ai-review-panel">
      <div className="ai-review-header">
        <span className="ai-review-title">
          Sugerencias IA
          {pendingCount > 0 && (
            <span className="ai-badge">{pendingCount}</span>
          )}
        </span>
        <div className="ai-review-filters">
          {(['pending', 'accepted', 'rejected', 'all'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              className={`ghost small ${filter === f ? 'active-filter' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' ? 'Pendientes' :
               f === 'accepted' ? 'Aceptadas' :
               f === 'rejected' ? 'Rechazadas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {filter === 'pending' && pendingCount > 0 && (
        <div className="ai-bulk-actions">
          <button className="ghost small" onClick={handleAcceptAll}>
            Aceptar todas ({pendingCount})
          </button>
          <button className="ghost small" onClick={handleRejectAll}>
            Rechazar todas
          </button>
        </div>
      )}

      {loading && suggestions.length === 0 && (
        <div className="ai-empty">Cargando sugerencias...</div>
      )}

      {!loading && suggestions.length === 0 && (
        <div className="ai-empty">
          {filter === 'pending'
            ? 'No hay sugerencias pendientes'
            : 'No hay sugerencias'}
        </div>
      )}

      <div className="ai-suggestions-list">
        {suggestions.map((s) => (
          <div key={s.id} className={`ai-suggestion-card ${s.status}`}>
            {/* Header: code name + confidence */}
            <div className="ai-suggestion-header">
              <span className="ai-suggestion-code">
                {s.code_name || s.suggested_code_name || '(sin codigo)'}
                {s.suggested_code_name && !s.code_id && (
                  <span className="ai-new-badge">NUEVO</span>
                )}
              </span>
              {s.confidence !== null && (
                <span
                  className="ai-confidence"
                  style={{ color: confidenceColor(s.confidence) }}
                >
                  {Math.round(s.confidence * 100)}%
                </span>
              )}
            </div>

            {/* Excerpt text */}
            <div className="ai-suggestion-excerpt">
              &ldquo;{s.excerpt_text.slice(0, 200)}
              {s.excerpt_text.length > 200 ? '...' : ''}&rdquo;
            </div>

            {/* Document name */}
            {s.document_name && (
              <div className="ai-suggestion-doc">{s.document_name}</div>
            )}

            <div className="ai-suggestion-doc" style={{ fontSize: 11 }}>
              Modelo: {s.model_name}
            </div>

            {/* Rationale */}
            {s.rationale && (
              <div className="ai-suggestion-rationale">{s.rationale}</div>
            )}

            {/* Actions — only for pending */}
            {s.status === 'pending' && (
              <div className="ai-suggestion-actions">
                <button
                  className="primary small"
                  onClick={() => handleAccept(s.id)}
                  disabled={actionInProgress === s.id}
                >
                  {actionInProgress === s.id ? '...' : 'Aceptar'}
                </button>
                <button
                  className="ghost small"
                  onClick={() => handleReject(s.id)}
                  disabled={actionInProgress === s.id}
                >
                  Rechazar
                </button>
              </div>
            )}

            {/* Status badge for non-pending */}
            {s.status !== 'pending' && (
              <div className={`ai-status-badge ${s.status}`}>
                {s.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
