
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
    // If no center set, compass follows cursor completely (waiting to place needle)
    if (!center) {
        return (
            <g transform={`translate(${cursor.x}, ${cursor.y}) rotate(-15)`} style={{ pointerEvents: 'none', opacity: 0.5 }}>
                {/* Needle Leg */}
                <line x1={0} y1={0} x2={-15} y2={100} stroke="#64748b" strokeWidth={4} strokeLinecap="round" />
                <circle cx={-15} cy={100} r={2} fill="black" />
                {/* Pencil Leg */}
                <line x1={0} y1={0} x2={15} y2={100} stroke="#64748b" strokeWidth={4} strokeLinecap="round" />
                <path d="M 15 100 L 15 110 L 17 115 L 13 115 L 15 110" fill="#f59e0b" />
                {/* Hinge */}
                <circle cx={0} cy={0} r={8} fill="#475569" stroke="white" strokeWidth={2} />
            </g>
        );
    }

    // Compass Geometry
    const needlePos = center;
    const target = radiusPoint || cursor; // Point pencil is aiming at
    
    // Dist is the spread
    const dist = distance(needlePos, target);
    
    // Angle of the tool body relative to the needle-pencil vector
    // We want the needle leg to stay at (0,0) and the pencil leg to reach (dist, 0) in local space
    // Then we rotate the whole group to align with (target - needle).
    const rotationAngle = getAngleDegrees(needlePos, cursor);

    // Calculate height of the hinge based on leg length (standard pythagoras for isosceles triangle)
    const legLen = 150;
    const halfDist = dist / 2;
    // Ensure triangle inequality
    const height = Math.sqrt(Math.max(100, legLen*legLen - halfDist*halfDist));
    
    return (
        <g style={{ pointerEvents: 'none', transition: 'all 0.05s linear' }}>
            {/* Rotate the whole compass around the needle position */}
            <g transform={`translate(${needlePos.x}, ${needlePos.y}) rotate(${rotationAngle})`}>
                 {/* Local Space: Needle is effectively at (0,0) but we want to visualize the spread. 
                     The rotation aligns the X-axis with the Needle->Cursor vector. 
                     So the pencil target is at (dist, 0) locally.
                 */}
                 
                 {/* Hinge Position: Midway X, Up Y */}
                 {/* In local rotated space, the midpoint is (dist/2, 0). Up is negative Y. */}
                 
                 {/* Needle Leg: From (0,0) to Hinge (dist/2, -height) */}
                 <line x1={0} y1={0} x2={dist/2} y2={-height} stroke="#64748b" strokeWidth={4} strokeLinecap="round" />
                 
                 {/* Pencil Leg: From Hinge to Cursor/RadiusPoint (dist, 0) */}
                 <line x1={dist} y1={0} x2={dist/2} y2={-height} stroke="#64748b" strokeWidth={4} strokeLinecap="round" />
                 
                 {/* Hinge Knob */}
                 <circle cx={dist/2} cy={-height} r={10} fill="#475569" stroke="white" strokeWidth={2} />
                 
                 {/* Needle Tip visual */}
                 <circle cx={0} cy={0} r={3} fill="#ef4444" />
                 
                 {/* Pencil Tip visual */}
                 <g transform={`translate(${dist}, 0)`}>
                     <path d="M -2 -10 L 2 -10 L 0 0 Z" fill="#3b82f6" /> 
                     {isDrawing && <circle cx={0} cy={0} r={4} fill="#3b82f6" opacity={0.5} className="animate-ping" />}
                 </g>
            </g>
        </g>
    );
};

interface RulerOverlayProps {
    start: Point | null;
    cursor: Point;
    end: Point | null; // If set, ruler is locked
}

export const RulerOverlay: React.FC<RulerOverlayProps> = ({ start, cursor, end }) => {
    // Width of ruler in pixels
    const length = end ? distance(start!, end) + 100 : (start ? distance(start, cursor) + 100 : 300);
    const angle = start ? getAngleDegrees(start, end || cursor) : 0;
    const pos = start || cursor;

    return (
        <g transform={`translate(${pos.x}, ${pos.y}) rotate(${angle})`} style={{ pointerEvents: 'none', opacity: 0.9 }}>
            {/* Ruler Body (Offset so edge aligns with points) */}
            <rect x={-50} y={0} width={length + 100} height={40} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} rx={2} />
            
            {/* Usage Hint */}
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
            
            {/* Ticks */}
            {Array.from({ length: Math.floor((length + 100) / 10) }).map((_, i) => (
                <line 
                    key={i} 
                    x1={-50 + i * 10} y1={0} 
                    x2={-50 + i * 10} y2={i % 5 === 0 ? 15 : 8} 
                    stroke="#64748b" 
                    strokeWidth={1} 
                />
            ))}
            
            {/* Numbers */}
            {Array.from({ length: Math.floor((length + 100) / 50) }).map((_, i) => (
                <text 
                    key={`t-${i}`} 
                    x={-50 + i * 50 + 2} 
                    y={25} 
                    fontSize={10} 
                    fill="#64748b" 
                    fontFamily="monospace"
                >
                    {i}
                </text>
            ))}
            
            {/* Wood Texture hint or shiny reflection */}
            <rect x={-50} y={0} width={length + 100} height={5} fill="white" fillOpacity={0.3} />
        </g>
    );
};
