import { describe, it, expect } from 'vitest';
import { evaluateQuadratic, generateQuadraticPath, standardToVertex, vertexToStandard } from './quadraticFunction';

describe('standardToVertex / vertexToStandard', () => {
    it('converts standard form to vertex form', () => {
        expect(standardToVertex(1, -4, 3)).toEqual({ h: 2, k: -1 });
        expect(standardToVertex(2, 8, 5)).toEqual({ h: -2, k: -3 });
    });

    it('handles the degenerate a = 0 case', () => {
        expect(standardToVertex(0, 5, 7)).toEqual({ h: 0, k: 7 });
    });

    it('converts vertex form to standard form', () => {
        expect(vertexToStandard(1, 2, -1)).toEqual({ b: -4, c: 3 });
    });

    it('round-trips standard -> vertex -> standard', () => {
        const { h, k } = standardToVertex(2, 8, 5);
        const back = vertexToStandard(2, h, k);
        expect(back.b).toBeCloseTo(8);
        expect(back.c).toBeCloseTo(5);
    });

    it('round-trips vertex -> standard -> vertex', () => {
        const { b, c } = vertexToStandard(3, -1, 4);
        const back = standardToVertex(3, b, c);
        expect(back.h).toBeCloseTo(-1);
        expect(back.k).toBeCloseTo(4);
    });
});

describe('evaluateQuadratic', () => {
    it('evaluates standard form', () => {
        expect(evaluateQuadratic(5, { a: 2, b: 3, c: 4 })).toBe(69);
    });

    it('defaults missing coefficients to a=1, b=0, c=0', () => {
        expect(evaluateQuadratic(3, {})).toBe(9);
    });

    it('evaluates vertex form', () => {
        expect(evaluateQuadratic(2, { a: 1, h: 1, k: 2 }, 'vertex')).toBe(3);
    });

    it('evaluates linear form using k as slope and b as intercept', () => {
        expect(evaluateQuadratic(2, { k: 3, b: 1 }, 'standard', 'linear')).toBe(7);
    });

    it('returns 0 for null params', () => {
        expect(evaluateQuadratic(5, null as any)).toBe(0);
    });
});

describe('generateQuadraticPath', () => {
    it('returns an empty string for invalid ppu', () => {
        expect(generateQuadraticPath({ a: 1 }, 'standard', 800, 600, 0)).toBe('');
    });

    it('draws a linear function across the extended viewport', () => {
        const d = generateQuadraticPath({ k: 1, b: 0 }, 'standard', 800, 600, 40, 'linear');
        expect(d).toBe('M -50 750 L 850 -150');
    });

    it('draws a quadratic as a polyline starting with a move', () => {
        const d = generateQuadraticPath({ a: 1, b: 0, c: 0 }, 'standard', 800, 600, 40);
        expect(d.startsWith('M ')).toBe(true);
        expect(d).toContain(' L ');
        expect(d).not.toContain('NaN');
    });

    it('returns an empty string when the whole curve is off-screen', () => {
        expect(generateQuadraticPath({ a: 1, b: 0, c: 10000 }, 'standard', 800, 600, 40)).toBe('');
    });
});