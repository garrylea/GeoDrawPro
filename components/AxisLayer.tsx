import React, { useMemo } from 'react';
import { AxisConfig } from '../types';

interface AxisLayerProps {
  config: AxisConfig;
  width: number;
  height: number;
  pixelsPerUnit: number; // Receive exact scale from parent
  overrideOrigin?: { x: number; y: number }; // Optional fixed origin
}

export const AxisLayer: React.FC<AxisLayerProps> = ({ config, width, height, pixelsPerUnit, overrideOrigin }) => {
  // Removed early return to allow independent grid rendering
  const { color, showGrid, visible } = config;
  
  // Use overridden origin if provided (e.g. for multi-page layouts), otherwise default to center
  const centerX = overrideOrigin?.x ?? (width / 2);
  const centerY = overrideOrigin?.y ?? (height / 2);

  // Use the exact unit size calculated by the Editor
  const step = pixelsPerUnit;

  const tickMarks = useMemo(() => {
    if (!visible) return []; // Optimization: don't calc ticks if not visible

    const marks = [];
    
    // We calculate how many steps fit from center to edges.
    // Use Math.max of width/height to cover worst case distance from origin.
    // In multi-page, centerY might be near top, but height is huge.
    const distToTop = centerY;
    const distToBottom = height - centerY;
    const distToLeft = centerX;
    const distToRight = width - centerX;

    const maxStepsX = Math.ceil(Math.max(distToLeft, distToRight) / step);
    const maxStepsY = Math.ceil(Math.max(distToTop, distToBottom) / step);
    
    // X Axis Ticks
    for (let i = 1; i <= maxStepsX; i++) {
      const xPos = centerX + i * step;
      const xNeg = centerX - i * step;
      // Only render if visible
      if (xPos <= width) marks.push({ x1: xPos, y1: centerY - 5, x2: xPos, y2: centerY + 5, label: i, tx: xPos, ty: centerY + 20 });
      if (xNeg >= 0) marks.push({ x1: xNeg, y1: centerY - 5, x2: xNeg, y2: centerY + 5, label: -i, tx: xNeg, ty: centerY + 20 });
    }

    // Y Axis Ticks
    for (let i = 1; i <= maxStepsY; i++) {
      const yPos = centerY - i * step; // SVG y is down, so minus is up in math
      const yNeg = centerY + i * step;
      if (yPos >= 0) marks.push({ x1: centerX - 5, y1: yPos, x2: centerX + 5, y2: yPos, label: i, tx: centerX - 20, ty: yPos + 4 });
      if (yNeg <= height) marks.push({ x1: centerX - 5, y1: yNeg, x2: centerX + 5, y2: yNeg, label: -i, tx: centerX - 25, ty: yNeg + 4 });
    }
    return marks;
  }, [width, height, centerX, centerY, step, visible]);

  // Grid Lines
  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines = [];
    
    // Extend grid to cover full canvas area relative to origin
    const distToTop = centerY;
    const distToBottom = height - centerY;
    const distToLeft = centerX;
    const distToRight = width - centerX;

    const maxStepsX = Math.ceil(Math.max(distToLeft, distToRight) / step);
    const maxStepsY = Math.ceil(Math.max(distToTop, distToBottom) / step);

    for (let i = -maxStepsX; i <= maxStepsX; i++) {
      if (i === 0 && visible) continue; // Don't draw grid line over axis if axis is visible
      const x = centerX + i * step;
      if (x >= 0 && x <= width) {
          lines.push(<line key={`gx${i}`} x1={x} y1={0} x2={x} y2={height} stroke="#e5e7eb" strokeWidth={1} />);
      }
    }
    for (let i = -maxStepsY; i <= maxStepsY; i++) {
      if (i === 0 && visible) continue; // Don't draw grid line over axis if axis is visible
      const y = centerY + i * step;
      if (y >= 0 && y <= height) {
          lines.push(<line key={`gy${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#e5e7eb" strokeWidth={1} />);
      }
    }
    return lines;
  }, [width, height, centerX, centerY, step, showGrid, visible]);

  return (
    <g className="axis-layer pointer-events-none select-none">
      {/* Grid */}
      {gridLines}

      {/* Main Axes - Only render if visible */}
      {visible && (
        <>
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
        </>
      )}
    </g>
  );
};