import { describe, it, expect } from 'vitest';
import {
    buildShapeTransform, buildResetTransform, buildLineResetAttrs,
    isElasticLine, buildElasticLineAttrs
} from './transientTransform';
import { Shape, ShapeType } from '../types';

const make = (id: string, overrides: Partial<Shape> = {}): Shape => ({
    id, type: ShapeType.RECTANGLE, points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
    fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0, ...overrides
});

const linkedLine = (overrides: Partial<Shape> = {}): Shape => make('l1', {
    type: ShapeType.LINE,
    points: [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    constraint: { type: 'points_link', parents: ['p1', 'p2'] },
    ...overrides
});

describe('buildShapeTransform', () => {
    it('returns an empty string for an empty state', () => {
        expect(buildShapeTransform(make('r1'), {})).toBe('');
    });

    it('emits translate only when dx or dy is non-zero', () => {
        expect(buildShapeTransform(undefined, { dx: 10, dy: -5 })).toBe('translate(10 -5)');
        expect(buildShapeTransform(undefined, { dx: 0, dy: 0 })).toBe('');
        expect(buildShapeTransform(undefined, { dy: 7 })).toBe('translate(0 7)');
    });

    it('emits the gesture rotation only when a pivot is present', () => {
        expect(buildShapeTransform(undefined, { rotation: 45, rotationCenter: { x: 1, y: 2 } })).toBe('rotate(45 1 2)');
        expect(buildShapeTransform(undefined, { rotation: 45 })).toBe('');
    });

    it('includes the persistent shape rotation around its center', () => {
        expect(buildShapeTransform(make('r1', { rotation: 30 }), {})).toBe('rotate(30 50 25)');
    });

    it('orders gesture rotate, translate, persistent rotate, then scale', () => {
        const state = {
            dx: 10, dy: 20,
            rotation: 15, rotationCenter: { x: 0, y: 0 },
            scale: { x: 2, y: 3 }, scaleCenter: { x: 50, y: 25 }
        };
        expect(buildShapeTransform(make('r1', { rotation: 30 }), state))
            .toBe('rotate(15 0 0) translate(10 20) rotate(30 50 25) translate(50 25) scale(2 3) translate(-50 -25)');
    });

    it('skips persistent rotation and scale when the shape is unknown', () => {
        const state = { dx: 5, scale: { x: 2, y: 2 }, scaleCenter: { x: 0, y: 0 } };
        expect(buildShapeTransform(undefined, state)).toBe('translate(5 0)');
    });
});

describe('buildResetTransform', () => {
    it('restores the persistent rotation', () => {
        expect(buildResetTransform(make('r1', { rotation: 30 }))).toBe('rotate(30 50 25)');
    });

    it('returns empty for unrotated or unknown shapes', () => {
        expect(buildResetTransform(make('r1'))).toBe('');
        expect(buildResetTransform(undefined)).toBe('');
    });
});

describe('buildLineResetAttrs', () => {
    it('maps both endpoints to x1/y1/x2/y2', () => {
        const line = make('l1', { type: ShapeType.LINE, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] });
        expect(buildLineResetAttrs(line)).toEqual([
            { name: 'x1', value: '10' },
            { name: 'y1', value: '20' },
            { name: 'x2', value: '30' },
            { name: 'y2', value: '40' }
        ]);
    });
});

describe('isElasticLine', () => {
    it('is true when a linked parent is selected', () => {
        expect(isElasticLine(linkedLine(), new Set(['p1']))).toBe(true);
    });

    it('falls back to parentId when parents is absent', () => {
        const line = linkedLine({ constraint: { type: 'points_link', parentId: 'p1' } });
        expect(isElasticLine(line, new Set(['p1']))).toBe(true);
    });

    it('is false when no parent is selected', () => {
        expect(isElasticLine(linkedLine(), new Set(['l1']))).toBe(false);
        expect(isElasticLine(linkedLine(), new Set())).toBe(false);
    });

    it('is false for non-lines, unconstrained lines, and missing shapes', () => {
        expect(isElasticLine(make('r1'), new Set(['p1']))).toBe(false);
        expect(isElasticLine(make('l1', { type: ShapeType.LINE }), new Set(['p1']))).toBe(false);
        expect(isElasticLine(undefined, new Set(['p1']))).toBe(false);
    });
});

describe('buildElasticLineAttrs', () => {
    it('stretches only the endpoints whose parent is selected', () => {
        expect(buildElasticLineAttrs(linkedLine(), { dx: 30, dy: -20 }, new Set(['p1']))).toEqual([
            { name: 'x1', value: '130' },
            { name: 'y1', value: '80' }
        ]);
    });

    it('stretches both endpoints when both parents are selected', () => {
        expect(buildElasticLineAttrs(linkedLine(), { dx: 30, dy: -20 }, new Set(['p1', 'p2']))).toEqual([
            { name: 'x1', value: '130' },
            { name: 'y1', value: '80' },
            { name: 'x2', value: '230' },
            { name: 'y2', value: '180' }
        ]);
    });

    it('skips null parent slots', () => {
        const line = linkedLine({ constraint: { type: 'points_link', parents: [null, 'p2'] } });
        expect(buildElasticLineAttrs(line, { dx: 5 }, new Set(['p2']))).toEqual([
            { name: 'x2', value: '205' },
            { name: 'y2', value: '200' }
        ]);
    });

    it('keeps original coordinates when the state has no delta', () => {
        expect(buildElasticLineAttrs(linkedLine(), {}, new Set(['p1']))).toEqual([
            { name: 'x1', value: '100' },
            { name: 'y1', value: '100' }
        ]);
    });
});