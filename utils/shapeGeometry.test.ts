import { describe, it, expect } from 'vitest';
import { isPointInShape, getPolygonAngles, getClosestPointOnShape, getShapeCenter } from './shapeGeometry';
import { Shape, ShapeType, Point } from '../types';

const createShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: 'black', strokeWidth: 2, rotation: 0, ...overrides
});

describe('isPointInShape', () => {
    it('hits a filled ellipse interior and misses far outside', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }], { fill: 'blue' });
        expect(isPointInShape({ x: 200, y: 150 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 400, y: 150 }, ellipse)).toBe(false);
    });

    it('hits a transparent ellipse by its interior and edge', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }]);
        expect(isPointInShape({ x: 200, y: 120 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 300, y: 150 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 320, y: 150 }, ellipse)).toBe(false);
    });

    it('accounts for ellipse rotation', () => {
        const points = [{ x: 100, y: 100 }, { x: 300, y: 200 }];
        const rotated = createShape('e1', ShapeType.ELLIPSE, points, { fill: 'blue', rotation: 90 });
        const plain = createShape('e2', ShapeType.ELLIPSE, points, { fill: 'blue' });
        // (200,240) is inside the 90°-rotated ellipse but outside the unrotated one.
        expect(isPointInShape({ x: 200, y: 240 }, rotated)).toBe(true);
        expect(isPointInShape({ x: 200, y: 240 }, plain)).toBe(false);
    });

    it('rejects a degenerate ellipse with zero width', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 100, y: 200 }], { fill: 'blue' });
        expect(isPointInShape({ x: 100, y: 150 }, ellipse)).toBe(false);
    });

    it('selects a polygon by its interior regardless of fill', () => {
        const polygon = createShape('p1', ShapeType.POLYGON, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
        expect(isPointInShape({ x: 50, y: 50 }, polygon)).toBe(true);
        expect(isPointInShape({ x: 50, y: 2 }, polygon)).toBe(true);
        expect(isPointInShape({ x: 50, y: 50 }, { ...polygon, fill: 'blue' })).toBe(true);
    });

    it('selects a triangle by its interior regardless of fill', () => {
        const triangle = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
        expect(isPointInShape({ x: 20, y: 20 }, triangle)).toBe(true);
        expect(isPointInShape({ x: 2, y: 20 }, triangle)).toBe(true);
        expect(isPointInShape({ x: 20, y: 20 }, { ...triangle, fill: 'blue' })).toBe(true);
    });

    it('hit-tests a triangle against its rotated corners', () => {
        const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
        const rotated = createShape('t1', ShapeType.TRIANGLE, points, { fill: 'blue', rotation: 90 });
        const plain = createShape('t2', ShapeType.TRIANGLE, points, { fill: 'blue' });
        expect(isPointInShape({ x: 60, y: 80 }, rotated)).toBe(true);
        expect(isPointInShape({ x: 60, y: 80 }, plain)).toBe(false);
    });

    it('hits a path near its segments and respects the bounding box', () => {
        const path = createShape('pa1', ShapeType.PATH, [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]);
        expect(isPointInShape({ x: 50, y: 45 }, path)).toBe(true);
        expect(isPointInShape({ x: 50, y: 200 }, path)).toBe(false);
    });

    it('rejects paths with fewer than two points', () => {
        expect(isPointInShape({ x: 0, y: 0 }, createShape('pa1', ShapeType.PATH, [{ x: 0, y: 0 }]))).toBe(false);
        expect(isPointInShape({ x: 0, y: 0 }, createShape('pa2', ShapeType.PATH, []))).toBe(false);
    });

    it('hits a freehand stroke near its segments', () => {
        const freehand = createShape('f1', ShapeType.FREEHAND, [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]);
        expect(isPointInShape({ x: 50, y: 45 }, freehand)).toBe(true);
        expect(isPointInShape({ x: 50, y: 200 }, freehand)).toBe(false);
    });

    it('hit-tests a rotated line against its rotated endpoints', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { rotation: 90 });
        // Rotated around (50,0): the line now runs vertically through x=50.
        expect(isPointInShape({ x: 52, y: 0 }, line)).toBe(true);
        expect(isPointInShape({ x: 100, y: 0 }, line)).toBe(false);
    });

    it('rejects a marker with no points', () => {
        expect(isPointInShape({ x: 0, y: 0 }, createShape('m1', ShapeType.MARKER, []))).toBe(false);
    });

    it('rejects function graphs without params or with invalid ppu', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }]);
        expect(isPointInShape({ x: 400, y: 300 }, graph, 800, 600, 40)).toBe(false);
        const withParams = { ...graph, functionType: 'linear' as const, formulaParams: { k: 1, b: 0 } };
        expect(isPointInShape({ x: 400, y: 300 }, withParams, 800, 600, 0)).toBe(false);
    });

    it('rejects a function graph whose evaluation is not finite', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: Infinity, b: 0 }
        });
        expect(isPointInShape({ x: 440, y: 160 }, graph, 800, 600, 40, 200)).toBe(false);
    });

    it('hits LaTeX text using the taller latex bounds', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: '$x^2$', fontSize: 20 });
        // Latex box: y 82..132, x 100..200 (plus the 18px edge tolerance)
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
        expect(isPointInShape({ x: 150, y: 160 }, text)).toBe(false);
    });

    it('treats text with backslash commands as LaTeX', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: '\\frac{1}{2}', fontSize: 20 });
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
    });

    it('hits plain text inside its estimated box', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: 'Hello', fontSize: 20 });
        // Plain box: x 100..180, y 98..122 (plus the 18px edge tolerance)
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
        expect(isPointInShape({ x: 210, y: 100 }, text)).toBe(false);
    });
});

describe('getPolygonAngles', () => {
    it('returns four right angles for a square', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]))
            .toEqual([90, 90, 90, 90]);
    });

    it('returns 90/45/45 for a right triangle', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toEqual([90, 45, 45]);
    });

    it('returns 60° for an equilateral triangle', () => {
        const angles = getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 86.6025 }]);
        angles.forEach(a => expect(a).toBe(60));
    });

    it('returns an empty array for fewer than three points', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
    });

    it('reports 0 for a vertex duplicated with its neighbor', () => {
        const angles = getPolygonAngles([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(angles[1]).toBe(0);
    });
});

describe('getClosestPointOnShape', () => {
    it('handles empty and single-point shapes', () => {
        const p = { x: 9, y: 9 };
        expect(getClosestPointOnShape(p, createShape('s1', ShapeType.POLYGON, []))).toEqual(p);
        expect(getClosestPointOnShape(p, createShape('s2', ShapeType.POINT, [{ x: 1, y: 2 }]))).toEqual({ x: 1, y: 2 });
    });

    it('includes the closing edge of a polygon', () => {
        const square = createShape('s1', ShapeType.POLYGON, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
        expect(getClosestPointOnShape({ x: -5, y: 50 }, square)).toEqual({ x: 0, y: 50 });
    });
});

describe('getShapeCenter', () => {
    it('estimates a text center from length and font size', () => {
        expect(getShapeCenter([{ x: 100, y: 100 }], ShapeType.TEXT, 20, 'Hello')).toEqual({ x: 140, y: 110 });
    });
});