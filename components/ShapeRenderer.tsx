import React from 'react';
import { Shape, ShapeType, Point, ToolType } from '../types';
import { getShapeCenter, getSmoothSvgPath, getVariableWidthPath } from '../utils/mathUtils';

interface ShapeRendererProps {
  shape: Shape;
  isSelected: boolean;
  tool?: ToolType;
}

export const ShapeRenderer = React.memo(({ shape, isSelected, tool }: ShapeRendererProps) => {
  const { type, points, fill, stroke, strokeWidth, text, rotation, strokeType, pathData, fontSize, labels, imageUrl, usePressure } = shape;
  
  if (type === ShapeType.MARKER) {
      if (!pathData) return null;
      return (
          <path 
              d={pathData} 
              fill="none" 
              stroke={isSelected ? '#3b82f6' : '#ef4444'} 
              strokeWidth={2} 
              strokeLinecap="round" 
              strokeLinejoin="round"
              data-shape-id={shape.id}
          />
      );
  }

  let dashArray = 'none';
  if (strokeType === 'dashed') {
      dashArray = `${strokeWidth * 4},${strokeWidth * 2}`; 
  } else if (strokeType === 'dotted') {
      dashArray = `${strokeWidth},${strokeWidth * 2}`; 
  }

  const commonProps = {
    fill,
    stroke: isSelected ? '#3b82f6' : stroke, 
    strokeWidth: isSelected ? Math.max(strokeWidth, 2) : strokeWidth,
    strokeDasharray: isSelected ? 'none' : dashArray, 
    opacity: 0.9,
    vectorEffect: 'non-scaling-stroke', 
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };

  const center = getShapeCenter(points, type);
  const rotationTransform = rotation ? `rotate(${rotation} ${center.x} ${center.y})` : '';

  if (type === ShapeType.FUNCTION_GRAPH) {
      if (!pathData) return null;
      return (
          <g className="shape-group" transform={rotationTransform} style={{ cursor: tool !== ToolType.SELECT ? 'inherit' : (isSelected ? 'pointer' : 'pointer') }} data-shape-id={shape.id}>
              <path d={pathData} fill="none" stroke="transparent" strokeWidth={15} />
              {isSelected && <path d={pathData} fill="none" stroke="#60a5fa" strokeWidth={strokeWidth + 4} opacity={0.3} />}
              <path d={pathData} {...commonProps} fill="none" />
          </g>
      );
  }

  if (!points || points.length === 0) return null;

  let element = null;
  const p0 = points[0];
  const p1 = points[1] || points[0]; 
  
  const x = Math.min(p0.x, p1.x);
  const y = Math.min(p0.y, p1.y);
  const width = Math.abs(p1.x - p0.x);
  const height = Math.abs(p1.y - p0.y);

  let labelElements: React.ReactNode[] = [];
  if (labels && labels.length > 0) {
      const renderLabel = (vertex: Point, label: string, index: number, center: Point) => {
          if (!label) return null;
          const dx = vertex.x - center.x;
          const dy = vertex.y - center.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const padding = 20; 
          const offsetX = len > 0 ? (dx / len) * padding : 15;
          const offsetY = len > 0 ? (dy / len) * padding : -15;
          const labelX = vertex.x + offsetX;
          const labelY = vertex.y + offsetY;
          const counterRotate = `rotate(${-rotation}, ${labelX}, ${labelY})`;

          return (
              <text
                  key={`lbl-${index}`}
                  x={labelX}
                  y={labelY}
                  fill={stroke} 
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

      const center = getShapeCenter(points, type);
      if (type === ShapeType.TRIANGLE && points.length >= 3) {
          labels.forEach((l, i) => {
              if (points[i]) labelElements.push(renderLabel(points[i], l, i, center));
          });
      } else if (type === ShapeType.LINE) {
          labels.forEach((l, i) => {
             if (points[i]) labelElements.push(renderLabel(points[i], l, i, center));
          });
      } else if ((type === ShapeType.RECTANGLE || type === ShapeType.SQUARE) && labels.length >= 4) {
          const corners = [
              { x: x, y: y },         
              { x: x + width, y: y }, 
              { x: x + width, y: y + height }, 
              { x: x, y: y + height } 
          ];
          corners.forEach((c, i) => {
              if (labels[i]) labelElements.push(renderLabel(c, labels[i], i, { x: x + width/2, y: y + height/2 }));
          });
      } else if (type === ShapeType.POINT) {
           labels.forEach((l, i) => {
               labelElements.push(renderLabel(points[0], l, i, { x: points[0].x - 1, y: points[0].y + 1 }));
           });
      }
  }

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
    case ShapeType.POLYGON:
      if (points.length < 3) return null;
      element = <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} {...commonProps} />;
      break;
    case ShapeType.FREEHAND:
        if (points.length < 2) return null;
        const hasPressureData = points.some(p => p.p !== undefined && p.p !== 0.5);
        if (usePressure || hasPressureData) {
            const pressurePath = getVariableWidthPath(points, strokeWidth);
            element = <path d={pressurePath} fill={isSelected ? '#3b82f6' : stroke} stroke="none" opacity={0.9} />;
        } else {
            element = <path d={getSmoothSvgPath(points)} {...commonProps} fill="none" />;
        }
        break;
    case ShapeType.PATH:
        if (!pathData) return null;
        element = <path d={pathData} {...commonProps} />;
        break;
    case ShapeType.POINT:
        element = <circle cx={p0.x} cy={p0.y} r={Math.max(4, strokeWidth * 2)} fill={stroke} stroke={isSelected ? '#3b82f6' : 'none'} strokeWidth={isSelected ? 2 : 0} />;
        break;
    case ShapeType.TEXT:
        element = <text x={p0.x} y={p0.y} fill={stroke} fontSize={fontSize || 16} fontFamily="sans-serif" dominantBaseline="hanging" style={{ userSelect: 'none' }}>{text}</text>;
        break;
    case ShapeType.IMAGE:
        if (!imageUrl) return null;
        element = <image href={imageUrl} x={x} y={y} width={width} height={height} preserveAspectRatio="none" />;
        break;
    case ShapeType.PROTRACTOR:
        const cx = x + width / 2;
        const cy = y + height; 
        const radius = width / 2;
        const pticks = [];
        const plabels = [];
        for (let i = 0; i <= 180; i++) {
            const rad = (Math.PI * i) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            let len = 5;
            if (i % 5 === 0) len = 8;
            if (i % 10 === 0) len = 12;
            const xOuter = cx - radius * cos;
            const yOuter = cy - radius * sin;
            const xInner = cx - (radius - len) * cos;
            const yInner = cy - (radius - len) * sin;
            pticks.push(<line key={`t-${i}`} x1={xInner} y1={yInner} x2={xOuter} y2={yOuter} stroke={stroke} strokeWidth={i % 10 === 0 ? 1.5 : 0.5} />);
            if (i % 15 === 0 && i !== 180 && i !== 0) {
                 const xText = cx - (radius - 25) * cos;
                 const yText = cy - (radius - 25) * sin;
                 plabels.push(<text key={`l-${i}`} x={xText} y={yText} fill={stroke} fontSize={Math.min(12, radius / 10)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${90 - i} ${xText} ${yText})`} style={{ userSelect: 'none' }}>{i}</text>);
            }
        }
        element = (
            <g>
                <path d={`M ${x} ${cy} A ${radius} ${radius} 0 0 1 ${x + width} ${cy} Z`} fill="#bae6fd" fillOpacity="0.3" stroke={stroke} strokeWidth={2} />
                <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke={stroke} strokeWidth={2} />
                <line x1={cx} y1={cy - 10} x2={cx} y2={cy} stroke="#ef4444" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={3} fill="#ef4444" />
                {pticks}
                {plabels}
            </g>
        );
        break;

    case ShapeType.RULER:
        const bodyColor = isSelected ? '#dbeafe' : '#f8fafc';
        const borderColor = isSelected ? '#3b82f6' : '#cbd5e1';
        const rulerBody = (
            <rect 
                x={x} y={y} 
                width={width} height={height} 
                fill={bodyColor} 
                fillOpacity="0.85"
                stroke={borderColor} 
                strokeWidth={1} 
                rx={4} 
            />
        );
        const rulerTicks = [];
        const rulerLabels = [];
        const tickSpacing = 2; 
        const numTicks = Math.floor(width / tickSpacing);
        for(let i=0; i<=numTicks; i++) {
            const tx = x + i * tickSpacing;
            let tickLen = 4;
            let tickWeight = 0.4;
            let opacity = 0.4;
            if (i % 10 === 0) {
                tickLen = 14; 
                tickWeight = 1.2;
                opacity = 1.0;
            } else if (i % 5 === 0) {
                tickLen = 8; 
                tickWeight = 0.8;
                opacity = 0.7;
            }
            rulerTicks.push(<line key={`rt-${i}`} x1={tx} y1={y} x2={tx} y2={y + tickLen} stroke="#64748b" strokeWidth={tickWeight} strokeOpacity={opacity} strokeLinecap="square" />);
            if (i % 10 === 0) {
                rulerLabels.push(<text key={`rl-${i}`} x={tx} y={y + 28} fontSize={9} fill="#475569" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>{i / 10}</text>);
            }
        }
        element = (
            <g>
                {rulerBody}
                {rulerTicks}
                {rulerLabels}
                <rect x={x + 1} y={y + 1} width={width - 2} height={2} fill="white" fillOpacity={0.4} rx={1} />
                <circle cx={x} cy={y} r={1.5} fill="#ef4444" />
            </g>
        );
        break;

    default:
      return null;
  }

  return (
    <g className="shape-group" transform={rotationTransform} style={{ cursor: tool !== ToolType.SELECT ? 'inherit' : (isSelected ? 'move' : 'pointer') }} data-shape-id={shape.id}>
      {isSelected && type !== ShapeType.IMAGE && (
          <g style={{ opacity: 0.3, pointerEvents: 'none' }}>
             {React.cloneElement(element as React.ReactElement<any>, { 
                 stroke: '#60a5fa', 
                 strokeWidth: (strokeWidth || 1) + 6, 
                 fill: 'none',
                 strokeDasharray: 'none' 
             })}
          </g>
      )}
      {element}
      {labelElements}
    </g>
  );
}, (prev, next) => {
    return prev.isSelected === next.isSelected && prev.shape === next.shape && prev.tool === next.tool;
});