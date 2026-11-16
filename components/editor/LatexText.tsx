import React, { useMemo } from 'react';
import { useKatex } from '../../hooks/useKatex';

interface LatexTextProps {
    /** Original text: shown verbatim while the KaTeX chunk loads and on render errors. */
    text: string;
    /** Text with surrounding '$' markers removed. */
    formula: string;
    x: number;
    y: number;
    stroke: string;
    fontSize?: number;
}

/**
 * Renders a LaTeX text shape. Mounted only for LaTeX shapes, so plain shapes
 * never subscribe to (or trigger) the KaTeX chunk load.
 *
 * Extra props may be injected by ShapeRenderer's selection halo via
 * React.cloneElement; they are intentionally ignored, matching the previous
 * behaviour where the <foreignObject> halo had no visual effect.
 */
export const LatexText: React.FC<LatexTextProps> = ({ text, formula, x, y, stroke, fontSize }) => {
    const katex = useKatex();
    const fs = fontSize || 16;

    const html = useMemo(() => {
        if (!katex) return null;
        try {
            return katex.renderToString(formula, {
                throwOnError: false,
                output: 'html',
                displayMode: false,
            });
        } catch {
            return null;
        }
    }, [katex, formula]);

    if (!html) {
        return (
            <text
                x={x}
                y={y}
                fill={stroke}
                fontSize={fs}
                fontFamily="sans-serif"
                dominantBaseline="hanging"
                style={{ userSelect: 'none' }}
            >
                {text}
            </text>
        );
    }

    // Generous width for formulas, height scales with content
    const estWidth = Math.max(100, text.length * fs * 1.2);
    const estHeight = fs * 4;

    return (
        <foreignObject
            x={x}
            y={y - fs * 0.9}
            width={estWidth}
            height={estHeight}
            style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
            <div
                className="katex-render-container"
                style={{
                    color: stroke,
                    userSelect: 'none',
                    display: 'inline-block',
                    minWidth: '100px',
                    minHeight: '50px',
                }}
            >
                <div className="katex">
                    <span className="katex-html" dangerouslySetInnerHTML={{ __html: html }} />
                </div>
            </div>
        </foreignObject>
    );
};
LatexText.displayName = 'LatexText';
