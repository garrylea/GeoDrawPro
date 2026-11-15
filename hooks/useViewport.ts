import { useState, useRef, useEffect, useLayoutEffect, Dispatch, SetStateAction } from 'react';
import { Shape, ShapeType } from '../types';
import { getPixelsPerUnit, generateQuadraticPath } from '../utils/mathUtils';

interface UseViewportDeps {
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    ticks: number;
}

// LOGICAL_CANVAS_WIDTH is fixed for coordinate stability
export const LOGICAL_CANVAS_WIDTH = 1600;

/**
 * Viewport state: zoom, canvas/page geometry and derived coordinate values.
 * Moved verbatim from Editor.tsx (S4); `axisConfig.ticks` became the `ticks`
 * input (identical value) — the only dependency-array change.
 */
export const useViewport = ({ setShapes, ticks }: UseViewportDeps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const zoomFocusPointRef = useRef<{x: number, y: number} | null>(null);

    // PAGE_HEIGHT is now a state to allow it to match imported PDF proportions
    const [pageHeight, setPageHeight] = useState(1400);
    const [pageCount, setPageCount] = useState(1);
    const [canvasSize, setCanvasSize] = useState({ width: LOGICAL_CANVAS_WIDTH, height: window.innerHeight });
    const [zoom, setZoom] = useState(1);

    const originY = pageHeight / 2;
    const svgHeight = Math.max(canvasSize.height, pageCount * pageHeight);
    const pixelsPerUnit = getPixelsPerUnit(canvasSize.width, canvasSize.height, ticks);

    useLayoutEffect(() => {
        if (zoomFocusPointRef.current && containerRef.current) {
            const { x, y } = zoomFocusPointRef.current;
            const { clientWidth, clientHeight } = containerRef.current;
            const newScrollLeft = x * zoom - clientWidth / 2;
            const newScrollTop = y * zoom - clientHeight / 2;
            containerRef.current.scrollLeft = newScrollLeft;
            containerRef.current.scrollTop = newScrollTop;
            zoomFocusPointRef.current = null;
        }
    }, [zoom]);

    const handleZoomChange = (newZoom: number) => {
        if (Math.abs(newZoom - zoom) < 0.001) return;
        const container = containerRef.current;
        if (container) {
            const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
            // Calculate center relative to unscaled content
            const centerX = (scrollLeft + clientWidth / 2) / zoom;
            const centerY = (scrollTop + clientHeight / 2) / zoom;
            zoomFocusPointRef.current = { x: centerX, y: centerY };
        }
        setZoom(newZoom);
    };

    useEffect(() => {
        const updateCanvasHeight = () => {
            setCanvasSize(prev => ({ ...prev, height: window.innerHeight }));
        };
        updateCanvasHeight();
        window.addEventListener('resize', updateCanvasHeight);
        return () => window.removeEventListener('resize', updateCanvasHeight);
    }, []);

    useEffect(() => {
        setShapes(prev => prev.map(s => {
            if (s.type === ShapeType.FUNCTION_GRAPH && s.formulaParams) {
                const fType = s.functionType || 'quadratic';
                const newPath = generateQuadraticPath(s.formulaParams, s.functionForm || 'standard', canvasSize.width, svgHeight, pixelsPerUnit, fType, originY);
                return { ...s, pathData: newPath };
            }
            return s;
        }));
    }, [canvasSize.width, svgHeight, ticks, pixelsPerUnit, originY]);

    return { zoom, handleZoomChange, canvasSize, pageHeight, setPageHeight, pageCount, setPageCount, containerRef, originY, svgHeight, pixelsPerUnit };
};