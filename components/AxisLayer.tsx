import React, { useMemo } from 'react';
import { AxisConfig } from '../types';

interface AxisLayerProps {
  config: AxisConfig;
  width: number;
  height: number;
}

export const AxisLayer: React.FC<AxisLayerProps> = ({ config, width, height }) => {
  if (!config.visible) return null;

  const { ticks, color, showGrid } = config;
  const centerX = width / 2;
  const centerY = height / 2;

  // We want 'ticks' number of divisions on the positive side. 
  // e.g. if ticks = 5, we show 1, 2, 3, 4, 5.
  // The scale unit depends on the smaller dimension to fit.
  const maxDimension = Math.max(width, height) / 2;
  const step = (maxDimension * 0.9) / (ticks || 5); 

  const tickMarks = useMemo(() => {
    const marks = [];
    // Only go as far as the screen allows
    const maxStepsX = Math.floor(width / 2 / step);
    const maxStepsY = Math.floor(height / 2 / step);
    
    // X Axis Ticks
    for (let i = 1; i <= maxStepsX; i++) {
      const xPos = centerX + i * step;
      const xNeg = centerX - i * step;
      marks.push({ x1: xPos, y1: centerY - 5, x2: xPos, y2: centerY + 5, label: i, tx: xPos, ty: centerY + 20 });
      marks.push({ x1: xNeg, y1: centerY - 5, x2: xNeg, y2: centerY + 5, label: -i, tx: xNeg, ty: centerY + 20 });
    }

    // Y Axis Ticks
    for (let i = 1; i <= maxStepsY; i++) {
      const yPos = centerY - i * step; // SVG y is down, so minus is up in math
      const yNeg = centerY + i * step;
      marks.push({ x1: centerX - 5, y1: yPos, x2: centerX + 5, y2: yPos, label: i, tx: centerX - 20, ty: yPos + 4 });
      marks.push({ x1: centerX - 5, y1: yNeg, x2: centerX + 5, y2: yNeg, label: -i, tx: centerX - 25, ty: yNeg + 4 });
    }
    return marks;
  }, [width, height, centerX, centerY, step, ticks]);

  // Grid Lines
  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines = [];
    const maxStepsX = Math.ceil(width / 2 / step);
    const maxStepsY = Math.ceil(height / 2 / step);

    for (let i = -maxStepsX; i <= maxStepsX; i++) {
      if (i === 0) continue;
      const x = centerX + i * step;
      lines.push(<line key={`gx${i}`} x1={x} y1={0} x2={x} y2={height} stroke="#e5e7eb" strokeWidth={1} />);
    }
    for (let i = -maxStepsY; i <= maxStepsY; i++) {
      if (i === 0) continue;
      const y = centerY + i * step;
      lines.push(<line key={`gy${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#e5e7eb" strokeWidth={1} />);
    }
    return lines;
  }, [width, height, centerX, centerY, step, showGrid]);

  return (
    <g className="axis-layer pointer-events-none select-none">
      {/* Grid */}
      {gridLines}

      {/* Main Axes */}
      <line x1={0} y1={centerY} x2={width} y2={centerY} stroke={color} strokeWidth={2} markerEnd="url(#arrow)" />
      <line x1={centerX} y1={height} x2={centerX} y2={0} stroke={color} strokeWidth={2} markerEnd="url(#arrow)" />

      {/* Ticks & Labels */}
      {tickMarks.map((m, idx) => (
        <React.Fragment key={idx}>
          <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={color} strokeWidth={2} />
          <text 
            x={m.tx} 
            y={m.ty} 
            fill={color} 
            fontSize="12" 
            textAnchor="middle" 
            fontFamily="monospace"
          >
            {m.label}
          </text>
        </React.Fragment>
      ))}

      {/* Origin Label */}
      <text x={centerX - 15} y={centerY + 20} fill={color} fontSize="12" fontFamily="monospace">0</text>
      
      {/* Arrow Definitions */}
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill={color} />
        </marker>
      </defs>
    </g>
  );
};