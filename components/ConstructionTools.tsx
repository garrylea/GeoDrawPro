
import React from 'react';
import { Point } from '../types';
import { getAngleDegrees, distance } from '../utils/mathUtils';

interface CompassOverlayProps {
    center: Point | null; // Needle position
    cursor: Point;       // Mouse position (controls pencil or rotation)
    radiusPoint: Point | null; // If set, radius is locked
    isDrawing: boolean;
}

export const CompassOverlay: React.FC<CompassOverlayProps> = ({ center, cursor, radiusPoint, isDrawing }) => {
    // 1. INITIAL STATE: "Just a point"
    // The user hasn't clicked anywhere yet. Rely on the crosshair cursor.
    if (!center) {
        return null;
    }

    // 2. ACTIVE STATE
    // Center (Needle) is set. 
    
    const needlePos = center;
    
    // Separation of concerns:
    // DISTANCE (Spread): Defined by radiusPoint (if locked) or cursor (if setting radius).
    const dist = radiusPoint ? distance(center, radiusPoint) : distance(center, cursor);
    
    // ROTATION (Orientation): Always points towards the cursor. 
    // This ensures the pencil leg follows the mouse during the arc drawing phase.
    const rotationAngle = getAngleDegrees(needlePos, cursor);

    // 150 Degree Logic (Requested Update)
    // We want the angle between legs to be 150 degrees.
    // This creates an isosceles triangle with top angle 150, base angles 15.
    // Height / (Dist/2) = tan(15) ≈ 0.2679
    const height = (dist / 2) * 0.2679;

    // Minimum size constraint so it doesn't disappear when radius is tiny
    const displayHeight = Math.max(12, height); 
    
    // Scale down visual stroke width as it gets smaller to preserve "sharp" look
    const strokeW = Math.max(1, Math.min(2.5, dist / 60));

    return (
        <g style={{ pointerEvents: 'none' }}>
             {/* 
                Rotate around the NEEDLE position.
                This keeps the needle fixed visually on the center point.
             */}
            <g transform={`translate(${needlePos.x}, ${needlePos.y}) rotate(${rotationAngle})`}>
                 
                 {/* Hinge Position: (dist/2, -displayHeight) */}
                 
                 {/* Needle Leg */}
                 <line 
                    x1={dist/2} y1={-displayHeight} 
                    x2={0} y2={0} 
                    stroke="#475569" 
                    strokeWidth={strokeW} 
                    strokeLinecap="round" 
                />
                 
                 {/* Pencil Leg */}
                 <line 
                    x1={dist/2} y1={-displayHeight} 
                    x2={dist} y2={0} 
                    stroke="#475569" 
                    strokeWidth={strokeW} 
                    strokeLinecap="round" 
                />
                 
                 {/* Hinge Knob */}
                 <circle 
                    cx={dist/2} cy={-displayHeight} 
                    r={Math.max(2, strokeW * 1.5)} 
                    fill="#334155" 
                    stroke="white" 
                    strokeWidth={1} 
                />
                 
                 {/* Needle Tip */}
                 <circle cx={0} cy={0} r={2} fill="#ef4444" />
                 
                 {/* Pencil Tip / Holder */}
                 <g transform={`translate(${dist}, 0)`}>
                     <g transform="rotate(15)"> {/* Tilt pencil slightly to match leg angle (15 deg base angle) */}
                        <rect x={-strokeW} y={-10} width={strokeW*2} height={10} fill="#f59e0b" />
                        <path d={`M -${strokeW} 0 L ${strokeW} 0 L 0 4 Z`} fill="#3b82f6" /> 
                     </g>
                     {/* Visual feedback when actively drawing */}
                     {isDrawing && <circle cx={0} cy={0} r={4} fill="#3b82f6" opacity={0.3} className="animate-ping" />}
                 </g>
            </g>
        </g>
    );
};

interface RulerOverlayProps {
    start: Point | null;
    cursor: Point;
    end: Point | null;
}

export const RulerOverlay: React.FC<RulerOverlayProps> = ({ start, cursor, end }) => {
    const length = end ? distance(start!, end) + 100 : (start ? distance(start, cursor) + 100 : 300);
    const angle = start ? getAngleDegrees(start, end || cursor) : 0;
    const pos = start || cursor;

    return (
        <g transform={`translate(${pos.x}, ${pos.y}) rotate(${angle})`} style={{ pointerEvents: 'none', opacity: 0.9 }}>
            <rect x={-50} y={0} width={length + 100} height={40} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={2} />
            {!end && (
                <text x={length/2} y={-10} fontSize={10} fill="#64748b" textAnchor="middle">
                    {start ? "Click to Align" : "Click to Place"}
                </text>
            )}
            {end && (
                <text x={length/2} y={-10} fontSize={10} fill="#3b82f6" textAnchor="middle" fontWeight="bold">
                    Drag along edge to draw
                </text>
            )}
            {Array.from({ length: Math.floor((length + 100) / 10) }).map((_, i) => (
                <line key={i} x1={-50 + i * 10} y1={0} x2={-50 + i * 10} y2={i % 5 === 0 ? 15 : 8} stroke="#64748b" strokeWidth={1} />
            ))}
            {Array.from({ length: Math.floor((length + 100) / 50) }).map((_, i) => (
                <text key={`t-${i}`} x={-50 + i * 50 + 2} y={25} fontSize={10} fill="#64748b" fontFamily="monospace">{i}</text>
            ))}
            <rect x={-50} y={0} width={length + 100} height={5} fill="white" fillOpacity={0.3} />
        </g>
    );
};
