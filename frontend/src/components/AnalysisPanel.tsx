import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { CodeNetworkViz } from './CodeNetworkViz';
import { CoOccurrenceViz } from './CoOccurrenceViz';
import { DocCodeMatrixViz } from './DocCodeMatrixViz';
import { TimelineViz } from './TimelineViz';

const api = axios.create({ baseURL: '/api' });

type Tab = 'doc-code' | 'co-occurrence' | 'code-network' | 'evidence' | 'timeline';

const TABS: { key: Tab; label: string }[] = [
  { key: 'code-network', label: 'Red de codigos' },
  { key: 'co-occurrence', label: 'Co-ocurrencia' },
  { key: 'doc-code', label: 'Docs x Codigos' },
  { key: 'timeline', label: 'Linea temporal' },
  { key: 'evidence', label: 'Red de evidencias' },
];

interface CoOccurrenceDetailData {
  code_a: { id: string; name: string; color: string };
  code_b: { id: string; name: string; color: string };
  count: number;
  excerpts: {
    id: string;
    text: string;
    document_id: string;
    document_name: string;
    page_number?: number | null;
    start_pos: number;
    end_pos: number;
  }[];
}

function buildCoOccurrenceExportUrl(detail: CoOccurrenceDetailData) {
  return api.getUri({
    url: '/analysis/co-occurrence/export',
    params: {
      code_a_id: detail.code_a.id,
      code_b_id: detail.code_b.id,
      level: 'excerpt',
    },
  });
}

function formatExcerptSource(excerpt: CoOccurrenceDetailData['excerpts'][number]) {
  const parts = [excerpt.document_name];
  if (excerpt.page_number != null) {
    parts.push(`p. ${excerpt.page_number}`);
  }
  parts.push(`${excerpt.start_pos}-${excerpt.end_pos}`);
  return parts.join(' · ');
}

export function AnalysisPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('code-network');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 350 });
  const loading = loadedTab !== activeTab;

  // Co-occurrence detail panel
  const [coDetail, setCoDetail] = useState<CoOccurrenceDetailData | null>(null);
  const [coDetailLoading, setCoDetailLoading] = useState(false);
  const [coView, setCoView] = useState<'matrix' | 'fragments'>('matrix');

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDims({ width: Math.max(400, rect.width), height: Math.max(200, rect.height) });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    let cancelled = false;

    const endpoints: Record<Tab, string> = {
      'doc-code': '/analysis/doc-code-matrix',
      'co-occurrence': '/analysis/co-occurrence',
      'code-network': '/analysis/code-network',
      'evidence': '/analysis/evidence-network',
      'timeline': '/analysis/timeline',
    };

    api.get(endpoints[activeTab])
      .then((r) => {
        if (!cancelled) {
          setData((prev) => ({ ...prev, [activeTab]: r.data }));
          setLoadedTab(activeTab);
        }
      })
      .catch(console.error);

    // Clear detail when switching tabs
    setCoDetail(null);
    setCoView('matrix');

    return () => { cancelled = true; };
  }, [activeTab]);

  const handleCoOccurrenceClick = (codeAId: string, codeBId: string) => {
    setCoDetailLoading(true);
    setCoView('fragments');
    api.get('/analysis/co-occurrence/detail', {
      params: { code_a_id: codeAId, code_b_id: codeBId },
    })
      .then((r) => {
        setCoDetail(r.data);
      })
      .catch(console.error)
      .finally(() => setCoDetailLoading(false));
  };

  const handleExportCoOccurrenceDetail = () => {
    if (!coDetail) return;
    const link = document.createElement('a');
    link.href = buildCoOccurrenceExportUrl(coDetail);
    link.click();
  };

  const renderContent = () => {
    if (loading) {
      return <div className="empty-state" style={{ height: dims.height }}>Cargando...</div>;
    }

    const d = data[activeTab] as Record<string, unknown> | undefined;
    if (!d) return null;

    switch (activeTab) {
      case 'code-network': {
        const nd = d as { nodes: { id: string; name: string; color: string; size: number }[]; edges: { source: string; target: string; rel_type: string; label?: string }[] };
        return <CodeNetworkViz nodes={nd.nodes} edges={nd.edges} width={dims.width} height={dims.height} />;
      }
      case 'co-occurrence': {
        const cd = d as { codes: { id: string; name: string; color: string }[]; matrix: number[][] };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: dims.height }}>
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '8px 10px 6px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
              }}
            >
              <button
                className="ghost small"
                onClick={() => setCoView('matrix')}
                style={{
                  fontWeight: coView === 'matrix' ? 600 : 400,
                  opacity: coView === 'matrix' ? 1 : 0.7,
                }}
              >
                Matriz
              </button>
              <button
                className="ghost small"
                onClick={() => setCoView('fragments')}
                style={{
                  fontWeight: coView === 'fragments' ? 600 : 400,
                  opacity: coView === 'fragments' ? 1 : 0.7,
                }}
              >
                Fragmentos
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {coView === 'matrix' ? (
                <CoOccurrenceViz
                  codes={cd.codes}
                  matrix={cd.matrix}
                  width={dims.width}
                  height={dims.height - 46}
                  onCellClick={handleCoOccurrenceClick}
                />
              ) : (
                <div
                  className="cooccurrence-detail-panel"
                  style={{ width: '100%', height: '100%', borderLeft: 'none' }}
                >
                  {coDetailLoading && (
                    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                      Cargando fragmentos...
                    </div>
                  )}
                  {!coDetailLoading && !coDetail && (
                    <div className="empty-state" style={{ height: '100%', padding: 24 }}>
                      <div>Selecciona una celda desde la vista Matriz.</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Al hacer clic sobre una co-ocurrencia verás aquí los fragmentos compartidos.
                      </div>
                    </div>
                  )}
                  {coDetail && !coDetailLoading && (
                    <>
                      <div className="cooccurrence-detail-header">
                        <span>
                          <span className="cooccurrence-dot" style={{ backgroundColor: coDetail.code_a.color }} />
                          {coDetail.code_a.name}
                          {coDetail.code_a.id !== coDetail.code_b.id && (
                            <>
                              {' + '}
                              <span className="cooccurrence-dot" style={{ backgroundColor: coDetail.code_b.color }} />
                              {coDetail.code_b.name}
                            </>
                          )}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="ghost small" onClick={handleExportCoOccurrenceDetail}>
                            CSV
                          </button>
                          <button className="ghost small" onClick={() => setCoView('matrix')}>
                            Matriz
                          </button>
                          <button className="ghost small" onClick={() => setCoDetail(null)}>
                            x
                          </button>
                        </div>
                      </div>
                      <div className="cooccurrence-detail-count">
                        {coDetail.count} {coDetail.code_a.id === coDetail.code_b.id ? 'codificaciones' : 'co-ocurrencias'}
                      </div>
                      <div className="cooccurrence-detail-list">
                        {coDetail.excerpts.map((ex) => (
                          <div key={ex.id} className="cooccurrence-detail-excerpt">
                            <div className="cooccurrence-detail-doc">{formatExcerptSource(ex)}</div>
                            <div className="cooccurrence-detail-text">
                              &ldquo;{ex.text.length > 400 ? ex.text.slice(0, 400) + '...' : ex.text}&rdquo;
                            </div>
                          </div>
                        ))}
                        {coDetail.excerpts.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>
                            Sin fragmentos compartidos
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'doc-code': {
        const dd = d as { documents: { id: string; name: string }[]; codes: { id: string; name: string; color: string }[]; matrix: number[][] };
        return <DocCodeMatrixViz documents={dd.documents} codes={dd.codes} matrix={dd.matrix} width={dims.width} height={dims.height} />;
      }
      case 'evidence': {
        const ed = d as { nodes: { id: string; name: string; node_type: string; color: string; size: number }[]; edges: { source: string; target: string; weight: number }[] };
        const nodes = ed.nodes.map((n) => ({ ...n, size: n.size }));
        const edges = ed.edges.map((e) => ({ source: e.source, target: e.target, rel_type: `${e.weight} excerpts`, label: `${e.weight}` }));
        return <CodeNetworkViz nodes={nodes} edges={edges} width={dims.width} height={dims.height} />;
      }
      case 'timeline': {
        const td = d as unknown as { id: string; event_type: string; name: string; color: string; created_at: string; document_name?: string }[];
        return <TimelineViz events={td} width={dims.width} height={dims.height} />;
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Visualization area */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
        {renderContent()}
      </div>
    </div>
  );
}
