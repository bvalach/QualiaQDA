import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { DocumentViewer } from './DocumentViewer';
import { Toolbar } from './Toolbar';
import { CodedFragments } from './CodedFragments';
import { AnalysisPanel } from './AnalysisPanel';
import { AiReviewPanel } from './AiReviewPanel';
import * as api from '../api';

export function RightPanel() {
  const { state } = useProject();
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisHeight, setAnalysisHeight] = useState(350);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);

  // Fetch pending suggestions count periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await api.aiSuggestionsStats();
        setPendingSuggestions(stats.pending);
      } catch {
        // ignore — no project open or no suggestions yet
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!state.activeDocument) {
    if (state.selectedCodeId) {
      return <CodedFragments />;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-icon">Q</div>
          <div>Selecciona un documento para empezar a codificar</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Importa documentos desde el panel izquierdo
          </div>
        </div>
        {/* Analysis toggle even without doc */}
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            className="ghost small"
            onClick={() => setShowAnalysis(!showAnalysis)}
            style={{ width: '100%', textAlign: 'center', fontSize: 11, padding: '4px 0' }}
          >
            {showAnalysis ? 'Ocultar analisis' : 'Mostrar analisis'}
          </button>
          {showAnalysis && (
            <div style={{ height: analysisHeight }}>
              <AnalysisPanel />
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = analysisHeight;
    const onMove = (ev: MouseEvent) => {
      setAnalysisHeight(Math.max(150, Math.min(600, startH - (ev.clientY - startY))));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        onToggleAiPanel={() => setShowAiPanel(!showAiPanel)}
        aiPanelOpen={showAiPanel}
        pendingSuggestions={pendingSuggestions}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <DocumentViewer />
        </div>

        {/* AI Review side panel */}
        {showAiPanel && (
          <div
            style={{
              width: 340,
              borderLeft: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <AiReviewPanel />
          </div>
        )}

        {/* Coded fragments side panel */}
        {!showAiPanel && state.selectedCodeId && (
          <div
            style={{
              width: 300,
              borderLeft: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <CodedFragments />
          </div>
        )}
      </div>

      {/* Bottom analysis panel */}
      <div style={{ borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
        <button
          className="ghost small"
          onClick={() => setShowAnalysis(!showAnalysis)}
          style={{ width: '100%', textAlign: 'center', fontSize: 11, padding: '4px 0' }}
        >
          {showAnalysis ? 'Ocultar analisis' : 'Mostrar analisis'}
        </button>
        {showAnalysis && (
          <>
            <div
              style={{
                height: 4,
                cursor: 'row-resize',
                background: 'transparent',
              }}
              onMouseDown={handleResizeStart}
            />
            <div style={{ height: analysisHeight }}>
              <AnalysisPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
