import React from 'react';
import { Shape, ShapeType } from '../types';
import { getShapeCenter, getSmoothSvgPath } from '../utils/mathUtils';

interface ShapeRendererProps {
  shape: Shape;
  isSelected: boolean;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({ shape, isSelected }) => {
  const { type, points, fill, stroke, strokeWidth, text, rotation, strokeType } = shape;
  if (!points || points.length === 0) return null;

  // Determine Dash Array based on strokeType
  let dashArray = 'none';
  if (strokeType === 'dashed') {
      dashArray = `${strokeWidth * 4},${strokeWidth * 2}`; // e.g., 8,4
  } else if (strokeType === 'dotted') {
      dashArray = `${strokeWidth},${strokeWidth * 2}`; // e.g., 2,4
  }

  const commonProps = {
    fill,
    stroke: isSelected ? '#3b82f6' : stroke, 
    strokeWidth: isSelected ? Math.max(strokeWidth, 2) : strokeWidth,
    strokeDasharray: isSelected ? 'none' : dashArray, // Don't dash the selection highlight
    opacity: 0.9,
    vectorEffect: 'non-scaling-stroke', 
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };

  let element = null;
  const p0 = points[0];
  const p1 = points[1] || points[0]; 
  
  const x = Math.min(p0.x, p1.x);
  const y = Math.min(p0.y, p1.y);
  const width = Math.abs(p1.x - p0.x);
  const height = Math.abs(p1.y - p0.y);

  switch (type) {
    case ShapeType.RECTANGLE:
    case ShapeType.SQUARE:
      element = <rect x={x} y={y} width={width} height={height} {...commonProps} />;
      break;
    
    case ShapeType.CIRCLE:
      const r = Math.min(width, height) / 2;
      element = <circle cx={x + width / 2} cy={y + height / 2} r={r} {...commonProps} />;
      break;

    case ShapeType.ELLIPSE:
      element = <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...commonProps} />;
      break;

    case ShapeType.LINE:
      element = <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} {...commonProps} />;
      break;
      
    case ShapeType.TRIANGLE:
      if (points.length < 3) return null;
      const pts = points.map(p => `${p.x},${p.y}`).join(' ');
      element = <polygon points={pts} {...commonProps} />;
      break;

    case ShapeType.FREEHAND:
        if (points.length < 2) return null;
        // Use smooth path algorithm instead of raw polyline
        const pathData = getSmoothSvgPath(points);
        element = <path d={pathData} {...commonProps} fill="none" />;
        break;

    case ShapeType.POINT:
        element = <circle cx={p0.x} cy={p0.y} r={Math.max(4, strokeWidth * 2)} fill={stroke} stroke={isSelected ? '#3b82f6' : 'none'} strokeWidth={isSelected ? 2 : 0} />;
        break;

    case ShapeType.TEXT:
        element = (
            <text 
                x={p0.x} 
                y={p0.y} 
                fill={stroke} 
                fontSize={20 + strokeWidth * 2} 
                fontFamily="sans-serif"
                dominantBaseline="hanging"
                style={{ userSelect: 'none' }}
            >
                {text}
            </text>
        );
        break;

    default:
      return null;
  }

  const center = getShapeCenter(points);
  const transform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : undefined;

  return (
    <g className="shape-group" transform={transform} style={{ cursor: isSelected ? 'move' : 'pointer' }}>
      {isSelected && (
          <g style={{ opacity: 0.3, pointerEvents: 'none' }}>
             {/* Clone element with thicker stroke for halo. */}
             {React.cloneElement(element as React.ReactElement<any>, { 
                 stroke: '#60a5fa', 
                 strokeWidth: (strokeWidth || 1) + 6, 
                 fill: type === ShapeType.TEXT ? 'none' : 'none',
                 strokeDasharray: 'none' // Selection halo is always solid
             })}
          </g>
      )}
      {element}
    </g>
  );
};