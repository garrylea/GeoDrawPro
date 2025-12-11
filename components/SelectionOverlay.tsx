import React, { useState } from 'react';
import { Shape, ShapeType } from '../types';
import { calculateTriangleAngles, getAngleArcPath, getShapeCenter, getRotatedCorners } from '../utils/mathUtils';

interface SelectionOverlayProps {
  shape: Shape;
  isSelected: boolean; 
  pivotIndex: number | 'center';
  isAltPressed: boolean;
  onResizeStart: (index: number, e: React.MouseEvent) => void;
  onAngleChange: (index: number, newVal: string) => void;
  onRotateStart: (e: React.MouseEvent) => void;
  onSetPivot: (index: number | 'center') => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ shape, isSelected, pivotIndex, isAltPressed, onResizeStart, onAngleChange, onRotateStart, onSetPivot }) => {
  const { points, type, rotation } = shape;
  const handleSize = 10;
  const offset = handleSize / 2;

  const [editingAngleIndex, setEditingAngleIndex] = useState<number | null>(null);

  const handleStyle = {
    width: handleSize,
    height: handleSize,
    fill: '#ffffff',
    stroke: '#3b82f6',
    strokeWidth: 2,
    rx: 2, 
  };

  // Logic to determine handles
  let handles = points;
  let showBoundingBox = [ShapeType.RECTANGLE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.SQUARE].includes(type);

  // FIX: For Freehand, do NOT show handles for every single point (too many boxes).
  // Freehand is treated as a single object for moving/rotating, but not vertex editing for now.
  if (type === ShapeType.FREEHAND) {
      handles = [];
      showBoundingBox = true; // Show box instead to indicate selection area
  }

  // Use rotated corners to place pivot anchors correctly in world space
  const rotatedCorners = getRotatedCorners(shape);
  const center = getShapeCenter(points); 
  
  const transform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : undefined;

  // Bounding box for dash line (local coords inside the transform)
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const angles = type === ShapeType.TRIANGLE ? calculateTriangleAngles(points) : null;
  const angleValues = angles ? [angles.A, angles.B, angles.C] : [];

  // Pivot Anchors definition (Local coords inside the transformed group)
  let pivotAnchors: {x: number, y: number, id: number}[] = [];
  if (type === ShapeType.TRIANGLE || type === ShapeType.LINE) {
      pivotAnchors = points.map((p, i) => ({ x: p.x, y: p.y, id: i }));
  } else {
      pivotAnchors = [
          { x: minX, y: minY, id: 0 },
          { x: maxX, y: minY, id: 1 },
          { x: maxX, y: maxY, id: 2 },
          { x: minX, y: maxY, id: 3 },
      ];
  }

  return (
    <g className="selection-overlay pointer-events-none" transform={transform}>
      {/* Dashed Border for Box Shapes OR Freehand */}
      {showBoundingBox && (
        <rect
            x={minX}
            y={minY}
            width={maxX - minX}
            height={maxY - minY}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4"
            opacity={0.6}
            className="pointer-events-none"
        />
      )}

      {/* Rotation Handle (Stick) */}
      <g className="rotation-handle pointer-events-auto cursor-grab" onMouseDown={onRotateStart}>
          <line 
             x1={center.x} y1={minY} 
             x2={center.x} y2={minY - 30} 
             stroke="#3b82f6" 
             strokeWidth={1}
          />
          <circle 
             cx={center.x} cy={minY - 30} r={6} 
             fill="white" stroke="#3b82f6" strokeWidth={2}
          />
      </g>

      {/* Visual Arcs for Triangle Angles */}
      {type === ShapeType.TRIANGLE && points.length === 3 && (
          <g className="angle-arcs opacity-50">
             {points.map((p, i) => {
                 const prev = points[(i + 2) % 3];
                 const next = points[(i + 1) % 3];
                 return (
                     <path 
                        key={`arc-${i}`}
                        d={getAngleArcPath(p, prev, next, 25)}
                        fill="#60a5fa"
                        fillOpacity="0.2"
                        stroke="#2563eb"
                        strokeWidth="1"
                     />
                 );
             })}
          </g>
      )}

      {/* Pivot Anchors (Targets) - Render First so Handles are on top */}
      <g className="pivots pointer-events-auto">
          {/* Center Pivot */}
          <circle 
             cx={center.x} cy={center.y} r={5}
             fill={pivotIndex === 'center' ? '#f59e0b' : 'transparent'}
             stroke={pivotIndex === 'center' ? '#f59e0b' : '#94a3b8'}
             strokeWidth={1}
             strokeDasharray={pivotIndex === 'center' ? 'none' : '2 2'}
             className="cursor-pointer hover:fill-amber-100"
             onMouseDown={(e) => { e.stopPropagation(); onSetPivot('center'); }}
          />
          {pivotIndex === 'center' && <circle cx={center.x} cy={center.y} r={2} fill="white" className="pointer-events-none"/>}

          {/* Corner Pivots */}
          {pivotAnchors.map((p) => {
              // Only show corner pivots if they are active OR if Alt is pressed
              // If Alt is pressed, we want them to take event precedence (which they won't if visually under handles)
              // BUT, if Alt is pressed, we hide handles below, so these become clickable.
              const isActive = pivotIndex === p.id;
              if (!isActive && !isAltPressed) return null;

              return (
                  <g key={`pivot-${p.id}`} transform={`translate(${p.x}, ${p.y})`} 
                     onMouseDown={(e) => { e.stopPropagation(); onSetPivot(p.id); }}
                     className="cursor-pointer group"
                  >
                      {/* Bigger hit area when active or alt pressed */}
                      <circle r={12} fill="transparent" />
                      
                      {/* Visual Anchor */}
                      {isActive ? (
                          // Active Pivot Style
                          <g>
                            <circle r={5} fill="#f59e0b" stroke="#ffffff" strokeWidth={1} />
                            <line x1={-3} y1={0} x2={3} y2={0} stroke="white" strokeWidth={1} />
                            <line x1={0} y1={-3} x2={0} y2={3} stroke="white" strokeWidth={1} />
                          </g>
                      ) : (
                          // Inactive Pivot Candidate Style (Only visible on Alt)
                          <circle r={4} fill="white" stroke="#f59e0b" strokeWidth={2} />
                      )}
                  </g>
              );
          })}
      </g>

      {/* Resize Handles - Render Last (On Top) - Hide if Alt is pressed to allow Pivot clicking */}
      {!isAltPressed && (
        <g className="handles pointer-events-auto">
            {handles.map((p, idx) => (
                <rect
                    key={`handle-${idx}`}
                    x={p.x - offset}
                    y={p.y - offset}
                    {...handleStyle}
                    style={{ cursor: 'crosshair' }}
                    onMouseDown={(e) => onResizeStart(idx, e)}
                />
            ))}
        </g>
      )}
      
      {/* Triangle Angle Visualization Text */}
      {type === ShapeType.TRIANGLE && handles.map((p, idx) => {
          return (
            <g key={`angle-text-${idx}`} className="pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
               {editingAngleIndex === idx ? (
                   <foreignObject x={p.x + 15} y={p.y - 15} width="60" height="25">
                       <input 
                          autoFocus
                          defaultValue={angleValues[idx]}
                          onBlur={(e) => {
                              setEditingAngleIndex(null);
                              onAngleChange(idx, e.target.value);
                          }}
                          onKeyDown={(e) => {
                              if(e.key === 'Enter') {
                                  setEditingAngleIndex(null);
                                  onAngleChange(idx, e.currentTarget.value);
                              }
                          }}
                          className="w-full h-full px-1 text-xs border border-brand-500 rounded shadow outline-none"
                       />
                   </foreignObject>
               ) : (
                   <text 
                        x={p.x + 15} 
                        y={p.y} 
                        fill="#2563eb" 
                        fontSize="11" 
                        fontWeight="bold"
                        className="cursor-pointer select-none"
                        style={{ textShadow: '0px 0px 4px white' }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingAngleIndex(idx);
                        }}
                    >
                        {angleValues[idx]}°
                    </text>
               )}
            </g>
          );
      })}
    </g>
  );
};