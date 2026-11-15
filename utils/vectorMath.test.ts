import { describe, it, expect } from 'vitest';
import { normalize, getProjectionParameter, reflectPointAcrossLine } from './vectorMath';

describe('normalize', () => {
    it('returns the zero vector for zero length', () => {
        expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    });
});

describe('getProjectionParameter', () => {
    it('returns 0 for a degenerate segment', () => {
        expect(getProjectionParameter({ x: 5, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
    });
});

describe('reflectPointAcrossLine', () => {
    it('reflects across the x-axis', () => {
        expect(reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 3, y: -4 });
    });

    it('reflects across the y-axis', () => {
        expect(reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: -3, y: 4 });
    });

    it('reflects across the diagonal y = x', () => {
        const r = reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 10 });
        expect(r.x).toBeCloseTo(4);
        expect(r.y).toBeCloseTo(3);
    });

    it('reflects across an offset vertical line', () => {
        const r = reflectPointAcrossLine({ x: 2, y: 3 }, { x: 5, y: 0 }, { x: 5, y: 10 });
        expect(r.x).toBeCloseTo(8);
        expect(r.y).toBeCloseTo(3);
    });

    it('leaves a point on the line unchanged', () => {
        const r = reflectPointAcrossLine({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 });
        expect(r.x).toBeCloseTo(5);
        expect(r.y).toBeCloseTo(5);
    });

    it('returns the point unchanged for a degenerate line', () => {
        const p = { x: 3, y: 4 };
        expect(reflectPointAcrossLine(p, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual(p);
    });
});