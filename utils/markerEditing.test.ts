import { describe, it, expect } from 'vitest';
import { getRotationPivot, planAngleMarkerToggle, toggleMarkerType } from './markerEditing';
import { Shape, ShapeType } from '../types';

const make = (id: string, overrides: Partial<Shape> = {}): Shape => ({
    id, type: ShapeType.RECTANGLE, points: [{ x: 0, y: 0 }, { x: 100, y: 50 }],
    fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0, ...overrides
});

const triangle = () => make('tri', {
    type: ShapeType.TRIANGLE,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
});

const angleMarker = (id: string, type: 'angle_arc' | 'perpendicular' = 'angle_arc'): Shape => make(id, {
    type: ShapeType.MARKER,
    points: [{ x: 0, y: 0 }],
    markerConfig: { type, targets: [{ shapeId: 'tri', pointIndices: [0, 1, 2] }] }
});

describe('getRotationPivot', () => {
    it('returns the shape center for pivot "center"', () => {
        expect(getRotationPivot(make('r1'), 'center')).toEqual({ x: 50, y: 25 });
    });

    it('returns the top-left / top-right of the ruler bounding box', () => {
        const ruler = make('ruler', { type: ShapeType.RULER, points: [{ x: 200, y: 100 }, { x: 600, y: 140 }] });
        expect(getRotationPivot(ruler, 0)).toEqual({ x: 200, y: 100 });
        expect(getRotationPivot(ruler, 1)).toEqual({ x: 600, y: 100 });
        const reversed = make('ruler', { type: ShapeType.RULER, points: [{ x: 600, y: 140 }, { x: 200, y: 100 }] });
        expect(getRotationPivot(reversed, 0)).toEqual({ x: 200, y: 100 });
        expect(getRotationPivot(reversed, 1)).toEqual({ x: 600, y: 100 });
    });

    it('returns the rotated corner for other shapes', () => {
        const rotated = make('r1', { rotation: 90 });
        const pivot = getRotationPivot(rotated, 0);
        expect(pivot.x).toBeCloseTo(75, 5);
        expect(pivot.y).toBeCloseTo(-25, 5);
    });
});

describe('planAngleMarkerToggle', () => {
    it('plans creation of an angle_arc marker when none exists', () => {
        const tri = triangle();
        const plan = planAngleMarkerToggle([tri], tri, 1, 'new-marker');
        expect(plan.kind).toBe('create');
        if (plan.kind !== 'create') return;
        expect(plan.marker.id).toBe('new-marker');
        expect(plan.marker.type).toBe(ShapeType.MARKER);
        expect(plan.marker.stroke).toBe('#ef4444');
        expect(plan.marker.strokeWidth).toBe(2);
        expect(plan.marker.markerConfig?.type).toBe('angle_arc');
        expect(plan.marker.markerConfig?.targets[0]).toEqual({ shapeId: 'tri', pointIndices: [0, 1, 2] });
        expect(plan.marker.pathData).toBeTruthy();
    });

    it('plans a toggle when a marker already targets that vertex', () => {
        const tri = triangle();
        const existing = angleMarker('m1');
        const plan = planAngleMarkerToggle([tri, existing], tri, 1, 'unused');
        expect(plan).toEqual({ kind: 'toggle', markerId: 'm1' });
    });

    it('does not match a marker aimed at a different vertex', () => {
        const tri = triangle();
        const existing = angleMarker('m1');
        const plan = planAngleMarkerToggle([tri, existing], tri, 0, 'new-marker');
        expect(plan.kind).toBe('create');
    });

    it('is a noop when the target shape cannot be resolved', () => {
        const tri = triangle();
        expect(planAngleMarkerToggle([], tri, 1, 'new-marker')).toEqual({ kind: 'noop' });
    });
});

describe('toggleMarkerType', () => {
    it('switches angle_arc to perpendicular and recomputes the path', () => {
        const tri = triangle();
        const marker = angleMarker('m1');
        const result = toggleMarkerType(marker, [tri, marker]);
        expect(result.markerConfig?.type).toBe('perpendicular');
        expect(result.pathData).toBeTruthy();
        expect(result.pathData).not.toBe(marker.pathData);
    });

    it('switches perpendicular back to angle_arc', () => {
        const tri = triangle();
        const marker = angleMarker('m1', 'perpendicular');
        const result = toggleMarkerType(marker, [tri, marker]);
        expect(result.markerConfig?.type).toBe('angle_arc');
    });

    it('returns the original marker when its target is missing', () => {
        const marker = angleMarker('m1');
        expect(toggleMarkerType(marker, [])).toBe(marker);
    });
});