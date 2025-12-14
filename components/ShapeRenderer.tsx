
import React from 'react';
import { Shape, ShapeType, Point } from '../types';
import { getShapeCenter, getSmoothSvgPath, distance } from '../utils/mathUtils';

interface ShapeRendererProps {
  shape: Shape;
  isSelected: boolean;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({ shape, isSelected }) => {
  const { type, points, fill, stroke, strokeWidth, text, rotation, strokeType, pathData, fontSize, labels, imageUrl } = shape;
  
  // MARKER SPECIAL HANDLING
  if (type === ShapeType.MARKER) {
      if (!pathData) return null;
      return (
          <path 
              d={pathData} 
              fill="none" 
              stroke={isSelected ? '#3b82f6' : '#ef4444'} // Markers usually Red or Black. Let's make them Red by default to stand out, or follow props.
              strokeWidth={2} 
              strokeLinecap="round" 
              strokeLinejoin="round"
          />
      );
  }

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

  // --- Function Graph Renderer ---
  if (type === ShapeType.FUNCTION_GRAPH) {
      if (!pathData) return null;
      // Functions are pure paths
      return (
          <g className="shape-group" style={{ cursor: isSelected ? 'pointer' : 'pointer' }}>
              {/* Thick transparent hit target */}
              <path d={pathData} fill="none" stroke="transparent" strokeWidth={15} />
              {isSelected && <path d={pathData} fill="none" stroke="#60a5fa" strokeWidth={strokeWidth + 4} opacity={0.3} />}
              <path d={pathData} {...commonProps} fill="none" />
          </g>
      );
  }

  // For other shapes, we need points
  if (!points || points.length === 0) return null;

  let element = null;
  const p0 = points[0];
  const p1 = points[1] || points[0]; 
  
  const x = Math.min(p0.x, p1.x);
  const y = Math.min(p0.y, p1.y);
  const width = Math.abs(p1.x - p0.x);
  const height = Math.abs(p1.y - p0.y);

  // --- Smart Labeling Logic ---
  let labelElements: React.ReactNode[] = [];
  
  // Only render labels if they exist
  if (labels && labels.length > 0) {
      // Helper to calculate label position: Vertex + (Vertex - Center).normalized * padding
      const renderLabel = (vertex: Point, label: string, index: number, center: Point) => {
          if (!label) return null;
          
          // Vector from center to vertex
          const dx = vertex.x - center.x;
          const dy = vertex.y - center.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          
          // Padding offset (push label away from shape)
          const padding = 20; 
          
          // If length is 0 (single point), just offset up-right
          const offsetX = len > 0 ? (dx / len) * padding : 15;
          const offsetY = len > 0 ? (dy / len) * padding : -15;

          const labelX = vertex.x + offsetX;
          const labelY = vertex.y + offsetY;

          // Counter-rotate the text so it stays upright relative to the screen,
          // negating the group's rotation.
          const counterRotate = `rotate(${-rotation}, ${labelX}, ${labelY})`;

          return (
              <text
                  key={`lbl-${index}`}
                  x={labelX}
                  y={labelY}
                  fill={stroke} // Use shape color for label
                  fontSize={14}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={counterRotate}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                  {label}
              </text>
          );
      };

      const center = getShapeCenter(points);

      // Determine vertices based on shape type
      if (type === ShapeType.TRIANGLE && points.length >= 3) {
          labels.forEach((l, i) => {
              if (points[i]) labelElements.push(renderLabel(points[i], l, i, center));
          });
      } else if (type === ShapeType.LINE) {
          labels.forEach((l, i) => {
             if (points[i]) labelElements.push(renderLabel(points[i], l, i, center));
          });
      } else if ((type === ShapeType.RECTANGLE || type === ShapeType.SQUARE) && labels.length >= 4) {
          // Logic for Rect corners: TL, TR, BR, BL
          // Points are just diagonal [p0, p1], so we must derive 4 corners
          const corners = [
              { x: x, y: y },         // TL
              { x: x + width, y: y }, // TR
              { x: x + width, y: y + height }, // BR
              { x: x, y: y + height } // BL
          ];
          corners.forEach((c, i) => {
              if (labels[i]) labelElements.push(renderLabel(c, labels[i], i, { x: x + width/2, y: y + height/2 }));
          });
      } else if (type === ShapeType.POINT) {
           labels.forEach((l, i) => {
               // For single point, just offset slightly
               labelElements.push(renderLabel(points[0], l, i, { x: points[0].x - 1, y: points[0].y + 1 }));
           });
      }
  }
  // -----------------------------

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
    
    case ShapeType.POLYGON:
        if (points.length < 3) return null;
        const ptsPoly = points.map(p => `${p.x},${p.y}`).join(' ');
        element = <polygon points={ptsPoly} {...commonProps} />;
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

    case ShapeType.IMAGE:
        if (!imageUrl) return null;
        element = (
            <image 
                href={imageUrl}
                x={x} y={y} 
                width={width} height={height}
                preserveAspectRatio="none"
                // Removed pointerEvents: 'none' so that the group cursor style works on hover
            />
        );
        break;

    case ShapeType.PROTRACTOR:
        // Protractor Logic
        const cx = x + width / 2;
        const cy = y + height; // Base line is at the bottom
        const radius = width / 2;
        
        // Generate Ticks
        const ticks = [];
        const labelsP = [];
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
                 labelsP.push(
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
                <path 
                    d={`M ${x} ${cy} A ${radius} ${radius} 0 0 1 ${x + width} ${cy} Z`} 
                    fill="#bae6fd" 
                    fillOpacity="0.3" 
                    stroke={stroke} 
                    strokeWidth={2}
                />
                <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke={stroke} strokeWidth={2} />
                <line x1={cx} y1={cy - 10} x2={cx} y2={cy} stroke="#ef4444" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={3} fill="#ef4444" />
                {ticks}
                {labelsP}
            </g>
        );
        break;

    case ShapeType.RULER:
        // Ruler Logic
        // Rectangle body + ticks on top edge
        const rulerBody = <rect x={x} y={y} width={width} height={height} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={2} />;
        
        const rulerTicks = [];
        const rulerLabels = [];
        const tickSpacing = 10; // Pixels
        const numTicks = Math.floor(width / tickSpacing);

        for(let i=0; i<=numTicks; i++) {
            const tx = x + i * tickSpacing;
            const isMajor = i % 5 === 0;
            const isLabel = i % 5 === 0 && i !== 0; // Simplified label logic (every 50px usually)
            
            rulerTicks.push(
                <line 
                    key={`rt-${i}`}
                    x1={tx} y1={y}
                    x2={tx} y2={y + (isMajor ? 15 : 8)}
                    stroke="#64748b"
                    strokeWidth={1}
                />
            );

            if (isLabel) {
                // Assuming 1 tick = 1mm approx visually, so 50px = 5cm? Or just abstract units.
                // Let's print 'i' as the index.
                // Or better: i/5 to simulate cm?
                rulerLabels.push(
                    <text
                        key={`rl-${i}`}
                        x={tx + 2}
                        y={y + 25}
                        fontSize={10}
                        fill="#64748b"
                        fontFamily="monospace"
                    >
                        {i}
                    </text>
                );
            }
        }

        element = (
            <g>
                {rulerBody}
                {rulerTicks}
                {rulerLabels}
                {/* Shine effect */}
                <rect x={x} y={y} width={width} height={5} fill="white" fillOpacity={0.3} rx={2} />
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
      {isSelected && type !== ShapeType.IMAGE && (
          <g style={{ opacity: 0.3, pointerEvents: 'none' }}>
             {React.cloneElement(element as React.ReactElement<any>, { 
                 stroke: '#60a5fa', 
                 strokeWidth: (strokeWidth || 1) + 6, 
                 fill: type === ShapeType.TEXT || type === ShapeType.PROTRACTOR || type === ShapeType.RULER ? 'none' : 'none',
                 strokeDasharray: 'none' 
             })}
          </g>
      )}
      {element}
      {labelElements}
    </g>
  );
};
