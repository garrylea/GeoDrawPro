import { describe, it, expect } from 'vitest';
import {
    getHitShape, getSelectionBounds, calculateResizedShape,
    calculateMovedShape, calculateRotatedShape
} from './shapeOperations';
import { getRotatedCorners } from './mathUtils';
import { Shape, ShapeType, Point } from '../types';

const createShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: 'black', strokeWidth: 2, rotation: 0, ...overrides
});

const W = 800, H = 600, PPU = 40;

describe('getHitShape', () => {
    it('returns null for an empty shape list', () => {
        expect(getHitShape({ x: 50, y: 50 }, [], W, H, PPU)).toBeNull();
    });

    it('returns null when the click misses every shape', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }], { fill: 'blue' });
        expect(getHitShape({ x: 500, y: 500 }, [rect], W, H, PPU)).toBeNull();
    });

    it('hits a filled rectangle by its interior', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }], { fill: 'blue' });
        expect(getHitShape({ x: 50, y: 50 }, [rect], W, H, PPU)).toBe(rect);
    });

    it('selects a transparent rectangle by its interior as well as its edges', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
        expect(getHitShape({ x: 50, y: 50 }, [rect], W, H, PPU)).toBe(rect);
        expect(getHitShape({ x: 50, y: 2 }, [rect], W, H, PPU)).toBe(rect);
    });

    it('prefers a point over the rectangle containing it', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }], { fill: 'blue' });
        const point = createShape('p1', ShapeType.POINT, [{ x: 50, y: 50 }], { fill: 'black' });
        expect(getHitShape({ x: 50, y: 50 }, [rect, point], W, H, PPU)).toBe(point);
    });

    it('prefers a marker ring over the rectangle containing it', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 300, y: 300 }], { fill: 'blue' });
        const marker = createShape('m1', ShapeType.MARKER, [{ x: 100, y: 100 }]);
        expect(getHitShape({ x: 125, y: 100 }, [rect, marker], W, H, PPU)).toBe(marker);
    });

    it('prefers the smaller of two overlapping rectangles', () => {
        const big = createShape('big', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 200, y: 200 }], { fill: 'blue' });
        const small = createShape('small', ShapeType.RECTANGLE, [{ x: 40, y: 40 }, { x: 80, y: 80 }], { fill: 'red' });
        expect(getHitShape({ x: 60, y: 60 }, [big, small], W, H, PPU)).toBe(small);
    });

    it('prefers the closer of two lines', () => {
        const near = createShape('near', ShapeType.LINE, [{ x: 0, y: 100 }, { x: 200, y: 100 }]);
        const far = createShape('far', ShapeType.LINE, [{ x: 0, y: 108 }, { x: 200, y: 108 }]);
        expect(getHitShape({ x: 100, y: 103 }, [far, near], W, H, PPU)).toBe(near);
    });

    it('prefers text over the rectangle behind it', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 300, y: 300 }], { fill: 'blue' });
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: 'Hello', fontSize: 20 });
        expect(getHitShape({ x: 120, y: 110 }, [rect, text], W, H, PPU)).toBe(text);
    });

    it('hits a rotated rectangle inside its visual bounds, not its raw point bounds', () => {
        // 90° rotation turns the 100x20 box into a 20x100 box spanning y -40..60;
        // the click at y=55 lies outside the unrotated AABB (+tolerance).
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 20 }], { fill: 'blue', rotation: 90 });
        expect(getHitShape({ x: 50, y: 55 }, [rect], W, H, PPU)).toBe(rect);
    });

    it('hits a function graph through the provided originY', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: 1, b: 0 }
        });
        // With originY=200 the line y=x passes through screen (440, 160)
        expect(getHitShape({ x: 440, y: 160 }, [graph], W, H, PPU, 200)).toBe(graph);
        // With the default origin (300) the same click is far from the curve
        expect(getHitShape({ x: 440, y: 160 }, [graph], W, H, PPU)).toBeNull();
    });

    it('passes hitTolerance through to point detection', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }], { strokeWidth: 1 });
        expect(getHitShape({ x: 115, y: 100 }, [point], W, H, PPU)).toBeNull();
        expect(getHitShape({ x: 115, y: 100 }, [point], W, H, PPU, undefined, 20)).toBe(point);
    });
});

describe('getSelectionBounds', () => {
    it('returns null when nothing is selected', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
        expect(getSelectionBounds([rect], new Set())).toBeNull();
    });

    it('returns null when the selected ids do not exist', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
        expect(getSelectionBounds([rect], new Set(['missing']))).toBeNull();
    });

    it('computes the union bounds of the selected shapes only', () => {
        const a = createShape('a', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
        const b = createShape('b', ShapeType.RECTANGLE, [{ x: 150, y: 20 }, { x: 200, y: 80 }]);
        const unselected = createShape('c', ShapeType.RECTANGLE, [{ x: 300, y: 300 }, { x: 400, y: 400 }]);
        expect(getSelectionBounds([a, b, unselected], new Set(['a', 'b']))).toEqual({
            minX: 0, minY: 0, maxX: 200, maxY: 80, width: 200, height: 80
        });
    });

    it('uses the rotated visual corners', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 20 }], { rotation: 90 });
        const bounds = getSelectionBounds([rect], new Set(['r1']))!;
        expect(bounds.minX).toBeCloseTo(40);
        expect(bounds.maxX).toBeCloseTo(60);
        expect(bounds.minY).toBeCloseTo(-40);
        expect(bounds.maxY).toBeCloseTo(60);
        expect(bounds.width).toBeCloseTo(20);
        expect(bounds.height).toBeCloseTo(100);
    });

    it('returns a zero-size box for a single point', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 10, y: 20 }]);
        expect(getSelectionBounds([point], new Set(['p1']))).toEqual({
            minX: 10, minY: 20, maxX: 10, maxY: 20, width: 0, height: 0
        });
    });
});

describe('calculateResizedShape', () => {
    describe('vertex shapes (rotation baking)', () => {
        it('moves the dragged triangle vertex to the cursor and keeps the others', () => {
            const tri = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], { lockedAngles: [1] });
            const result = calculateResizedShape(tri, { x: 150, y: 20 }, 1, false);
            expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 150, y: 20 }, { x: 0, y: 100 }]);
            expect(result.rotation).toBe(0);
            expect(result.lockedAngles).toEqual([]);
        });

        it('bakes an existing rotation into the vertices and resets it to 0', () => {
            const tri = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], { rotation: 90 });
            const result = calculateResizedShape(tri, { x: 200, y: 200 }, 0, false);
            // Centroid (100/3, 100/3); the untouched vertices are the originals rotated 90° about it
            expect(result.points[0]).toEqual({ x: 200, y: 200 });
            expect(result.points[1].x).toBeCloseTo(200 / 3);
            expect(result.points[1].y).toBeCloseTo(100);
            expect(result.points[2].x).toBeCloseTo(-100 / 3);
            expect(result.points[2].y).toBeCloseTo(0);
            expect(result.rotation).toBe(0);
        });

        it('drags a line endpoint', () => {
            const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
            const result = calculateResizedShape(line, { x: 120, y: 30 }, 1, false);
            expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 120, y: 30 }]);
        });

        it('drags a point shape', () => {
            const point = createShape('p1', ShapeType.POINT, [{ x: 10, y: 10 }]);
            const result = calculateResizedShape(point, { x: 50, y: 60 }, 0, false);
            expect(result.points).toEqual([{ x: 50, y: 60 }]);
        });

        it('preserves pressure values while dragging a freehand vertex', () => {
            const stroke = createShape('f1', ShapeType.FREEHAND, [{ x: 0, y: 0, p: 0.2 }, { x: 10, y: 0, p: 0.8 }]);
            const result = calculateResizedShape(stroke, { x: 20, y: 5 }, 1, false);
            expect(result.points).toEqual([{ x: 0, y: 0, p: 0.2 }, { x: 20, y: 5, p: 0.8 }]);
        });

        it('returns the shape unchanged for an out-of-range handle index', () => {
            const tri = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
            expect(calculateResizedShape(tri, { x: 50, y: 50 }, 5, false)).toBe(tri);
        });
    });

    describe('box shapes (anchor-based scaling)', () => {
        it('pins the opposite corner when dragging the bottom-right handle', () => {
            const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
            const result = calculateResizedShape(rect, { x: 150, y: 80 }, 2, false);
            expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 150, y: 80 }]);
        });

        it('pins the bottom-right corner when dragging the top-left handle', () => {
            const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
            const result = calculateResizedShape(rect, { x: -20, y: -30 }, 0, false);
            expect(result.points).toEqual([{ x: -20, y: -30 }, { x: 100, y: 50 }]);
        });

        it('keeps the aspect ratio while shift is pressed', () => {
            const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
            const result = calculateResizedShape(rect, { x: 200, y: 120 }, 2, true);
            expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 240, y: 120 }]);
        });

        it('forces a square aspect ratio even without shift', () => {
            const square = createShape('s1', ShapeType.SQUARE, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
            const result = calculateResizedShape(square, { x: 200, y: 150 }, 2, false);
            expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 200, y: 200 }]);
        });

        it('keeps the diagonal anchor pinned on a rotated rectangle', () => {
            const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 90 });
            const anchor = getRotatedCorners(rect)[0]; // visual TL stays fixed while dragging BR
            // Dragging BR onto its current visual position is an identity resize
            const result = calculateResizedShape(rect, { x: 25, y: 75 }, 2, false);
            expect(result.rotation).toBe(90);
            expect(result.points[0].x).toBeCloseTo(0);
            expect(result.points[0].y).toBeCloseTo(0);
            expect(result.points[1].x).toBeCloseTo(100);
            expect(result.points[1].y).toBeCloseTo(50);
            const newAnchor = getRotatedCorners(result)[0];
            expect(newAnchor.x).toBeCloseTo(anchor.x);
            expect(newAnchor.y).toBeCloseTo(anchor.y);
        });

        it('scales the font size when resizing text', () => {
            const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: 'Hello', fontSize: 20 });
            const result = calculateResizedShape(text, { x: 260, y: 146 }, 2, false);
            expect(result.fontSize).toBeCloseTo(40);
            expect(result.points[0].x).toBeCloseTo(100);
            expect(result.points[0].y).toBeCloseTo(102);
        });

        it('returns the shape unchanged when it has no corners', () => {
            const image = createShape('i1', ShapeType.IMAGE, []);
            expect(calculateResizedShape(image, { x: 50, y: 50 }, 2, false)).toBe(image);
        });
    });

    describe('group scaling', () => {
        const groupBounds = { minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 };

        it('scales points relative to the pinned group corner', () => {
            const line = createShape('l1', ShapeType.LINE, [{ x: 20, y: 10 }, { x: 80, y: 40 }]);
            const result = calculateResizedShape(line, { x: 200, y: 100 }, 2, false, groupBounds);
            expect(result.points).toEqual([{ x: 40, y: 20 }, { x: 160, y: 80 }]);
        });

        it('keeps the group aspect ratio while shift is pressed', () => {
            const line = createShape('l1', ShapeType.LINE, [{ x: 20, y: 10 }, { x: 80, y: 40 }]);
            const result = calculateResizedShape(line, { x: 300, y: 100 }, 2, true, groupBounds);
            expect(result.points).toEqual([{ x: 60, y: 30 }, { x: 240, y: 120 }]);
        });

        it('scales text font size with the group height', () => {
            const text = createShape('t1', ShapeType.TEXT, [{ x: 50, y: 25 }], { text: 'Hi', fontSize: 20 });
            const result = calculateResizedShape(text, { x: 200, y: 100 }, 2, false, groupBounds);
            expect(result.fontSize).toBeCloseTo(40);
            expect(result.points).toEqual([{ x: 100, y: 50 }]);
        });

        it('clamps the new size to a minimum when collapsed onto the anchor', () => {
            const line = createShape('l1', ShapeType.LINE, [{ x: 20, y: 10 }, { x: 80, y: 40 }]);
            const result = calculateResizedShape(line, { x: 0, y: 0 }, 2, false, groupBounds);
            expect(result.points[0].x).toBeCloseTo(0.02);
            expect(result.points[0].y).toBeCloseTo(0.02);
            expect(result.points[1].x).toBeCloseTo(0.08);
            expect(result.points[1].y).toBeCloseTo(0.08);
        });
    });
});

describe('calculateMovedShape', () => {
    it('translates every point and preserves pressure', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0, p: 0.3 }, { x: 100, y: 50, p: 0.9 }]);
        const result = calculateMovedShape(rect, 10, -5, PPU);
        expect(result.points).toEqual([{ x: 10, y: -5, p: 0.3 }, { x: 110, y: 45, p: 0.9 }]);
    });

    it('shifts the intercept of a linear function in math coordinates', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: 2, b: 0 }, pathData: 'old-path'
        });
        // dx=40, dy=-40 at 40px/unit => math delta (1, 1); b' = b + 1 - k*1 = -1
        const result = calculateMovedShape(graph, 40, -40, PPU);
        expect(result.formulaParams).toEqual({ k: 2, b: -1 });
        expect(result.pathData).toBe('old-path');
    });

    it('shifts the vertex of a quadratic and syncs standard-form coefficients', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'quadratic', functionForm: 'vertex',
            formulaParams: { a: 1, h: 0, k: 0, b: 0, c: 0 }, pathData: 'old-path'
        });
        const result = calculateMovedShape(graph, 40, -40, PPU);
        expect(result.formulaParams).toEqual({ a: 1, h: 1, k: 1, b: -2, c: 2 });
        expect(result.pathData).toBe('old-path');
    });

    it('regenerates the path when canvas dimensions are provided', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'quadratic', functionForm: 'vertex',
            formulaParams: { a: 1, h: 0, k: 0 }, pathData: 'old-path'
        });
        const result = calculateMovedShape(graph, 40, -40, PPU, [], W, H, 300);
        expect(result.pathData).not.toBe('old-path');
        expect(result.pathData!.length).toBeGreaterThan(0);
    });

    it('moves only the vertices near a driving point', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        const result = calculateMovedShape(line, 10, 5, PPU, [{ x: 2, y: 2 }]);
        expect(result.points).toEqual([{ x: 10, y: 5 }, { x: 100, y: 0 }]);
    });

    it('returns the same shape when no vertex is near a driving point', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(calculateMovedShape(line, 10, 5, PPU, [{ x: 500, y: 500 }])).toBe(line);
    });

    it('treats the 5px driving-point radius as exclusive', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(calculateMovedShape(line, 10, 5, PPU, [{ x: 5, y: 0 }])).toBe(line);
    });

    it('does not drive constrained shapes', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 0, y: 0 }], {
            constraint: { type: 'points_link', parentId: 'parent' }
        });
        expect(calculateMovedShape(point, 10, 5, PPU, [{ x: 0, y: 0 }])).toBe(point);
    });
});

describe('calculateRotatedShape', () => {
    it('adds the delta to the rotation without moving points around their own center', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
        const result = calculateRotatedShape(rect, 30, { x: 50, y: 25 }, false);
        expect(result.rotation).toBe(30);
        expect(result.points[0].x).toBeCloseTo(0);
        expect(result.points[0].y).toBeCloseTo(0);
        expect(result.points[1].x).toBeCloseTo(100);
        expect(result.points[1].y).toBeCloseTo(50);
    });

    it('accumulates onto an existing rotation', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 20 });
        const result = calculateRotatedShape(rect, 10, { x: 50, y: 25 }, false);
        expect(result.rotation).toBe(30);
    });

    it('snaps to 15° increments while shift is pressed', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 10 });
        expect(calculateRotatedShape(rect, 10, { x: 50, y: 25 }, true).rotation).toBe(15);
        expect(calculateRotatedShape(rect, -20, { x: 50, y: 25 }, true).rotation).toBe(-15);
    });

    it('translates points when rotating around an external center', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
        // Center (50,25) rotated 90° about the origin lands at (-25,50): shift (-75,+25)
        const result = calculateRotatedShape(rect, 90, { x: 0, y: 0 }, false);
        expect(result.rotation).toBe(90);
        expect(result.points[0].x).toBeCloseTo(-75);
        expect(result.points[0].y).toBeCloseTo(25);
        expect(result.points[1].x).toBeCloseTo(25);
        expect(result.points[1].y).toBeCloseTo(75);
    });

    it('preserves pressure values', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 10, y: 0, p: 0.7 }]);
        const result = calculateRotatedShape(point, 90, { x: 0, y: 0 }, false);
        expect(result.points[0].p).toBe(0.7);
    });
});