import { describe, it, expect } from 'vitest';
import { reflectShapesAcrossLine } from './mirror';
import { Shape, ShapeType } from '../types';

const make = (id: string, overrides: Partial<Shape> = {}): Shape => ({
    id, type: ShapeType.RECTANGLE, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
    fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0, ...overrides
});

const verticalLine = () => make('axis', { type: ShapeType.LINE, points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] });

const idGen = () => {
    let n = 0;
    return () => `n${++n}`;
};

describe('reflectShapesAcrossLine (rigid shapes)', () => {
    it('translates a rectangle by the reflected center delta and mirrors rotation', () => {
        const rect = make('r1');
        const [result] = reflectShapesAcrossLine([rect], verticalLine(), idGen());
        expect(result.points).toEqual([{ x: 150, y: 0, p: undefined }, { x: 200, y: 50, p: undefined }]);
        expect(result.rotation).toBe(180);
        expect(result.id).toBe('n1');
    });

    it('normalizes negative rotation into 0-360', () => {
        const rect = make('r1', { rotation: 30 });
        const horizontal = make('axis', { type: ShapeType.LINE, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
        const [result] = reflectShapesAcrossLine([rect], horizontal, idGen());
        expect(result.rotation).toBe(330);
        expect(result.points[0].y).toBe(-50);
        expect(result.points[1].y).toBe(0);
    });

    it('preserves pressure values on rigid points', () => {
        const rect = make('r1', { points: [{ x: 0, y: 0, p: 0.5 }, { x: 50, y: 50, p: 0.8 }] });
        const [result] = reflectShapesAcrossLine([rect], verticalLine(), idGen());
        expect(result.points[0].p).toBe(0.5);
        expect(result.points[1].p).toBe(0.8);
    });
});

describe('reflectShapesAcrossLine (point-wise shapes)', () => {
    it('reflects each vertex of a triangle and clears rotation', () => {
        const tri = make('t1', { type: ShapeType.TRIANGLE, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }] });
        const [result] = reflectShapesAcrossLine([tri], verticalLine(), idGen());
        expect(result.points).toEqual([{ x: 200, y: 0 }, { x: 150, y: 0 }, { x: 200, y: 50 }]);
        expect(result.rotation).toBe(0);
    });

    it('bakes rotation into the points before reflecting', () => {
        const tri = make('t1', {
            type: ShapeType.TRIANGLE,
            points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }],
            rotation: 90
        });
        const [result] = reflectShapesAcrossLine([tri], verticalLine(), idGen());
        expect(result.points[0].x).toBeCloseTo(133.3333, 3);
        expect(result.points[0].y).toBeCloseTo(0, 5);
        expect(result.points[1].x).toBeCloseTo(133.3333, 3);
        expect(result.points[1].y).toBeCloseTo(100, 5);
        expect(result.points[2].x).toBeCloseTo(233.3333, 3);
        expect(result.points[2].y).toBeCloseTo(0, 5);
        expect(result.rotation).toBe(0);
    });

    it('uses the first and last points of a multi-point line as the axis', () => {
        const axis = make('axis', { type: ShapeType.LINE, points: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 200 }] });
        const point = make('p1', { type: ShapeType.POINT, points: [{ x: 0, y: 50 }] });
        const [result] = reflectShapesAcrossLine([point], axis, idGen());
        expect(result.points).toEqual([{ x: 200, y: 50 }]);
    });
});

describe('reflectShapesAcrossLine (identity)', () => {
    it('assigns fresh ids and leaves the originals untouched', () => {
        const rect = make('r1');
        const tri = make('t1', { type: ShapeType.TRIANGLE, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }] });
        const results = reflectShapesAcrossLine([rect, tri], verticalLine(), idGen());
        expect(results.map(s => s.id)).toEqual(['n1', 'n2']);
        expect(rect.id).toBe('r1');
        expect(rect.points[0]).toEqual({ x: 0, y: 0 });
        expect(tri.points[0]).toEqual({ x: 0, y: 0 });
    });
});