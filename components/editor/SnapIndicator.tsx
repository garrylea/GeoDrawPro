import React from 'react';
import { Point } from '../../types';

interface SnapIndicatorProps {
    indicator: Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' };
}

/** Snap marker SVG; JSX moved verbatim from Editor.tsx (S8), snapIndicator→indicator. */
export const SnapIndicator: React.FC<SnapIndicatorProps> = ({ indicator }) => {
    return (
        <g transform={`translate(${indicator.x}, ${indicator.y})`}>
            {indicator.type === 'midpoint' ? (
                <path d="M -6 4 L 0 -7 L 6 4 Z" fill="none" stroke="#fbbf24" strokeWidth={2} />
            ) : indicator.type === 'center' ? (
                <g>
                    <circle cx={0} cy={0} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />
                    <line x1={-8} y1={0} x2={8} y2={0} stroke="#fbbf24" strokeWidth={1} />
                    <line x1={0} y1={-8} x2={0} y2={8} stroke="#fbbf24" strokeWidth={1} />
                </g>
            ) : (
                <circle cx={0} cy={0} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />
            )}
        </g>
    );
};