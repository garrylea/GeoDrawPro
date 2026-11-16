import React from 'react';

interface PageBreaksProps {
    pageCount: number;
    pageHeight: number;
    width: number;
}

/** Dashed page-boundary lines; JSX moved verbatim from Editor.tsx (S8), canvasSize.width→width, guard moved inside. */
export const PageBreaks: React.FC<PageBreaksProps> = React.memo(({ pageCount, pageHeight, width }) => {
    if (pageCount <= 1) return null;
    return (
        <>{Array.from({ length: pageCount - 1 }).map((_, i) => ( <g key={`page-break-${i}`} opacity="0.4"> <line x1={0} y1={(i + 1) * pageHeight} x2={width} y2={(i + 1) * pageHeight} stroke="#94a3b8" strokeWidth={1} strokeDasharray="8,8" /> <text x={10} y={(i + 1) * pageHeight - 5} fontSize={10} fill="#94a3b8" fontFamily="sans-serif">Page {i + 1} End</text> </g> ))}</>
    );
});