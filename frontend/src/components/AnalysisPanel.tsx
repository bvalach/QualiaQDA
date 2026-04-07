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
  excerpts: { id: string; text: string; document_name: string }[];
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

    return () => { cancelled = true; };
  }, [activeTab]);

  const handleCoOccurrenceClick = (codeAId: string, codeBId: string) => {
    setCoDetailLoading(true);
    api.get('/analysis/co-occurrence/detail', {
      params: { code_a_id: codeAId, code_b_id: codeBId },
    })
      .then((r) => {
        setCoDetail(r.data);
      })
      .catch(console.error)
      .finally(() => setCoDetailLoading(false));
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
        // Leave room for detail panel
        const vizWidth = coDetail ? Math.max(300, dims.width - 320) : dims.width;
        return (
          <div style={{ display: 'flex', height: dims.height }}>
            <div style={{ flex: coDetail ? undefined : 1, width: coDetail ? vizWidth : undefined, overflow: 'auto' }}>
              <CoOccurrenceViz
                codes={cd.codes}
                matrix={cd.matrix}
                width={vizWidth}
                height={dims.height}
                onCellClick={handleCoOccurrenceClick}
              />
            </div>
            {/* Detail side panel */}
            {(coDetail || coDetailLoading) && (
              <div className="cooccurrence-detail-panel">
                {coDetailLoading && (
                  <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                    Cargando excerpts...
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
                      <button className="ghost small" onClick={() => setCoDetail(null)}>x</button>
                    </div>
                    <div className="cooccurrence-detail-count">
                      {coDetail.count} {coDetail.code_a.id === coDetail.code_b.id ? 'codificaciones' : 'co-ocurrencias'}
                    </div>
                    <div className="cooccurrence-detail-list">
                      {coDetail.excerpts.map((ex) => (
                        <div key={ex.id} className="cooccurrence-detail-excerpt">
                          <div className="cooccurrence-detail-doc">{ex.document_name}</div>
                          <div className="cooccurrence-detail-text">
                            &ldquo;{ex.text.length > 200 ? ex.text.slice(0, 200) + '...' : ex.text}&rdquo;
                          </div>
                        </div>
                      ))}
                      {coDetail.excerpts.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>
                          Sin excerpts compartidos
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
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
