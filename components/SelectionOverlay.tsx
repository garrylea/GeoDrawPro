import React from 'react';
import { Shape, ShapeType, Point } from '../types';
import { getPolygonAngles, getShapeCenter, getRotatedCorners } from '../utils/mathUtils';
import { Plus } from 'lucide-react';

interface SelectionOverlayProps {
  shape: Shape;
  isSelected: boolean; 
  pivotIndex: number | 'center';
  isAltPressed: boolean;
  isMarkingAngles?: boolean;
  isDragging?: boolean;
  onResizeStart: (index: number, e: React.PointerEvent) => void;
  onAngleChange: (index: number, newVal: string) => void;
  onRotateStart: (e: React.PointerEvent) => void;
  onSetPivot: (index: number | 'center') => void;
  onMarkAngle?: (index: number) => void;
  onAngleDoubleClick?: (index: number, e: React.MouseEvent) => void; 
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ 
  shape, 
  pivotIndex, 
  isAltPressed, 
  isMarkingAngles, 
  isDragging,
  onResizeStart, 
  onRotateStart, 
  onSetPivot, 
  onMarkAngle,
  onAngleDoubleClick 
}) => {
  const { points, type, rotation } = shape;
  const handleSize = 10;
  const offset = handleSize / 2;

  // Change color to dark slate/blue when dragging to satisfy "darken" request
  const activeStroke = isDragging ? '#475569' : '#3b82f6';

  const handleStyle = {
    width: handleSize,
    height: handleSize,
    fill: 'rgba(255, 255, 255, 0.2)', // Increased transparency to see underneath
    stroke: activeStroke,
    strokeWidth: 2,
    rx: 2, 
    cursor: 'pointer',
    pointerEvents: 'auto' as const
  };

  // Determine if we should show a bounding box or individual vertex handles
  let showBoundingBox = [
    ShapeType.RECTANGLE, 
    ShapeType.CIRCLE, 
    ShapeType.ELLIPSE, 
    ShapeType.SQUARE, 
    ShapeType.PROTRACTOR, 
    ShapeType.RULER,
    ShapeType.FREEHAND,
    ShapeType.TEXT, 
    ShapeType.PATH, 
    ShapeType.IMAGE // Added
  ].includes(type);

  // Fallback for Polygons with too many points (to prevent UI lag and clutter)
  if (!showBoundingBox && points && points.length > 20) {
      showBoundingBox = true;
  }

  // Calculate bounding box in local/unrotated space
  let minX, minY, maxX, maxY, width, height;
  
  if (type === ShapeType.TEXT) {
      // For text, we can't just take min/max of 1 point. We need rough dims.
      const fs = shape.fontSize || 16;
      // MATCHES mathUtils UPDATE: 0.8 factor
      const w = Math.max(20, (shape.text || '').length * fs * 0.8);
      const h = fs * 1.2;
      minX = points[0].x;
      minY = points[0].y - fs * 0.1;
      maxX = minX + w;
      maxY = minY + h;
      width = w;
      height = h;
  } else if (points && points.length > 0) {
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      minX = Math.min(...xs);
      minY = Math.min(...ys);
      maxX = Math.max(...xs);
      maxY = Math.max(...ys);
      width = maxX - minX;
      height = maxY - minY;
  } else {
      // Fallback
      minX = 0; minY = 0; maxX = 100; maxY = 100; width = 100; height = 100;
  }

  // Special Case: Function Graphs are handled purely by the sidebar. 
  if (type === ShapeType.FUNCTION_GRAPH) {
      return null;
  }

  const center = getShapeCenter(points, type, shape.fontSize, shape.text);
  const rotationTransform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : '';

  let renderHandles = null;

  if (showBoundingBox) {
      // 4 corners of bounding box
      const corners = [
          { x: minX, y: minY, id: 0 }, // TL
          { x: maxX, y: minY, id: 1 }, // TR
          { x: maxX, y: maxY, id: 2 }, // BR
          { x: minX, y: maxY, id: 3 }  // BL
      ];
      
      renderHandles = corners.map((h) => (
          <rect
            key={`h-${h.id}`}
            x={h.x - offset}
            y={h.y - offset}
            {...handleStyle}
            onPointerDown={(e) => onResizeStart(h.id, e)}
            style={{ cursor: (h.id === 0 || h.id === 2) ? 'nwse-resize' : 'nesw-resize', pointerEvents: 'auto' }}
          />
      ));
  } else {
      // Vertex handles (Triangle, Line, Point, Polygon)
      let displayPoints = points;
      // For Triangle specifically, ensure we don't render excessive points if logic broke somewhere, 
      // but for Polygon we want all.
      if (type === ShapeType.TRIANGLE && points.length > 3) {
          displayPoints = points.slice(0, 3);
      }

      renderHandles = displayPoints.map((p, i) => (
          <rect
            key={`v-${i}`}
            x={p.x - offset}
            y={p.y - offset}
            {...handleStyle}
            onPointerDown={(e) => onResizeStart(i, e)}
            style={{ cursor: 'move', pointerEvents: 'auto' }} 
          />
      ));
  }

  // Rotation Handle (Top Center of bounding box)
  const rotHandlePos = { x: minX + width / 2, y: minY - 30 };

  // Pivot Indicator Rendering
  let pivotEl = null;
  if (pivotIndex === 'center') {
      pivotEl = (
          <circle cx={center.x} cy={center.y} r={4} fill="#3b82f6" stroke="white" strokeWidth={2} style={{pointerEvents: 'none'}} />
      );
  } else {
      let px = 0, py = 0;
      if (type === ShapeType.RULER) {
          if (pivotIndex === 0) { px = minX; py = minY + height / 2; }
          else if (pivotIndex === 1) { px = maxX; py = minY + height / 2; }
      } else if (showBoundingBox) {
          const corners = [
            { x: minX, y: minY }, { x: maxX, y: minY }, 
            { x: maxX, y: maxY }, { x: minX, y: maxY }
          ];
          if(typeof pivotIndex === 'number' && corners[pivotIndex]) { 
              px = corners[pivotIndex].x; 
              py = corners[pivotIndex].y; 
          }
      } else {
          if(typeof pivotIndex === 'number' && points[pivotIndex]) { 
              px = points[pivotIndex].x; 
              py = points[pivotIndex].y; 
          }
      }
      pivotEl = <circle cx={px} cy={py} r={4} fill="#ef4444" stroke="white" strokeWidth={2} style={{pointerEvents: 'none'}} />;
  }

  // FIX Bug 2: Generalized Angle Marking Logic
  // Use VISUAL corners (getRotatedCorners) instead of data points.
  // This ensures Rectangles (2 points) get 4 corners for UI.
  const visualPoints = getRotatedCorners(shape);
  const showAngleUI = (type === ShapeType.TRIANGLE || type === ShapeType.POLYGON || type === ShapeType.RECTANGLE || type === ShapeType.SQUARE) && visualPoints.length >= 3;
  
  let angleTargets = null;
  let angleText = null;

  if (showAngleUI) {
      // Use visual points for mapping
      // For Triangle with extra points, slice first.
      
      let localPoints: Point[] = [];
      if (showBoundingBox) {
          localPoints = [
              { x: minX, y: minY }, // TL
              { x: maxX, y: minY }, // TR
              { x: maxX, y: maxY }, // BR
              { x: minX, y: maxY }  // BL
          ];
      } else {
          localPoints = points;
      }
      
      // Render Targets
      if (isMarkingAngles) {
          angleTargets = localPoints.map((p, i) => (
              <circle 
                key={`angle-target-${i}`}
                cx={p.x} cy={p.y} r={15} 
                fill="white" // Ensure fill is present to capture clicks
                fillOpacity="0.01" // Make it effectively transparent but still hit-testable
                stroke="#ef4444" 
                strokeWidth={1} 
                strokeDasharray="2,2"
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onPointerDown={(e) => { e.stopPropagation(); onMarkAngle && onMarkAngle(i); }}
              />
          ));
      }

      // Render Text
      // Angles should be calculated from the geometry.
      // For Rect/Square it is always 90.
      const angles = getPolygonAngles(localPoints);
      
      angleText = localPoints.map((p, i) => {
          if (angles[i] === undefined) return null;
          // Vector from center to point
          const dx = center.x - p.x;
          const dy = center.y - p.y;
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const off = 25;
          // Push text towards center
          const tx = p.x + (dx/len) * off;
          const ty = p.y + (dy/len) * off;
          
          return (
              <text 
                key={`at-${i}`} 
                x={tx} y={ty} 
                fontSize={10} 
                fill="#6b7280" 
                textAnchor="middle" 
                dominantBaseline="middle"
                // Enable pointer events for double click
                style={{ pointerEvents: 'all', userSelect: 'none', cursor: 'pointer' }}
                transform={`rotate(${-rotation || 0} ${tx} ${ty})`}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (onAngleDoubleClick) onAngleDoubleClick(i, e);
                }}
              >
                  {angles[i]}°
              </text>
          );
      });
  }

  // Pivot Setting Targets (Alt Key)
  let pivotTargets = null;
  if (isAltPressed) {
      let candidates: Point[] = [];
      let indices: (number | 'center')[] = [];

      if (type === ShapeType.RULER) {
          candidates = [
              { x: minX, y: minY + height / 2 },
              center,
              { x: maxX, y: minY + height / 2 }
          ];
          indices = [0, 'center', 1];
      } else if (showBoundingBox) {
          candidates = [
              { x: minX, y: minY }, { x: maxX, y: minY }, 
              { x: maxX, y: maxY }, { x: minX, y: maxY },
              center
          ];
          indices = [0, 1, 2, 3, 'center'];
      } else {
          const pts = (type === ShapeType.TRIANGLE && points.length > 3) ? points.slice(0, 3) : points;
          candidates = [...pts, center];
          indices = [...pts.map((_, i) => i), 'center'];
      }

      pivotTargets = candidates.map((p, i) => (
          <g key={`pt-${i}`} transform={`translate(${p.x}, ${p.y})`} 
             onPointerDown={(e) => { e.stopPropagation(); onSetPivot(indices[i]); }}
             style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
          >
              <circle r={6} fill="rgba(255, 255, 255, 0.2)" stroke="#ef4444" strokeWidth={1} />
              <Plus size={8} color="#ef4444" transform="translate(-4, -4)" />
          </g>
      ));
  }

  return (
    // ID added here for Direct DOM manipulation targeting
    <g id="selection-overlay-group" transform={rotationTransform} style={{ opacity: isDragging ? 0.5 : 1, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
        {/* Bounding Box */}
        {showBoundingBox && (
            <rect 
                x={minX} y={minY} width={width} height={height} 
                fill="none" stroke={activeStroke} strokeWidth={1} strokeDasharray="4,4" 
                style={{ pointerEvents: 'none' }}
            />
        )}
        
        {/* Rotate Handle */}
        <line x1={minX + width/2} y1={minY} x2={rotHandlePos.x} y2={rotHandlePos.y} stroke={activeStroke} strokeWidth={1} />
        <circle 
            cx={rotHandlePos.x} cy={rotHandlePos.y} r={5} 
            fill="rgba(255, 255, 255, 0.2)" stroke={activeStroke} strokeWidth={2} 
            style={{ cursor: 'grab', pointerEvents: 'auto' }}
            onPointerDown={onRotateStart}
        />

        {pivotEl}
        {renderHandles}
        {angleTargets}
        {angleText}
        {pivotTargets}
    </g>
  );
};