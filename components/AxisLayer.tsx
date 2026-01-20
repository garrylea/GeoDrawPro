import React, { useMemo } from 'react';
import { AxisConfig } from '../types';

interface AxisLayerProps {
  config: AxisConfig;
  width: number;
  height: number;
  pixelsPerUnit: number; // Receive exact scale from parent
  overrideOrigin?: { x: number; y: number }; // Optional fixed origin
  pageCount?: number; // New prop to handle multi-page rendering
  pageHeight?: number; // New prop to handle multi-page rendering
}

export const AxisLayer: React.FC<AxisLayerProps> = ({ config, width, height, pixelsPerUnit, overrideOrigin, pageCount = 1, pageHeight }) => {
  const { color, showGrid, visible } = config;
  
  // If pageHeight isn't provided, treat the whole height as one page
  const actualPageHeight = pageHeight || height;
  const centerX = overrideOrigin?.x ?? (width / 2);
  const step = pixelsPerUnit;

  const elements = useMemo(() => {
    const pagesRender = [];

    // Iterate through each page to render its own axis system
    for (let p = 0; p < pageCount; p++) {
        const pageTopY = p * actualPageHeight;
        // The origin Y for THIS page is the middle of this page
        // Note: overrideOrigin.y usually points to first page center (PAGE_HEIGHT/2).
        // So we calculate local center dynamically.
        const localCenterY = pageTopY + (actualPageHeight / 2);
        
        // --- CALC BOUNDS FOR THIS PAGE ---
        const distToLeft = centerX;
        const distToRight = width - centerX;
        const distToTop = localCenterY - pageTopY; // Should be half page height
        const distToBottom = (pageTopY + actualPageHeight) - localCenterY;

        const maxStepsX = Math.ceil(Math.max(distToLeft, distToRight) / step);
        const maxStepsY = Math.ceil(Math.max(distToTop, distToBottom) / step);

        const pageKey = `page-${p}`;

        // 1. Grid Lines
        if (showGrid) {
            for (let i = -maxStepsX; i <= maxStepsX; i++) {
                if (i === 0 && visible) continue; 
                const x = centerX + i * step;
                if (x >= 0 && x <= width) {
                    pagesRender.push(<line key={`${pageKey}-gx${i}`} x1={x} y1={pageTopY} x2={x} y2={pageTopY + actualPageHeight} stroke="#e5e7eb" strokeWidth={1} />);
                }
            }
            for (let i = -maxStepsY; i <= maxStepsY; i++) {
                if (i === 0 && visible) continue;
                const y = localCenterY + i * step;
                if (y >= pageTopY && y <= pageTopY + actualPageHeight) {
                    pagesRender.push(<line key={`${pageKey}-gy${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#e5e7eb" strokeWidth={1} />);
                }
            }
        }

        // 2. Axes & Ticks (Only if visible)
        if (visible) {
            // X-Axis (Horizontal)
            pagesRender.push(
                <line key={`${pageKey}-axis-x`} x1={0} y1={localCenterY} x2={width} y2={localCenterY} stroke={color} strokeWidth={2} markerEnd="url(#arrow)" />
            );
            // Y-Axis (Vertical) - Local to page height
            pagesRender.push(
                <line key={`${pageKey}-axis-y`} x1={centerX} y1={pageTopY + actualPageHeight} x2={centerX} y2={pageTopY} stroke={color} strokeWidth={2} markerEnd="url(#arrow)" />
            );

            // X Ticks
            for (let i = 1; i <= maxStepsX; i++) {
                const xPos = centerX + i * step;
                const xNeg = centerX - i * step;
                if (xPos <= width) {
                    pagesRender.push(<line key={`${pageKey}-txp${i}`} x1={xPos} y1={localCenterY - 5} x2={xPos} y2={localCenterY + 5} stroke={color} strokeWidth={2} />);
                    pagesRender.push(<text key={`${pageKey}-lxp${i}`} x={xPos} y={localCenterY + 20} fill={color} fontSize="12" textAnchor="middle" fontFamily="monospace">{i}</text>);
                }
                if (xNeg >= 0) {
                    pagesRender.push(<line key={`${pageKey}-txn${i}`} x1={xNeg} y1={localCenterY - 5} x2={xNeg} y2={localCenterY + 5} stroke={color} strokeWidth={2} />);
                    pagesRender.push(<text key={`${pageKey}-lxn${i}`} x={xNeg} y={localCenterY + 20} fill={color} fontSize="12" textAnchor="middle" fontFamily="monospace">{-i}</text>);
                }
            }

            // Y Ticks
            for (let i = 1; i <= maxStepsY; i++) {
                const yPos = localCenterY - i * step; // Up
                const yNeg = localCenterY + i * step; // Down
                
                if (yPos >= pageTopY) {
                    pagesRender.push(<line key={`${pageKey}-typ${i}`} x1={centerX - 5} y1={yPos} x2={centerX + 5} y2={yPos} stroke={color} strokeWidth={2} />);
                    pagesRender.push(<text key={`${pageKey}-lyp${i}`} x={centerX - 20} y={yPos + 4} fill={color} fontSize="12" textAnchor="middle" fontFamily="monospace">{i}</text>);
                }
                if (yNeg <= pageTopY + actualPageHeight) {
                    pagesRender.push(<line key={`${pageKey}-tyn${i}`} x1={centerX - 5} y1={yNeg} x2={centerX + 5} y2={yNeg} stroke={color} strokeWidth={2} />);
                    pagesRender.push(<text key={`${pageKey}-lyn${i}`} x={centerX - 25} y={yNeg + 4} fill={color} fontSize="12" textAnchor="middle" fontFamily="monospace">{-i}</text>);
                }
            }

            // Origin Label
            pagesRender.push(<text key={`${pageKey}-origin`} x={centerX - 15} y={localCenterY + 20} fill={color} fontSize="12" fontFamily="monospace">0</text>);
        }
    }

    return pagesRender;
  }, [width, height, centerX, step, visible, showGrid, color, pageCount, actualPageHeight]);

  return (
    <g className="axis-layer pointer-events-none select-none">
      {elements}
      {visible && (
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill={color} />
            </marker>
          </defs>
      )}
    </g>
  );
};