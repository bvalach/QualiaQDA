import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface CodeInfo {
  id: string;
  name: string;
  color: string;
}

interface CellSelection {
  codeA: CodeInfo;
  codeB: CodeInfo;
  value: number;
}

interface Props {
  codes: CodeInfo[];
  matrix: number[][];
  width: number;
  height: number;
  onCellClick?: (codeAId: string, codeBId: string) => void;
}

export function CoOccurrenceViz({ codes, matrix, width, height, onCellClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<CellSelection | null>(null);

  useEffect(() => {
    if (!svgRef.current || codes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const n = codes.length;
    const margin = { top: 100, right: 20, bottom: 20, left: 120 };
    const cellSize = Math.min(
      (width - margin.left - margin.right) / n,
      (height - margin.top - margin.bottom) / n,
      36
    );

    const maxVal = Math.max(1, ...matrix.flat().filter((_, i) => {
      const row = Math.floor(i / n);
      const col = i % n;
      return row !== col;
    }));

    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxVal]);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        if (val === 0 && i !== j) continue;

        const cell = g.append('rect')
          .attr('x', j * cellSize)
          .attr('y', i * cellSize)
          .attr('width', cellSize - 1)
          .attr('height', cellSize - 1)
          .attr('rx', 2)
          .attr('fill', i === j ? codes[i].color : colorScale(val))
          .attr('opacity', i === j ? 0.3 : 0.85)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 2)
          .style('cursor', 'pointer');

        cell.on('mouseover', function () {
          d3.select(this).attr('stroke', '#1d1d1f').attr('opacity', 1);
        });
        cell.on('mouseout', function () {
          d3.select(this)
            .attr('stroke', 'transparent')
            .attr('opacity', i === j ? 0.3 : 0.85);
        });

        // Click handler
        const codeA = codes[i];
        const codeB = codes[j];
        cell.on('click', () => {
          setSelected({ codeA, codeB, value: val });
          if (onCellClick) {
            onCellClick(codeA.id, codeB.id);
          }
        });

        cell.append('title')
          .text(
            i === j
              ? `${codes[i].name}: ${val} codificaciones`
              : `${codes[i].name} + ${codes[j].name}: ${val} co-ocurrencias`
          );

        if (val > 0) {
          const text = g.append('text')
            .attr('x', j * cellSize + cellSize / 2)
            .attr('y', i * cellSize + cellSize / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', Math.min(11, cellSize * 0.4))
            .attr('fill', i === j ? '#1d1d1f' : (val > maxVal * 0.6 ? '#fff' : '#1d1d1f'))
            .style('pointer-events', 'none')
            .text(val);
        }
      }
    }

    // Row labels (left)
    for (let i = 0; i < n; i++) {
      g.append('text')
        .attr('x', -6)
        .attr('y', i * cellSize + cellSize / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 11)
        .attr('fill', '#1d1d1f')
        .text(codes[i].name.length > 15 ? codes[i].name.slice(0, 14) + '...' : codes[i].name);

      g.append('circle')
        .attr('cx', -margin.left + 10)
        .attr('cy', i * cellSize + cellSize / 2)
        .attr('r', 4)
        .attr('fill', codes[i].color);
    }

    // Column labels (top, rotated)
    for (let j = 0; j < n; j++) {
      g.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('transform', `translate(${j * cellSize + cellSize / 2},-6) rotate(-45)`)
        .attr('text-anchor', 'start')
        .attr('font-size', 11)
        .attr('fill', '#1d1d1f')
        .text(codes[j].name.length > 15 ? codes[j].name.slice(0, 14) + '...' : codes[j].name);
    }
  }, [codes, matrix, width, height, onCellClick]);

  const handleExportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement('canvas');
    const scale = 2; // retina
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.download = 'co-ocurrencia.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  };

  const handleExportCSV = () => {
    if (codes.length === 0) return;

    const header = ['', ...codes.map((c) => c.name)];
    const rows = matrix.map((row, i) => [codes[i].name, ...row.map(String)]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = 'co-ocurrencia.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (codes.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div>Sin codificaciones para calcular co-ocurrencia.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Export buttons */}
      <div className="cooccurrence-toolbar">
        <button className="ghost small" onClick={handleExportPNG} title="Exportar como imagen PNG">
          PNG
        </button>
        <button className="ghost small" onClick={handleExportCSV} title="Exportar datos como CSV">
          CSV
        </button>
      </div>

      <svg ref={svgRef} width={width} height={height} style={{ background: '#fafafa' }} />

      {/* Selection info tooltip */}
      {selected && (
        <div className="cooccurrence-selection-info">
          <span
            className="cooccurrence-dot"
            style={{ backgroundColor: selected.codeA.color }}
          />
          <strong>{selected.codeA.name}</strong>
          {selected.codeA.id !== selected.codeB.id && (
            <>
              {' + '}
              <span
                className="cooccurrence-dot"
                style={{ backgroundColor: selected.codeB.color }}
              />
              <strong>{selected.codeB.name}</strong>
            </>
          )}
          <span className="cooccurrence-count">{selected.value}</span>
          <button
            className="ghost small"
            onClick={() => setSelected(null)}
            style={{ marginLeft: 4 }}
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}
