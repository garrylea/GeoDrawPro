import { describe, it, expect } from 'vitest';
import { getSmoothSvgPath, getVariableWidthPath, getAngleArcPath } from './svgPaths';
import { Point } from '../types';

describe('getAngleArcPath', () => {
    const center = { x: 0, y: 0 };

    it('draws a small arc with sweep 1 for a positive 90° span', () => {
        const d = getAngleArcPath(center, null, null, 10, 0, 90);
        expect(d.startsWith('M 10 0 A 10 10 0 0 1')).toBe(true);
    });

    it('sets the large-arc flag beyond 180°', () => {
        expect(getAngleArcPath(center, null, null, 10, 0, 270)).toContain('A 10 10 0 1 1');
    });

    it('uses sweep 0 for a negative span', () => {
        expect(getAngleArcPath(center, null, null, 10, 90, 0)).toContain('A 10 10 0 0 0');
    });

    it('draws a full circle as two arcs for a 360° span', () => {
        const d = getAngleArcPath(center, null, null, 10, 0, 360);
        expect(d.startsWith('M 10 0')).toBe(true);
        expect(d.match(/A 10 10 0 1 1/g)).toHaveLength(2);
    });

    it('derives angles from the two points when not given explicitly', () => {
        const d = getAngleArcPath(center, { x: 10, y: 0 }, { x: 0, y: 10 }, 10);
        expect(d.startsWith('M 10 0 A 10 10 0 0 1')).toBe(true);
    });

    it('returns an empty string when angles cannot be determined', () => {
        expect(getAngleArcPath(center, null, null, 10)).toBe('');
        expect(getAngleArcPath(center, { x: 10, y: 0 }, null, 10)).toBe('');
        expect(getAngleArcPath(center, null, null, 10, 0)).toBe('');
    });
});

describe('getSmoothSvgPath', () => {
    it('returns an empty string for no points', () => {
        expect(getSmoothSvgPath([])).toBe('');
    });

    it('returns a closed move for a single point', () => {
        expect(getSmoothSvgPath([{ x: 10, y: 20 }])).toBe('M 10 20 Z');
    });

    it('uses straight segments for two points', () => {
        expect(getSmoothSvgPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe('M 0 0 L 5 5 L 10 10');
    });

    it('uses quadratic midpoints for three or more points', () => {
        expect(getSmoothSvgPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }]))
            .toBe('M 0 0 L 5 0 Q 10 0 15 5 L 20 10');
    });

    it('appends Z when closed', () => {
        expect(getSmoothSvgPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }], true).endsWith(' Z')).toBe(true);
    });
});

describe('getVariableWidthPath', () => {
    const stroke = (n: number, p?: number): Point[] =>
        Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, ...(p !== undefined ? { p } : {}) }));

    it('returns an empty string for fewer than two points', () => {
        expect(getVariableWidthPath([{ x: 0, y: 0 }], 4)).toBe('');
    });

    it('produces a closed outline', () => {
        const d = getVariableWidthPath(stroke(12, 0.5), 2);
        expect(d.startsWith('M ')).toBe(true);
        expect(d.endsWith(' Z')).toBe(true);
        expect(d).toContain(' Q ');
    });

    it('widens the outline with pressure', () => {
        // First point taper is 0.2: width = max(0.5, baseWidth * p * 2 * 0.2).
        expect(getVariableWidthPath(stroke(12, 0.5), 2).startsWith('M 0 0.5')).toBe(true);
        expect(getVariableWidthPath(stroke(12, 0.8), 2).startsWith('M 0 0.64')).toBe(true);
    });

    it('defaults pressure to 0.5 when absent', () => {
        expect(getVariableWidthPath(stroke(12), 2)).toBe(getVariableWidthPath(stroke(12, 0.5), 2));
    });

    it('survives duplicate consecutive points without NaN', () => {
        const d = getVariableWidthPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }], 4);
        expect(d).not.toContain('NaN');
        expect(d.endsWith(' Z')).toBe(true);
    });
});