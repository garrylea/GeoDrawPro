import { describe, it, expect } from 'vitest';
import {
    createToolShape, createTextShape, createRulerShape, createProtractorShape,
    createFunctionGraphShape, createArcShape, createImageShape, clickDefaultPoints, ShapeStyle
} from './shapeFactory';
import { ShapeType, ToolType } from '../types';

const style: ShapeStyle = { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' };
const pos = { x: 100, y: 100 };

describe('createToolShape', () => {
    it('creates a two-point shape by default', () => {
        const s = createToolShape(ToolType.RECTANGLE, pos, style, { id: 'r1' });
        expect(s).toMatchObject({ id: 'r1', type: ShapeType.RECTANGLE, points: [pos, pos], rotation: 0, ...style });
    });

    it('creates three coincident points for a triangle', () => {
        const s = createToolShape(ToolType.TRIANGLE, pos, style, { id: 't1' });
        expect(s.points).toEqual([pos, pos, pos]);
    });

    it('creates a single point for POINT and FREEHAND', () => {
        expect(createToolShape(ToolType.POINT, pos, style, { id: 'p1' }).points).toEqual([pos]);
        expect(createToolShape(ToolType.FREEHAND, pos, style, { id: 'f1' }).points).toEqual([pos]);
    });

    it('passes labels and usePressure through', () => {
        const s = createToolShape(ToolType.FREEHAND, pos, style, { id: 'f1', labels: ['A'], usePressure: true });
        expect(s.labels).toEqual(['A']);
        expect(s.usePressure).toBe(true);
    });
});

describe('createTextShape', () => {
    it('creates an empty text shape with fontSize 16', () => {
        const s = createTextShape('t1', pos, style);
        expect(s).toMatchObject({ type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, rotation: 0 });
        expect(s.stroke).toBe(style.stroke);
    });
});

describe('createRulerShape', () => {
    it('centers a 400x40 ruler with fixed styling', () => {
        const s = createRulerShape('ruler', pos);
        expect(s.points).toEqual([{ x: -100, y: 80 }, { x: 300, y: 120 }]);
        expect(s).toMatchObject({ fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1 });
    });
});

describe('createProtractorShape', () => {
    it('spans 300px wide and 150px tall from the click point', () => {
        const s = createProtractorShape('prot', pos, '#ff0000');
        expect(s.points).toEqual([{ x: -50, y: -50 }, { x: 250, y: 100 }]);
        expect(s.stroke).toBe('#ff0000');
        expect(s.strokeWidth).toBe(1);
    });
});

describe('createFunctionGraphShape', () => {
    it('creates a standard-form graph with no points', () => {
        const params = { a: 1, b: 0, c: 0 };
        const s = createFunctionGraphShape('fn', params, 'quadratic', 'M0 0', style);
        expect(s).toMatchObject({
            type: ShapeType.FUNCTION_GRAPH, points: [], formulaParams: params,
            functionForm: 'standard', functionType: 'quadratic', pathData: 'M0 0', fill: 'none',
        });
        expect(s.stroke).toBe(style.stroke);
    });
});

describe('createArcShape', () => {
    it('samples 41 points along the arc and marks it as construction', () => {
        const s = createArcShape('arc', { x: 0, y: 0 }, 10, 0, 90, 'M10 0', style);
        expect(s.type).toBe(ShapeType.PATH);
        expect(s.isConstruction).toBe(true);
        expect(s.points).toHaveLength(41);
        expect(s.points[0].x).toBeCloseTo(10);
        expect(s.points[0].y).toBeCloseTo(0);
        expect(s.points[40].x).toBeCloseTo(0);
        expect(s.points[40].y).toBeCloseTo(10);
    });
});

describe('createImageShape', () => {
    it('creates a borderless image shape', () => {
        const s = createImageShape('img', [{ x: 0, y: 0 }, { x: 50, y: 50 }], 'data:image/png;base64,x');
        expect(s).toMatchObject({ type: ShapeType.IMAGE, imageUrl: 'data:image/png;base64,x', fill: 'none', stroke: 'transparent', strokeWidth: 0 });
        expect(s.isBackground).toBeUndefined();
    });

    it('applies extra overrides such as isBackground', () => {
        const s = createImageShape('img', [{ x: 0, y: 0 }, { x: 50, y: 50 }], 'url', { isBackground: true });
        expect(s.isBackground).toBe(true);
    });
});

describe('clickDefaultPoints', () => {
    const ppu = 40;
    it('gives a rectangle 2x1 units centered on the click', () => {
        expect(clickDefaultPoints(ToolType.RECTANGLE, pos, ppu)).toEqual([
            { x: 60, y: 80 }, { x: 140, y: 120 }
        ]);
    });

    it('gives a square 2x2 units', () => {
        expect(clickDefaultPoints(ToolType.SQUARE, pos, ppu)).toEqual([
            { x: 60, y: 60 }, { x: 140, y: 140 }
        ]);
    });

    it('gives a triangle of size 2 units', () => {
        expect(clickDefaultPoints(ToolType.TRIANGLE, pos, ppu)).toEqual([
            { x: 100, y: 60 }, { x: 140, y: 140 }, { x: 60, y: 140 }
        ]);
    });

    it('gives a circle radius 50px and an ellipse 75x50px', () => {
        expect(clickDefaultPoints(ToolType.CIRCLE, pos, ppu)).toEqual([
            { x: 50, y: 50 }, { x: 150, y: 150 }
        ]);
        expect(clickDefaultPoints(ToolType.ELLIPSE, pos, ppu)).toEqual([
            { x: 25, y: 50 }, { x: 175, y: 150 }
        ]);
    });

    it('returns null for tools without a click default', () => {
        expect(clickDefaultPoints(ToolType.LINE, pos, ppu)).toBeNull();
        expect(clickDefaultPoints(ToolType.POINT, pos, ppu)).toBeNull();
    });
});