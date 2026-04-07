import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface Props {
  documents: { id: string; name: string }[];
  codes: { id: string; name: string; color: string }[];
  matrix: number[][];
  width: number;
  height: number;
}

export function DocCodeMatrixViz({ documents, codes, matrix, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || documents.length === 0 || codes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const nRows = documents.length;
    const nCols = codes.length;
    const margin = { top: 100, right: 20, bottom: 20, left: 140 };
    const cellW = Math.min((width - margin.left - margin.right) / nCols, 36);
    const cellH = Math.min((height - margin.top - margin.bottom) / nRows, 28);

    const maxVal = Math.max(1, ...matrix.flat());
    const colorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, maxVal]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Cells
    for (let i = 0; i < nRows; i++) {
      for (let j = 0; j < nCols; j++) {
        const val = matrix[i][j];
        g.append('rect')
          .attr('x', j * cellW)
          .attr('y', i * cellH)
          .attr('width', cellW - 1)
          .attr('height', cellH - 1)
          .attr('rx', 2)
          .attr('fill', val > 0 ? colorScale(val) : '#f5f5f7')
          .append('title')
          .text(`${documents[i].name} × ${codes[j].name}: ${val}`);

        if (val > 0) {
          g.append('text')
            .attr('x', j * cellW + cellW / 2)
            .attr('y', i * cellH + cellH / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', Math.min(10, cellH * 0.45))
            .attr('fill', val > maxVal * 0.6 ? '#fff' : '#1d1d1f')
            .text(val);
        }
      }
    }

    // Row labels (document names)
    for (let i = 0; i < nRows; i++) {
      g.append('text')
        .attr('x', -6)
        .attr('y', i * cellH + cellH / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 11)
        .attr('fill', '#1d1d1f')
        .text(documents[i].name.length > 18 ? documents[i].name.slice(0, 17) + '...' : documents[i].name);
    }

    // Column labels (code names, rotated)
    for (let j = 0; j < nCols; j++) {
      g.append('circle')
        .attr('cx', j * cellW + cellW / 2)
        .attr('cy', -8)
        .attr('r', 4)
        .attr('fill', codes[j].color);

      g.append('text')
        .attr('transform', `translate(${j * cellW + cellW / 2 - 3},-14) rotate(-45)`)
        .attr('text-anchor', 'start')
        .attr('font-size', 10)
        .attr('fill', '#1d1d1f')
        .text(codes[j].name.length > 15 ? codes[j].name.slice(0, 14) + '...' : codes[j].name);
    }
  }, [documents, codes, matrix, width, height]);

  if (documents.length === 0 || codes.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div>Importa documentos y codifica texto para ver la matriz.</div>
      </div>
    );
  }

  return <svg ref={svgRef} width={width} height={height} style={{ background: '#fafafa' }} />;
}
