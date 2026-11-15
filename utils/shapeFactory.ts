import { Shape, ShapeType, ToolType, Point } from '../types';

export interface ShapeStyle {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeType?: 'solid' | 'dashed' | 'dotted';
}

export const createToolShape = (
    tool: ToolType,
    pos: Point,
    style: ShapeStyle,
    opts: { id: string; labels?: string[]; usePressure?: boolean }
): Shape => {
    let points: Point[] = [pos, pos];
    if (tool === ToolType.TRIANGLE) points = [pos, pos, pos];
    if (tool === ToolType.POINT || tool === ToolType.FREEHAND) points = [pos];
    return {
        id: opts.id,
        type: tool as unknown as ShapeType,
        points,
        labels: opts.labels,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeType: style.strokeType,
        rotation: 0,
        usePressure: opts.usePressure,
    };
};

export const createTextShape = (id: string, pos: Point, style: ShapeStyle): Shape => ({
    id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16,
    fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeType: style.strokeType, rotation: 0,
});

export const createRulerShape = (id: string, center: Point): Shape => ({
    id, type: ShapeType.RULER,
    points: [{ x: center.x - 200, y: center.y - 20 }, { x: center.x + 200, y: center.y + 20 }],
    fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, rotation: 0,
});

export const createProtractorShape = (id: string, pos: Point, stroke: string): Shape => ({
    id, type: ShapeType.PROTRACTOR,
    points: [{ x: pos.x - 150, y: pos.y - 150 }, { x: pos.x + 150, y: pos.y }],
    fill: 'transparent', stroke, strokeWidth: 1, rotation: 0,
});

export const createFunctionGraphShape = (
    id: string,
    formulaParams: NonNullable<Shape['formulaParams']>,
    functionType: 'quadratic' | 'linear',
    pathData: string,
    style: ShapeStyle
): Shape => ({
    id, type: ShapeType.FUNCTION_GRAPH, points: [], formulaParams,
    functionForm: 'standard', functionType, pathData,
    fill: 'none', stroke: style.stroke, strokeWidth: style.strokeWidth, rotation: 0,
});

export const createArcShape = (
    id: string,
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
    pathData: string,
    style: ShapeStyle
): Shape => {
    const arcPoints: Point[] = [];
    const stepCount = 40;
    const step = (endAngle - startAngle) / stepCount;
    for (let i = 0; i <= stepCount; i++) {
        const rad = ((startAngle + step * i) * Math.PI) / 180;
        arcPoints.push({ x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) });
    }
    return {
        id, type: ShapeType.PATH, points: arcPoints, pathData,
        fill: 'none', stroke: style.stroke, strokeWidth: style.strokeWidth, rotation: 0, isConstruction: true,
    };
};

export const createImageShape = (id: string, points: Point[], imageUrl: string, extra?: Partial<Shape>): Shape => ({
    id, type: ShapeType.IMAGE, points, imageUrl,
    fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0,
    ...extra,
});

export const clickDefaultPoints = (tool: ToolType, pos: Point, pixelsPerUnit: number): Point[] | null => {
    const cx = pos.x, cy = pos.y;
    if (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE) {
        const wPx = 2 * pixelsPerUnit;
        const hPx = (tool === ToolType.SQUARE ? 2 : 1) * pixelsPerUnit;
        return [{ x: cx - wPx / 2, y: cy - hPx / 2 }, { x: cx + wPx / 2, y: cy + hPx / 2 }];
    }
    if (tool === ToolType.TRIANGLE) {
        const sizePx = 2 * pixelsPerUnit;
        return [{ x: cx, y: cy - sizePx / 2 }, { x: cx + sizePx / 2, y: cy + sizePx / 2 }, { x: cx - sizePx / 2, y: cy + sizePx / 2 }];
    }
    if (tool === ToolType.CIRCLE || tool === ToolType.ELLIPSE) {
        const wHalf = tool === ToolType.CIRCLE ? 50 : 75;
        const hHalf = 50;
        return [{ x: cx - wHalf, y: cy - hHalf }, { x: cx + wHalf, y: cy + hHalf }];
    }
    return null;
};