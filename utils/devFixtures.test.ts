import { describe, it, expect } from 'vitest';
import { generateStressShapes } from './devFixtures';
import { ShapeType } from '../types';

describe('generateStressShapes', () => {
    it('returns the requested count with unique ids', () => {
        const shapes = generateStressShapes(200);
        expect(shapes).toHaveLength(200);
        expect(new Set(shapes.map(s => s.id)).size).toBe(200);
    });
    it('is deterministic across calls', () => {
        expect(generateStressShapes(50)).toEqual(generateStressShapes(50));
    });
    it('cycles LINE/TRIANGLE/CIRCLE/TEXT', () => {
        expect(generateStressShapes(8).map(s => s.type)).toEqual([
            ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.TEXT,
            ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.TEXT,
        ]);
    });
    it('produces renderable shapes', () => {
        for (const s of generateStressShapes(20)) {
            expect(s.points.length).toBeGreaterThan(0);
            expect(typeof s.fill).toBe('string');
            expect(typeof s.stroke).toBe('string');
            expect(s.rotation).toBe(0);
        }
    });
});