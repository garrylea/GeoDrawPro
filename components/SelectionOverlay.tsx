
import React from 'react';
import { Shape, ShapeType, Point } from '../types';
import { calculateTriangleAngles, getShapeCenter } from '../utils/mathUtils';
import { Plus } from 'lucide-react';

interface SelectionOverlayProps {
  shape: Shape;
  isSelected: boolean; 
  pivotIndex: number | 'center';
  isAltPressed: boolean;
  isMarkingAngles?: boolean;
  onResizeStart: (index: number, e: React.MouseEvent) => void;
  onAngleChange: (index: number, newVal: string) => void;
  onRotateStart: (e: React.MouseEvent) => void;
  onSetPivot: (index: number | 'center') => void;
  onMarkAngle?: (index: number) => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ 
  shape, 
  isSelected, 
  pivotIndex, 
  isAltPressed, 
  isMarkingAngles, 
  onResizeStart, 
  onAngleChange, 
  onRotateStart, 
  onSetPivot, 
  onMarkAngle 
}) => {
  const { points, type, rotation } = shape;
  const handleSize = 10;
  const offset = handleSize / 2;

  const handleStyle = {
    width: handleSize,
    height: handleSize,
    fill: '#ffffff',
    stroke: '#3b82f6',
    strokeWidth: 2,
    rx: 2, 
    cursor: 'pointer'
  };

  // Determine if we should show a bounding box or individual vertex handles
  let showBoundingBox = [
    ShapeType.RECTANGLE, 
    ShapeType.CIRCLE, 
    ShapeType.ELLIPSE, 
    ShapeType.SQUARE, 
    ShapeType.PROTRACTOR, 
    ShapeType.RULER,
    ShapeType.FREEHAND
  ].includes(type);

  // For Freehand, we definitely want bounding box, not 100s of handles
  if (type === ShapeType.FREEHAND) {
      showBoundingBox = true; 
  }

  // Calculate bounding box in local/unrotated space
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  const center = getShapeCenter(points);
  
  // Apply rotation to the whole group
  const transform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : undefined;

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
            onMouseDown={(e) => onResizeStart(h.id, e)}
            style={{ cursor: (h.id === 0 || h.id === 2) ? 'nwse-resize' : 'nesw-resize' }}
          />
      ));
  } else {
      // Vertex handles (Triangle, Line, Point)
      // Force restriction for Triangles to 3 handles to prevent visual corruption
      let displayPoints = points;
      if (type === ShapeType.TRIANGLE && points.length > 3) {
          displayPoints = points.slice(0, 3);
      }

      renderHandles = displayPoints.map((p, i) => (
          <rect
            key={`v-${i}`}
            x={p.x - offset}
            y={p.y - offset}
            {...handleStyle}
            onMouseDown={(e) => onResizeStart(i, e)}
            style={{ cursor: 'move' }} 
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
      if (showBoundingBox) {
          const corners = [
            { x: minX, y: minY }, { x: maxX, y: minY }, 
            { x: maxX, y: maxY }, { x: minX, y: maxY }
          ];
          // Determine corner based on index logic in App.tsx (usually consistent)
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

  // Angle Targets (for marking)
  let angleTargets = null;
  if (isMarkingAngles && type === ShapeType.TRIANGLE) {
      // Safe slice for triangles
      const triPoints = points.length > 3 ? points.slice(0, 3) : points;
      angleTargets = triPoints.map((p, i) => (
          <circle 
            key={`angle-target-${i}`}
            cx={p.x} cy={p.y} r={15} 
            fill="transparent" 
            stroke="#ef4444" 
            strokeWidth={1} 
            strokeDasharray="2,2"
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => { e.stopPropagation(); onMarkAngle && onMarkAngle(i); }}
          />
      ));
  }

  // Angle Text Values
  let angleText = null;
  if (type === ShapeType.TRIANGLE && points.length >= 3) {
      // Use helper that naturally expects 3 points, ignores extras if calculation is based on first 3
      const angles = calculateTriangleAngles(points);
      const angleArr = [angles.A, angles.B, angles.C];
      const triPoints = points.slice(0, 3);
      
      angleText = triPoints.map((p, i) => {
          const dx = center.x - p.x;
          const dy = center.y - p.y;
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const off = 25;
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
                style={{ pointerEvents: 'none', userSelect: 'none' }}
                transform={`rotate(${-rotation || 0} ${tx} ${ty})`}
              >
                  {angleArr[i]}°
              </text>
          );
      });
  }

  // Pivot Setting Targets (Alt Key)
  let pivotTargets = null;
  if (isAltPressed) {
      let candidates: Point[] = [];
      let indices: (number | 'center')[] = [];

      if (showBoundingBox) {
          candidates = [
              { x: minX, y: minY }, { x: maxX, y: minY }, 
              { x: maxX, y: maxY }, { x: minX, y: maxY },
              center
          ];
          indices = [0, 1, 2, 3, 'center'];
      } else {
          // Restrict candidates for Triangles
          const activePoints = (type === ShapeType.TRIANGLE && points.length > 3) ? points.slice(0, 3) : points;
          candidates = [...activePoints, center];
          indices = [...activePoints.map((_, i) => i), 'center'];
      }

      pivotTargets = candidates.map((p, i) => (
          <g key={`pt-${i}`} transform={`translate(${p.x}, ${p.y})`} 
             onMouseDown={(e) => { e.stopPropagation(); onSetPivot(indices[i]); }}
             style={{ cursor: 'crosshair' }}
          >
              <circle r={6} fill="rgba(255, 255, 255, 0.8)" stroke="#ef4444" strokeWidth={1} />
              <Plus size={8} color="#ef4444" transform="translate(-4, -4)" />
          </g>
      ));
  }

  return (
    <g transform={transform}>
        {/* Bounding Box */}
        {showBoundingBox && (
            <rect 
                x={minX} y={minY} width={width} height={height} 
                fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4,4" 
                style={{ pointerEvents: 'none' }}
            />
        )}
        
        {/* Rotate Handle */}
        <line x1={minX + width/2} y1={minY} x2={rotHandlePos.x} y2={rotHandlePos.y} stroke="#3b82f6" strokeWidth={1} />
        <circle 
            cx={rotHandlePos.x} cy={rotHandlePos.y} r={5} 
            fill="#ffffff" stroke="#3b82f6" strokeWidth={2} 
            style={{ cursor: 'grab' }}
            onMouseDown={onRotateStart}
        />

        {pivotEl}
        {renderHandles}
        {angleTargets}
        {angleText}
        {pivotTargets}
    </g>
  );
};
