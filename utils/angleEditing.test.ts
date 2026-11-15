import { describe, it, expect } from 'vitest';
import { applyAngleEdit, getAngleEditAnchor } from './angleEditing';
import { Shape, ShapeType, Point } from '../types';

const make = (id: string, overrides: Partial<Shape> = {}): Shape => ({
    id, type: ShapeType.TRIANGLE, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }],
    fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0, ...overrides
});

const angleAt = (pts: Point[], vertex: number, a: number, b: number): number => {
    const v1 = { x: pts[a].x - pts[vertex].x, y: pts[a].y - pts[vertex].y };
    const v2 = { x: pts[b].x - pts[vertex].x, y: pts[b].y - pts[vertex].y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag = Math.sqrt(v1.x * v1.x + v1.y * v1.y) * Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
};

describe('applyAngleEdit (triangle)', () => {
    it('solves ASA keeping the next vertex fixed by default', () => {
        const tri = make('t1');
        const result = applyAngleEdit(tri, 0, 60)!;
        expect(result.points[1]).toEqual({ x: 100, y: 0 });
        expect(result.points[2].x).toBeCloseTo(36.6025, 3);
        expect(result.points[2].y).toBeCloseTo(63.3975, 3);
        expect(angleAt(result.points, 0, 1, 2)).toBeCloseTo(60, 5);
        expect(angleAt(result.points, 1, 0, 2)).toBeCloseTo(45, 5);
        expect(result.lockedAngles).toEqual([1]);
        expect(result.lastModifiedAngleIndex).toBe(0);
    });

    it('keeps lastModifiedAngleIndex fixed when editing a different vertex', () => {
        const tri = make('t1', { lastModifiedAngleIndex: 2 });
        const result = applyAngleEdit(tri, 0, 60)!;
        expect(result.points[2]).toEqual({ x: 0, y: 100 });
        expect(result.points[1].x).not.toBe(100);
        expect(angleAt(result.points, 2, 0, 1)).toBeCloseTo(45, 5);
        expect(result.lockedAngles).toEqual([2]);
    });

    it('falls back to lockedAngles[0] when re-editing the same vertex', () => {
        const tri = make('t1', { lastModifiedAngleIndex: 0, lockedAngles: [2] });
        const result = applyAngleEdit(tri, 0, 60)!;
        expect(result.points[2]).toEqual({ x: 0, y: 100 });
        expect(result.lockedAngles).toEqual([2]);
        expect(result.lastModifiedAngleIndex).toBe(0);
    });

    it('returns the shape unchanged when the ASA rays are parallel', () => {
        const tri = make('t1', { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
        const result = applyAngleEdit(tri, 0, 90);
        expect(result).toBe(tri);
    });
});

describe('applyAngleEdit (polygon)', () => {
    const square = () => make('p1', {
        type: ShapeType.POLYGON,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    });

    it('rotates the next vertex around the edited one, preserving edge length', () => {
        const result = applyAngleEdit(square(), 0, 45)!;
        expect(result.points[1].x).toBeCloseTo(70.7107, 3);
        expect(result.points[1].y).toBeCloseTo(70.7107, 3);
        expect(result.points[0]).toEqual({ x: 0, y: 0 });
        expect(result.points[2]).toEqual({ x: 100, y: 100 });
        expect(result.points[3]).toEqual({ x: 0, y: 100 });
        expect(result.lockedAngles).toBeUndefined();
    });

    it('wraps the next-vertex index around the end of the point list', () => {
        const result = applyAngleEdit(square(), 3, 45)!;
        expect(result.points[0].x).toBeCloseTo(70.7107, 3);
        expect(result.points[0].y).toBeCloseTo(29.2893, 3);
        expect(result.points[3]).toEqual({ x: 0, y: 100 });
    });
});

describe('applyAngleEdit (unsupported)', () => {
    it('returns null for shapes without angle semantics', () => {
        expect(applyAngleEdit(make('r1', { type: ShapeType.RECTANGLE }), 0, 60)).toBeNull();
    });
});

describe('getAngleEditAnchor', () => {
    it('places the anchor 25px from the vertex toward the centroid', () => {
        const anchor = getAngleEditAnchor(make('t1'), 0);
        expect(anchor.x).toBeCloseTo(17.6777, 3);
        expect(anchor.y).toBeCloseTo(17.6777, 3);
    });

    it('returns the vertex itself when it coincides with the center', () => {
        const degenerate = make('t1', { points: [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }] });
        expect(getAngleEditAnchor(degenerate, 0)).toEqual({ x: 5, y: 5 });
    });
});