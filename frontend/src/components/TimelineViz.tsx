import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface TimelineEvent {
  id: string;
  event_type: string;
  name: string;
  color: string;
  created_at: string;
  document_name?: string;
}

interface Props {
  events: TimelineEvent[];
  width: number;
  height: number;
}

export function TimelineViz({ events, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 30, right: 30, bottom: 40, left: 30 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const dates = events.map((e) => new Date(e.created_at));
    const xExtent = d3.extent(dates) as [Date, Date];

    // Add padding to extent
    const pad = Math.max(3600000, (xExtent[1].getTime() - xExtent[0].getTime()) * 0.05);
    const xScale = d3.scaleTime()
      .domain([new Date(xExtent[0].getTime() - pad), new Date(xExtent[1].getTime() + pad)])
      .range([0, w]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Axis
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(8, events.length)))
      .selectAll('text')
      .attr('font-size', 10);

    // Horizontal line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', w)
      .attr('y1', h / 2)
      .attr('y2', h / 2)
      .attr('stroke', '#d2d2d7')
      .attr('stroke-width', 1);

    // Events
    const codingY = h / 2 - 20;
    const memoY = h / 2 + 20;

    // Avoid overlapping: stack events at same position
    let lastCodingX = -Infinity;
    let codingStack = 0;
    let lastMemoX = -Infinity;
    let memoStack = 0;

    for (const event of events) {
      const x = xScale(new Date(event.created_at));
      const isCoding = event.event_type === 'coding';
      const baseY = isCoding ? codingY : memoY;

      let stackOffset = 0;
      if (isCoding) {
        if (Math.abs(x - lastCodingX) < 12) {
          codingStack++;
          stackOffset = -codingStack * 14;
        } else {
          codingStack = 0;
        }
        lastCodingX = x;
      } else {
        if (Math.abs(x - lastMemoX) < 12) {
          memoStack++;
          stackOffset = memoStack * 14;
        } else {
          memoStack = 0;
        }
        lastMemoX = x;
      }

      const y = baseY + stackOffset;

      // Dot
      g.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 5)
        .attr('fill', event.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .append('title')
        .text(
          `${isCoding ? 'Codigo' : 'Memo'}: ${event.name}` +
          (event.document_name ? `\nDoc: ${event.document_name}` : '') +
          `\n${new Date(event.created_at).toLocaleString()}`
        );

      // Connector line to axis
      g.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', h / 2)
        .attr('y2', y)
        .attr('stroke', event.color)
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.4);

      // Label
      g.append('text')
        .attr('x', x + 8)
        .attr('y', y + 3)
        .attr('font-size', 9)
        .attr('fill', '#6e6e73')
        .text(event.name.length > 12 ? event.name.slice(0, 11) + '...' : event.name);
    }

    // Legend
    const legend = g.append('g').attr('transform', `translate(0, -10)`);
    legend.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4).attr('fill', '#34c759');
    legend.append('text').attr('x', 8).attr('y', 4).attr('font-size', 10).attr('fill', '#6e6e73').text('Codificaciones');
    legend.append('circle').attr('cx', 110).attr('cy', 0).attr('r', 4).attr('fill', '#007aff');
    legend.append('text').attr('x', 118).attr('y', 4).attr('font-size', 10).attr('fill', '#6e6e73').text('Memos');
  }, [events, width, height]);

  if (events.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div>Sin actividad. Codifica texto y crea memos para ver la linea temporal.</div>
      </div>
    );
  }

  return <svg ref={svgRef} width={width} height={height} style={{ background: '#fafafa' }} />;
}
