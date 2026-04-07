import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface NetworkNode {
  id: string;
  name: string;
  color: string;
  size: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  rel_type: string;
  label?: string;
}

interface Props {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  width: number;
  height: number;
}

const REL_LABELS: Record<string, string> = {
  causa_de: 'causa de',
  conduce_a: 'conduce a',
  contradice: 'contradice',
  co_ocurre_con: 'co-ocurre',
  ejemplo_de: 'ejemplo de',
  condicion_para: 'condicion para',
  parte_de: 'parte de',
};

export function CodeNetworkViz({ nodes, edges, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    type SimNode = d3.SimulationNodeDatum & NetworkNode;
    type SimLink = d3.SimulationLinkDatum<SimNode> & NetworkEdge;

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: SimLink[] = edges.map((e) => ({ ...e }));

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => (d as SimNode).size + 10));

    // Arrow markers
    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#999')
      .attr('d', 'M0,-5L10,0L0,5');

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#c5c5be')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Link labels
    const linkLabel = g.append('g')
      .selectAll('text')
      .data(simLinks)
      .join('text')
      .attr('font-size', 9)
      .attr('fill', '#a1a1a6')
      .attr('text-anchor', 'middle')
      .text((d) => REL_LABELS[d.rel_type] || d.label || d.rel_type);

    // Nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => Math.max(8, Math.min(25, d.size + 5)))
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'grab');

    // Drag
    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag);

    // Node labels
    const label = g.append('g')
      .selectAll('text')
      .data(simNodes)
      .join('text')
      .attr('font-size', 11)
      .attr('font-weight', 500)
      .attr('fill', '#1d1d1f')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => -(Math.max(8, Math.min(25, d.size + 5)) + 6))
      .text((d) => d.name);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!);

      linkLabel
        .attr('x', (d) => ((d.source as SimNode).x! + (d.target as SimNode).x!) / 2)
        .attr('y', (d) => ((d.source as SimNode).y! + (d.target as SimNode).y!) / 2 - 4);

      node
        .attr('cx', (d) => d.x!)
        .attr('cy', (d) => d.y!);

      label
        .attr('x', (d) => d.x!)
        .attr('y', (d) => d.y!);
    });

    return () => { simulation.stop(); };
  }, [nodes, edges, width, height]);

  if (nodes.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div>Sin codigos con relaciones. Define relaciones entre codigos para ver la red.</div>
      </div>
    );
  }

  return <svg ref={svgRef} width={width} height={height} style={{ background: '#fafafa' }} />;
}
