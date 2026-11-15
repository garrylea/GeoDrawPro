import { describe, it, expect } from 'vitest';
import { getNextLabels } from './labeling';
import { Shape, ShapeType } from '../types';

const make = (id: string, overrides: Partial<Shape> = {}): Shape => ({
    id, type: ShapeType.RECTANGLE, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0, ...overrides
});

describe('getNextLabels', () => {
    it('starts at A for an empty document', () => {
        expect(getNextLabels([], 3)).toEqual(['A', 'B', 'C']);
    });

    it('skips labels already used by shapes', () => {
        const shapes = [make('s1', { labels: ['A', 'C'] })];
        expect(getNextLabels(shapes, 3)).toEqual(['B', 'D', 'E']);
    });

    it('treats short text shapes as used labels', () => {
        const shapes = [make('t1', { type: ShapeType.TEXT, text: 'A' }), make('t2', { type: ShapeType.TEXT, text: 'B' })];
        expect(getNextLabels(shapes, 2)).toEqual(['C', 'D']);
    });

    it('ignores text longer than two characters', () => {
        const shapes = [make('t1', { type: ShapeType.TEXT, text: 'ABC' })];
        expect(getNextLabels(shapes, 1)).toEqual(['A']);
    });

    it('wraps past Z with a numeric cycle suffix', () => {
        const used = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
        const shapes = [make('s1', { labels: used })];
        expect(getNextLabels(shapes, 2)).toEqual(['A1', 'B1']);
    });

    it('returns an empty array for count 0', () => {
        expect(getNextLabels([], 0)).toEqual([]);
    });
});