import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import type { LlmProviderOut } from '../types';
import * as api from '../api';

interface ToolbarProps {
  onToggleAiPanel?: () => void;
  aiPanelOpen?: boolean;
  pendingSuggestions?: number;
}

export function Toolbar({ onToggleAiPanel, aiPanelOpen, pendingSuggestions = 0 }: ToolbarProps) {
  const { state } = useProject();
  const doc = state.activeDocument;
  const [autoCoding, setAutoCoding] = useState(false);
  const [providers, setProviders] = useState<LlmProviderOut[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('auto');

  useEffect(() => {
    let cancelled = false;
    api.listAiProviders()
      .then((response) => {
        if (cancelled) return;
        setProviders(response.providers);
        const stored = window.localStorage.getItem('qualia.llmProvider');
        const providerIds = new Set(response.providers.map((provider) => provider.id));
        const initialProvider = stored && providerIds.has(stored)
          ? stored
          : response.default_provider;
        setSelectedProvider(initialProvider);
      })
      .catch(() => {
        if (!cancelled) {
          setProviders([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProviderInfo = useMemo(
    () => providers.find((provider) => provider.id === selectedProvider) ?? null,
    [providers, selectedProvider]
  );

  if (!doc) return null;

  const handleAutoCode = async () => {
    if (!doc || autoCoding) return;
    setAutoCoding(true);
    try {
      const suggestions = await api.autoCodeDocument(doc.id, selectedProvider);
      if (suggestions.length > 0) {
        // Open AI panel to show new suggestions
        if (onToggleAiPanel && !aiPanelOpen) {
          onToggleAiPanel();
        }
      }
    } catch (err) {
      console.error('Auto-code error:', err);
    } finally {
      setAutoCoding(false);
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    window.localStorage.setItem('qualia.llmProvider', providerId);
  };

  const providerDisabled = selectedProviderInfo ? !selectedProviderInfo.available : false;
  const providerHelp = selectedProviderInfo?.detail
    ? `${selectedProviderInfo.label}: ${selectedProviderInfo.detail}`
    : 'Selecciona el backend de IA';

  return (
    <div className="toolbar">
      <span style={{ fontWeight: 500, fontSize: 13 }}>{doc.name}</span>
      <div className="separator" />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.doc_type.toUpperCase()}</span>
      {doc.page_count && (
        <>
          <div className="separator" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.page_count} paginas</span>
        </>
      )}
      {doc.total_length && (
        <>
          <div className="separator" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {doc.total_length.toLocaleString()} caracteres
          </span>
        </>
      )}
      <div style={{ flex: 1 }} />

      {/* AI actions */}
      <select
        value={selectedProvider}
        onChange={(e) => handleProviderChange(e.target.value)}
        title={providerHelp}
        style={{
          height: 28,
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          padding: '0 8px',
          fontSize: 12,
          marginRight: 8,
        }}
      >
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.label}{provider.available ? '' : ' (no disponible)'}
          </option>
        ))}
      </select>
      <button
        className="ghost small ai-toolbar-btn"
        onClick={handleAutoCode}
        disabled={autoCoding || providerDisabled}
        title={providerDisabled ? providerHelp : 'Auto-codificar documento con IA'}
      >
        {autoCoding ? 'Analizando...' : 'Auto-codificar'}
      </button>

      {onToggleAiPanel && (
        <button
          className={`ghost small ai-toolbar-btn ${aiPanelOpen ? 'active-filter' : ''}`}
          onClick={onToggleAiPanel}
          title="Panel de revisión IA"
        >
          Revisión IA
          {pendingSuggestions > 0 && (
            <span className="ai-badge">{pendingSuggestions}</span>
          )}
        </button>
      )}

      <div className="separator" />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {state.codings.length} codificaciones
      </span>
    </div>
  );
}
