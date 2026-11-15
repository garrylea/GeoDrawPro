import { describe, it, expect } from 'vitest';
import { getSnapPoint, snapToRuler } from './snapping';
import { Shape, ShapeType, Point } from '../types';

const createShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: 'black', strokeWidth: 2, rotation: 0, ...overrides
});

describe('getSnapPoint', () => {
    it('returns the cursor unchanged when there is nothing to snap to', () => {
        const pos = { x: 500, y: 500 };
        expect(getSnapPoint(pos, [])).toEqual({ point: pos, snapped: false, constraint: undefined, type: undefined });
    });

    it('snaps to a nearby point and emits a points_link constraint', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]);
        const result = getSnapPoint({ x: 105, y: 103 }, [point]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 100, y: 100 });
        expect(result.type).toBe('endpoint');
        expect(result.constraint).toEqual({ type: 'points_link', parentId: 'p1' });
    });

    it('prefers a point over an equidistant line via the 0.8 distance factor', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]);
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 104 }, { x: 200, y: 104 }]);
        // Cursor is 2px from both the point and the line; the point wins.
        const result = getSnapPoint({ x: 100, y: 102 }, [point, line]);
        expect(result.point).toEqual({ x: 100, y: 100 });
        expect(result.constraint).toEqual({ type: 'points_link', parentId: 'p1' });
    });

    it('skips shapes listed in excludeIds', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]);
        const result = getSnapPoint({ x: 101, y: 100 }, [point], ['p1']);
        expect(result.snapped).toBe(false);
    });

    it('snaps to a circle center', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{ x: 100, y: 100 }, { x: 200, y: 200 }]);
        const result = getSnapPoint({ x: 152, y: 151 }, [circle]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 150, y: 150 });
        expect(result.type).toBe('center');
        expect(result.constraint).toBeUndefined();
    });

    it('prefers the center over the perimeter when both are in range', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{ x: 145, y: 145 }, { x: 155, y: 155 }]);
        const result = getSnapPoint({ x: 150, y: 152 }, [circle]);
        expect(result.type).toBe('center');
        expect(result.point).toEqual({ x: 150, y: 150 });
    });

    it('snaps to a circle perimeter and stores the world angle', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{ x: 100, y: 100 }, { x: 200, y: 200 }]);
        const result = getSnapPoint({ x: 200, y: 150 }, [circle]);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(200);
        expect(result.point.y).toBeCloseTo(150);
        expect(result.type).toBe('on_edge');
        expect(result.constraint).toEqual({ type: 'on_path', parentId: 'c1', paramAngle: 0 });
    });

    it('stores the angle relative to the circle rotation', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{ x: 100, y: 100 }, { x: 200, y: 200 }], { rotation: 90 });
        const result = getSnapPoint({ x: 150, y: 100 }, [circle]);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(150);
        expect(result.point.y).toBeCloseTo(100);
        // World angle is -90; relative to the 90° rotation it must be -180.
        expect(result.constraint!.paramAngle).toBeCloseTo(-180);
    });

    it('does not snap outside the 25px perimeter band', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{ x: 100, y: 100 }, { x: 200, y: 200 }]);
        const result = getSnapPoint({ x: 150, y: 230 }, [circle]);
        expect(result.snapped).toBe(false);
    });

    it('snaps to an ellipse perimeter using rx/ry', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }]);
        const result = getSnapPoint({ x: 300, y: 150 }, [ellipse]);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(300);
        expect(result.point.y).toBeCloseTo(150);
        expect(result.constraint).toEqual({ type: 'on_path', parentId: 'e1', paramAngle: 0 });
    });

    it('snaps to a rotated ellipse and stores the local angle', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }], { rotation: 90 });
        // Local angle 0 (300,150) rotated 90° about the center lands at (200,250).
        const result = getSnapPoint({ x: 200, y: 250 }, [ellipse]);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(200);
        expect(result.point.y).toBeCloseTo(250);
        expect(result.constraint!.paramAngle).toBeCloseTo(0);
    });

    it('snaps to a triangle centroid', () => {
        const triangle = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
        const result = getSnapPoint({ x: 34, y: 33 }, [triangle]);
        expect(result.snapped).toBe(true);
        expect(result.type).toBe('center');
        expect(result.point.x).toBeCloseTo(100 / 3);
        expect(result.point.y).toBeCloseTo(100 / 3);
    });

    it('snaps to a line vertex and binds it to the starting edge', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        const result = getSnapPoint({ x: -2, y: 1 }, [line]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 0, y: 0 });
        expect(result.type).toBe('endpoint');
        expect(result.constraint).toEqual({ type: 'on_edge', parentId: 'l1', edgeIndex: 0, paramT: 0 });
    });

    it('snaps to an edge midpoint', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        const result = getSnapPoint({ x: 50, y: 3 }, [line]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 50, y: 0 });
        expect(result.type).toBe('midpoint');
        expect(result.constraint).toEqual({ type: 'on_edge', parentId: 'l1', edgeIndex: 0, paramT: 0.5 });
    });

    it('snaps to an arbitrary edge position and records paramT', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        const result = getSnapPoint({ x: 30, y: 4 }, [line]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 30, y: 0 });
        expect(result.type).toBe('on_edge');
        expect(result.constraint!.paramT).toBeCloseTo(0.3);
    });

    it('snaps to the closing edge of a polygon', () => {
        const triangle = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
        const result = getSnapPoint({ x: -3, y: 30 }, [triangle]);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 0, y: 30 });
        expect(result.constraint).toEqual({ type: 'on_edge', parentId: 't1', edgeIndex: 2, paramT: 0.7 });
    });

    it('snaps to the visual (rotated) vertex of a rectangle', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 20 }], { rotation: 90 });
        // Rotated corners: (60,-40),(60,60),(40,60),(40,-40)
        const result = getSnapPoint({ x: 61, y: -41 }, [rect]);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(60);
        expect(result.point.y).toBeCloseTo(-40);
        expect(result.type).toBe('endpoint');
        expect(result.constraint).toEqual({ type: 'on_edge', parentId: 'r1', edgeIndex: 0, paramT: 0 });
    });

    it('snaps to the 0.1-unit grid when no shape is closer', () => {
        const grid = { width: 800, height: 600, ppu: 40 };
        const result = getSnapPoint({ x: 101, y: 102 }, [], [], grid);
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 100, y: 104 });
        expect(result.constraint).toBeUndefined();
    });

    it('does not grid-snap when the cursor sits between grid lines', () => {
        const grid = { width: 800, height: 600, ppu: 100 };
        const result = getSnapPoint({ x: 105, y: 105 }, [], [], grid);
        expect(result.snapped).toBe(false);
    });

    it('lets a closer shape win over the grid snap', () => {
        const grid = { width: 800, height: 600, ppu: 40 };
        const point = createShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]);
        const result = getSnapPoint({ x: 101, y: 102 }, [point], [], grid);
        expect(result.point).toEqual({ x: 100, y: 100 });
        expect(result.constraint).toEqual({ type: 'points_link', parentId: 'p1' });
    });

    it('snaps to a function graph and records paramX', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: 1, b: 0 }
        });
        const grid = { width: 800, height: 600, ppu: 40, originY: 200 };
        const result = getSnapPoint({ x: 440, y: 160 }, [graph], [], grid);
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(440);
        expect(result.point.y).toBeCloseTo(160);
        expect(result.constraint).toEqual({ type: 'on_path', parentId: 'g1', paramX: 1 });
    });

    it('does not snap to a function graph without grid config', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: 1, b: 0 }
        });
        const result = getSnapPoint({ x: 440, y: 160 }, [graph]);
        expect(result.snapped).toBe(false);
    });
});

describe('snapToRuler', () => {
    const ruler = (overrides: Partial<Shape> = {}) =>
        createShape('ruler', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 200, y: 40 }], overrides);

    it('ignores non-ruler shapes', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 200, y: 40 }]);
        const p = { x: 50, y: -5 };
        expect(snapToRuler(p, line)).toEqual({ point: p, snapped: false });
    });

    it('ignores a ruler with fewer than two points', () => {
        const p = { x: 50, y: -5 };
        expect(snapToRuler(p, ruler({ points: [{ x: 0, y: 0 }] }))).toEqual({ point: p, snapped: false });
    });

    it('snaps to the top edge, slightly outside the visual edge', () => {
        const result = snapToRuler({ x: 50, y: -5, p: 0.6 }, ruler());
        expect(result.snapped).toBe(true);
        // Top edge is world y=0; the snap lands 2px outside it.
        expect(result.point).toEqual({ x: 50, y: -2, p: 0.6 });
    });

    it('snaps to the bottom edge', () => {
        const result = snapToRuler({ x: 50, y: 45 }, ruler());
        expect(result.snapped).toBe(true);
        expect(result.point).toEqual({ x: 50, y: 42, p: undefined });
    });

    it('does not snap in the middle of the ruler outside the tolerance', () => {
        const p = { x: 50, y: 20 };
        expect(snapToRuler(p, ruler(), 10)).toEqual({ point: p, snapped: false });
    });

    it('does not snap beyond the horizontal ends', () => {
        const p = { x: 400, y: 0 };
        expect(snapToRuler(p, ruler())).toEqual({ point: p, snapped: false });
    });

    it('snaps correctly on a 90°-rotated ruler', () => {
        // Local (-50,-25) maps to world (125,-30); snapping the top edge
        // moves it to local (-50,-22) -> world (122,-30).
        const result = snapToRuler({ x: 125, y: -30 }, ruler({ rotation: 90 }));
        expect(result.snapped).toBe(true);
        expect(result.point.x).toBeCloseTo(122);
        expect(result.point.y).toBeCloseTo(-30);
    });
});