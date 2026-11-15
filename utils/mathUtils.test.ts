import { describe, it, expect } from 'vitest';
import { recognizeFreehandShape, solveTriangleASA, sanitizeLoadedShapes } from './mathUtils';
import { ShapeType, Point } from '../types';

const sampleClosedPolygon = (vertices: Point[], perEdge: number): Point[] => {
    const pts: Point[] = [];
    for (let e = 0; e < vertices.length; e++) {
        const a = vertices[e];
        const b = vertices[(e + 1) % vertices.length];
        for (let i = 0; i < perEdge; i++) {
            const t = i / perEdge;
            pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    pts.push({ ...vertices[0] });
    return pts;
};

const sampleClosedCurve = (n: number, at: (theta: number) => Point): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
        pts.push(at((i / n) * Math.PI * 2));
    }
    pts.push({ ...pts[0] });
    return pts;
};

describe('recognizeFreehandShape', () => {
    it('returns null for fewer than 5 points', () => {
        expect(recognizeFreehandShape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }])).toBeNull();
    });

    it('returns null for a tiny scribble smaller than 5px', () => {
        const pts = [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 102, y: 101 }, { x: 101, y: 102 }, { x: 100, y: 101 }, { x: 100, y: 100 }];
        expect(recognizeFreehandShape(pts)).toBeNull();
    });

    it('recognizes an open stroke as a line with the exact endpoints', () => {
        const pts: Point[] = [];
        for (let i = 0; i < 12; i++) {
            const t = i / 11;
            const jitter = i === 0 || i === 11 ? 0 : 3 * Math.sin(i * 2);
            pts.push({ x: 10 + 290 * t, y: 20 + 20 * t + jitter });
        }
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.LINE,
            points: [{ x: 10, y: 20 }, { x: 300, y: 40 }]
        });
    });

    it('recognizes a closed round stroke as a circle with its bounding box', () => {
        const pts = sampleClosedCurve(64, t => ({ x: 200 + 100 * Math.cos(t), y: 200 + 100 * Math.sin(t) }));
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.CIRCLE,
            points: [{ x: 100, y: 100 }, { x: 300, y: 300 }]
        });
    });

    it('still recognizes a hand-drawn circle with wobbly radius', () => {
        const pts = sampleClosedCurve(64, t => {
            const r = 100 + 4 * Math.sin(7 * t);
            return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) };
        });
        expect(recognizeFreehandShape(pts)?.type).toBe(ShapeType.CIRCLE);
    });

    it('recognizes a triangular stroke as a triangle with the 3 corners', () => {
        const pts = sampleClosedPolygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }], 15);
        const result = recognizeFreehandShape(pts);
        expect(result?.type).toBe(ShapeType.TRIANGLE);
        expect(result?.points).toHaveLength(3);
        expect(result?.points[0].x).toBeCloseTo(0);
        expect(result?.points[0].y).toBeCloseTo(0);
        expect(result?.points[1].x).toBeCloseTo(200);
        expect(result?.points[1].y).toBeCloseTo(0);
        expect(result?.points[2].x).toBeCloseTo(0);
        expect(result?.points[2].y).toBeCloseTo(200);
    });

    it('recognizes a rectangular stroke as a rectangle with its bounding box', () => {
        const pts = sampleClosedPolygon([{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 120 }, { x: 0, y: 120 }], 12);
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.RECTANGLE,
            points: [{ x: 0, y: 0 }, { x: 240, y: 120 }]
        });
    });

    it('recognizes an elongated closed blob as an ellipse with its bounding box', () => {
        const pts = sampleClosedCurve(96, t => ({ x: 250 + 200 * Math.cos(t), y: 250 + 80 * Math.sin(t) }));
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.ELLIPSE,
            points: [{ x: 50, y: 170 }, { x: 450, y: 330 }]
        });
    });
});

describe('solveTriangleASA', () => {
    const angleAt = (vertex: Point, a: Point, b: Point): number => {
        const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
        const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
        const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
        return Math.acos(cos) * (180 / Math.PI);
    };

    it('solves an equilateral triangle on the same side as the current third point', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 60, { x: 50, y: 87 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 3);
        expect(result!.y).toBeCloseTo(86.6025, 3);
    });

    it('mirrors the solution when the third point is on the opposite side', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 60, { x: 50, y: -87 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 3);
        expect(result!.y).toBeCloseTo(-86.6025, 3);
    });

    it('solves a 90/45 right triangle', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 90, 45, { x: 0, y: 100 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(0, 3);
        expect(result!.y).toBeCloseTo(100, 3);
    });

    it('solves a 60/30 triangle', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 30, { x: 25, y: 44 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(25, 3);
        expect(result!.y).toBeCloseTo(43.3013, 3);
    });

    it('recovers the third vertex when given the triangle own angles', () => {
        const A = { x: 0, y: 0 }, B = { x: 100, y: 0 }, C = { x: 50, y: 80 };
        const result = solveTriangleASA(A, B, angleAt(A, B, C), angleAt(B, A, C), C);
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 4);
        expect(result!.y).toBeCloseTo(80, 4);
    });

    it('returns null when the two rays are parallel (angles sum to 180)', () => {
        expect(solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 90, 90, { x: 50, y: 50 })).toBeNull();
    });

    it('returns null when the two base vertices coincide', () => {
        expect(solveTriangleASA({ x: 50, y: 50 }, { x: 50, y: 50 }, 60, 60, { x: 50, y: 100 })).toBeNull();
    });
});

describe('sanitizeLoadedShapes', () => {
    it('fills in defaults and coerces string coordinates to numbers', () => {
        const raw = [{ id: 'p1', type: 'POINT', points: [{ x: '10', y: '20', p: 0.7 }] }];
        const result = sanitizeLoadedShapes(raw);
        expect(result).toEqual([{
            id: 'p1', type: 'POINT',
            fill: 'transparent', stroke: '#000000', strokeWidth: 1, strokeType: 'solid', rotation: 0,
            points: [{ x: 10, y: 20, p: 0.7 }]
        }]);
    });

    it('preserves explicitly provided style values', () => {
        const raw = [{
            id: 'r1', type: 'RECTANGLE', points: [{ x: 0, y: 0 }],
            fill: 'red', stroke: 'blue', strokeWidth: 3, strokeType: 'dashed', rotation: 45
        }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].fill).toBe('red');
        expect(result[0].stroke).toBe('blue');
        expect(result[0].strokeWidth).toBe(3);
        expect(result[0].strokeType).toBe('dashed');
        expect(result[0].rotation).toBe(45);
    });

    it('keeps extra fields such as text and formula params', () => {
        const raw = [{ id: 't1', type: 'TEXT', points: [{ x: 1, y: 2 }], text: 'hi', fontSize: 18 }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].text).toBe('hi');
        expect(result[0].fontSize).toBe(18);
    });

    it('returns an empty array unchanged', () => {
        expect(sanitizeLoadedShapes([])).toEqual([]);
    });

    it('coerces non-numeric coordinates to 0 instead of NaN', () => {
        const invalidValues = ['abc', undefined, null, NaN, Infinity, -Infinity, {}];
        for (const v of invalidValues) {
            const raw = [{ id: 'p1', type: 'POINT', points: [{ x: v, y: v }] }];
            const result = sanitizeLoadedShapes(raw);
            expect(result[0].points[0]).toEqual({ x: 0, y: 0 });
        }
    });

    it('keeps valid points and pressure when a sibling point is invalid', () => {
        const raw = [{
            id: 'l1', type: 'LINE',
            points: [{ x: 10, y: 20, p: 0.5 }, { x: 'oops', y: 30, p: 0.9 }]
        }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].points).toEqual([
            { x: 10, y: 20, p: 0.5 },
            { x: 0, y: 30, p: 0.9 }
        ]);
    });
});