
import React from 'react';
import { Shape, ShapeType } from '../types';
import { getShapeCenter, getSmoothSvgPath } from '../utils/mathUtils';

interface ShapeRendererProps {
  shape: Shape;
  isSelected: boolean;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({ shape, isSelected }) => {
  const { type, points, fill, stroke, strokeWidth, text, rotation, strokeType, pathData, fontSize } = shape;
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
        const pathDataSmooth = getSmoothSvgPath(points);
        element = <path d={pathDataSmooth} {...commonProps} fill="none" />;
        break;

    case ShapeType.PATH:
        if (!pathData) return null;
        element = <path d={pathData} {...commonProps} />;
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
                fontSize={fontSize || 16} 
                fontFamily="sans-serif"
                dominantBaseline="hanging"
                style={{ userSelect: 'none' }}
            >
                {text}
            </text>
        );
        break;

    case ShapeType.PROTRACTOR:
        // Protractor Logic
        const cx = x + width / 2;
        const cy = y + height; // Base line is at the bottom
        const radius = width / 2;
        
        // Generate Ticks
        const ticks = [];
        const labels = [];
        for (let i = 0; i <= 180; i++) {
            const rad = (Math.PI * i) / 180;
            // Note: SVG Y is down, so we subtract Math.sin for "up"
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            // Tick length logic
            let len = 5;
            if (i % 5 === 0) len = 8;
            if (i % 10 === 0) len = 12;

            // Outer arc edge
            const xOuter = cx - radius * cos; // 0 degrees is usually right side, 180 left. Let's make 0 right.
            const yOuter = cy - radius * sin;
            
            // Inner tick start
            const xInner = cx - (radius - len) * cos;
            const yInner = cy - (radius - len) * sin;

            if (i % 1 === 0) {
               ticks.push(<line key={`t-${i}`} x1={xInner} y1={yInner} x2={xOuter} y2={yOuter} stroke={stroke} strokeWidth={i % 10 === 0 ? 1.5 : 0.5} />);
            }

            // Labels every 15 degrees
            if (i % 15 === 0 && i !== 180 && i !== 0) {
                 const xText = cx - (radius - 25) * cos;
                 const yText = cy - (radius - 25) * sin;
                 // Inner scale labels (optional, usually protractors have two scales. Let's stick to one 0-180 for simplicity)
                 labels.push(
                     <text 
                        key={`l-${i}`} 
                        x={xText} y={yText} 
                        fill={stroke} 
                        fontSize={Math.min(12, radius / 10)} 
                        textAnchor="middle" 
                        dominantBaseline="middle"
                        transform={`rotate(${90 - i} ${xText} ${yText})`}
                        style={{ userSelect: 'none' }}
                     >
                         {i}
                     </text>
                 );
            }
        }

        element = (
            <g>
                {/* Plastic Body Background */}
                <path 
                    d={`M ${x} ${cy} A ${radius} ${radius} 0 0 1 ${x + width} ${cy} Z`} 
                    fill="#bae6fd" 
                    fillOpacity="0.3" 
                    stroke={stroke} 
                    strokeWidth={2}
                />
                {/* Inner cutout (optional, aesthetics) */}
                <path 
                    d={`M ${cx - radius * 0.4} ${cy} A ${radius * 0.4} ${radius * 0.4} 0 0 1 ${cx + radius * 0.4} ${cy} Z`} 
                    fill="none" 
                    stroke={stroke} 
                    strokeWidth={1}
                    opacity="0.5"
                />
                
                {/* Base Line */}
                <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke={stroke} strokeWidth={2} />
                
                {/* Center Mark */}
                <line x1={cx} y1={cy - 10} x2={cx} y2={cy} stroke="#ef4444" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={3} fill="#ef4444" />

                {/* Ticks and Labels */}
                {ticks}
                {labels}
            </g>
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
                 fill: type === ShapeType.TEXT || type === ShapeType.PROTRACTOR ? 'none' : 'none',
                 strokeDasharray: 'none' // Selection halo is always solid
             })}
          </g>
      )}
      {element}
    </g>
  );
};
