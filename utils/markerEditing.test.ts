import { describe, it, expect } from 'vitest';
import { getRotationPivot, planAngleMarkerToggle, toggleMarkerType, recalculateMarker } from './markerEditing';
import { Shape, ShapeType, Point } from '../types';

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

const createShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: 'black', strokeWidth: 2, rotation: 0, ...overrides
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

describe('recalculateMarker', () => {
    const triangle = createShape('tri', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
    const marker = (type: 'angle_arc' | 'perpendicular', indices = [0, 1, 2]) =>
        createShape('m1', ShapeType.MARKER, [{ x: 0, y: 0 }], {
            markerConfig: { type, targets: [{ shapeId: 'tri', pointIndices: indices }] }
        });

    it('returns the marker unchanged without a config', () => {
        const m = createShape('m1', ShapeType.MARKER, [{ x: 0, y: 0 }]);
        expect(recalculateMarker(m, [triangle])).toBe(m);
    });

    it('returns null when the target shape is gone', () => {
        expect(recalculateMarker(marker('angle_arc'), [])).toBeNull();
    });

    it('returns the marker unchanged with fewer than three indices', () => {
        const m = marker('angle_arc', [0, 1]);
        expect(recalculateMarker(m, [triangle])).toBe(m);
    });

    it('returns null when an indexed vertex does not exist', () => {
        expect(recalculateMarker(marker('angle_arc', [0, 1, 5]), [triangle])).toBeNull();
    });

    it('rebuilds an angle arc at the middle vertex', () => {
        const result = recalculateMarker(marker('angle_arc'), [triangle])!;
        // p2 = (100,0); start = p2 + normalize(p1-p2)*20 = (80,0)
        expect(result.points[0].x).toBeCloseTo(80);
        expect(result.points[0].y).toBeCloseTo(0);
        expect(result.pathData).toContain('A 20 20');
    });

    it('rebuilds a perpendicular mark with two line segments', () => {
        const result = recalculateMarker(marker('perpendicular'), [triangle])!;
        expect(result.points[0].x).toBeCloseTo(80);
        expect(result.pathData!.startsWith('M 80 0 L')).toBe(true);
        expect(result.pathData!.match(/L /g)).toHaveLength(2);
    });

    it('follows the target when it moves', () => {
        const moved = { ...triangle, points: triangle.points.map(p => ({ x: p.x + 10, y: p.y })) };
        const result = recalculateMarker(marker('angle_arc'), [moved])!;
        expect(result.points[0].x).toBeCloseTo(90);
        expect(result.points[0].y).toBeCloseTo(0);
    });
});