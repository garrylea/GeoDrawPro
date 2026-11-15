import { describe, it, expect } from 'vitest';
import {
    getHitShape, getSelectionBounds, calculateResizedShape,
    calculateMovedShape, calculateRotatedShape, removeShapesWithDependents,
    fitShapesToViewport, sanitizeLoadedShapes
} from './shapeOperations';
import { getRotatedCorners } from './shapeGeometry';
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

    it('selects a point painted over the rectangle containing it', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }], { fill: 'blue' });
        const point = createShape('p1', ShapeType.POINT, [{ x: 50, y: 50 }], { fill: 'black' });
        expect(getHitShape({ x: 50, y: 50 }, [rect, point], W, H, PPU)).toBe(point);
    });

    it('selects a marker ring painted over the rectangle containing it', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 300, y: 300 }], { fill: 'blue' });
        const marker = createShape('m1', ShapeType.MARKER, [{ x: 100, y: 100 }]);
        expect(getHitShape({ x: 125, y: 100 }, [rect, marker], W, H, PPU)).toBe(marker);
    });

    it('selects a smaller rectangle painted over a bigger one', () => {
        const big = createShape('big', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 200, y: 200 }], { fill: 'blue' });
        const small = createShape('small', ShapeType.RECTANGLE, [{ x: 40, y: 40 }, { x: 80, y: 80 }], { fill: 'red' });
        expect(getHitShape({ x: 60, y: 60 }, [big, small], W, H, PPU)).toBe(small);
    });

    it('selects a closer line painted over a farther one', () => {
        const near = createShape('near', ShapeType.LINE, [{ x: 0, y: 100 }, { x: 200, y: 100 }]);
        const far = createShape('far', ShapeType.LINE, [{ x: 0, y: 108 }, { x: 200, y: 108 }]);
        expect(getHitShape({ x: 100, y: 103 }, [far, near], W, H, PPU)).toBe(near);
    });

    it('selects text painted over the rectangle behind it', () => {
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

    it('selects a rectangle painted over an earlier point', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 50, y: 50 }], { fill: 'black' });
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }], { fill: 'blue' });
        expect(getHitShape({ x: 50, y: 50 }, [point, rect], W, H, PPU)).toBe(rect);
    });

    it('selects the later of two overlapping rectangles regardless of size', () => {
        const small = createShape('small', ShapeType.RECTANGLE, [{ x: 40, y: 40 }, { x: 80, y: 80 }], { fill: 'red' });
        const big = createShape('big', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 200, y: 200 }], { fill: 'blue' });
        expect(getHitShape({ x: 60, y: 60 }, [small, big], W, H, PPU)).toBe(big);
    });

    it('selects the later of two overlapping lines regardless of distance', () => {
        const near = createShape('near', ShapeType.LINE, [{ x: 0, y: 100 }, { x: 200, y: 100 }]);
        const far = createShape('far', ShapeType.LINE, [{ x: 0, y: 108 }, { x: 200, y: 108 }]);
        expect(getHitShape({ x: 100, y: 103 }, [near, far], W, H, PPU)).toBe(far);
    });

    it('selects a ruler over a point even when the point comes later', () => {
        const ruler = createShape('ruler', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 200, y: 40 }]);
        const point = createShape('p1', ShapeType.POINT, [{ x: 50, y: 20 }], { fill: 'black' });
        expect(getHitShape({ x: 50, y: 20 }, [ruler, point], W, H, PPU)).toBe(ruler);
    });

    it('selects the later of two overlapping rulers', () => {
        const first = createShape('r1', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 100, y: 40 }]);
        const second = createShape('r2', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 200, y: 80 }]);
        expect(getHitShape({ x: 50, y: 20 }, [first, second], W, H, PPU)).toBe(second);
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

describe('removeShapesWithDependents', () => {
    const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    const constrainedPoint = createShape('p1', ShapeType.POINT, [{ x: 50, y: 0 }], {
        constraint: { type: 'on_edge', parentId: 'r1', edgeIndex: 0, paramT: 0.5 }
    });
    const marker = createShape('m1', ShapeType.MARKER, [{ x: 0, y: 0 }], {
        markerConfig: { type: 'angle_arc', targets: [{ shapeId: 'r1', pointIndices: [0, 1, 2] }] }
    });
    const linkedLine = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 10, y: 10 }], {
        constraint: { type: 'points_link', parents: ['p1', null] }
    });
    const freePoint = createShape('p2', ShapeType.POINT, [{ x: 200, y: 200 }]);

    it('removes targeted shapes', () => {
        const result = removeShapesWithDependents([rect, freePoint], new Set(['r1']));
        expect(result.map(s => s.id)).toEqual(['p2']);
    });

    it('cascades to points constrained via parentId and attached markers', () => {
        const result = removeShapesWithDependents([rect, constrainedPoint, marker, freePoint], new Set(['r1']));
        expect(result.map(s => s.id)).toEqual(['p2']);
    });

    it('does not cascade through points_link parents[] (only parentId)', () => {
        const result = removeShapesWithDependents([constrainedPoint, linkedLine], new Set(['p1']));
        expect(result.map(s => s.id)).toEqual(['l1']);
    });

    it('keeps shapes whose parentId points to a surviving shape', () => {
        const result = removeShapesWithDependents([rect, constrainedPoint, marker], new Set(['p2']));
        expect(result.map(s => s.id)).toEqual(['r1', 'p1', 'm1']);
    });

    it('handles an empty id set and empty shapes', () => {
        expect(removeShapesWithDependents([rect], new Set())).toEqual([rect]);
        expect(removeShapesWithDependents([], new Set(['r1']))).toEqual([]);
    });
});

describe('sanitizeLoadedShapes', () => {
    it('fills in defaults and coerces string coordinates to numbers', () => {
        const raw = [{ id: 'p1', type: 'POINT', points: [{ x: '10', y: '20', p: 0.7 }] }];
        const result = sanitizeLoadedShapes(raw);
        expect(result).toEqual([{
            id: 'p1', type: 'POINT',
            fill: 'transparent', stroke: '#000000', strokeWidth: 1, strokeType: 'solid', rotation: 0,
            points: [{ x: 10, y: 20, p: 0.7 }]
        }]);
    });

    it('preserves explicitly provided style values', () => {
        const raw = [{
            id: 'r1', type: 'RECTANGLE', points: [{ x: 0, y: 0 }],
            fill: 'red', stroke: 'blue', strokeWidth: 3, strokeType: 'dashed', rotation: 45
        }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].fill).toBe('red');
        expect(result[0].stroke).toBe('blue');
        expect(result[0].strokeWidth).toBe(3);
        expect(result[0].strokeType).toBe('dashed');
        expect(result[0].rotation).toBe(45);
    });

    it('keeps extra fields such as text and formula params', () => {
        const raw = [{ id: 't1', type: 'TEXT', points: [{ x: 1, y: 2 }], text: 'hi', fontSize: 18 }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].text).toBe('hi');
        expect(result[0].fontSize).toBe(18);
    });

    it('returns an empty array unchanged', () => {
        expect(sanitizeLoadedShapes([])).toEqual([]);
    });

    it('coerces non-numeric coordinates to 0 instead of NaN', () => {
        const invalidValues = ['abc', undefined, null, NaN, Infinity, -Infinity, {}];
        for (const v of invalidValues) {
            const raw = [{ id: 'p1', type: 'POINT', points: [{ x: v, y: v }] }];
            const result = sanitizeLoadedShapes(raw);
            expect(result[0].points[0]).toEqual({ x: 0, y: 0 });
        }
    });

    it('keeps valid points and pressure when a sibling point is invalid', () => {
        const raw = [{
            id: 'l1', type: 'LINE',
            points: [{ x: 10, y: 20, p: 0.5 }, { x: 'oops', y: 30, p: 0.9 }]
        }];
        const result = sanitizeLoadedShapes(raw);
        expect(result[0].points).toEqual([
            { x: 10, y: 20, p: 0.5 },
            { x: 0, y: 30, p: 0.9 }
        ]);
    });
});

describe('fitShapesToViewport', () => {
    it('returns the same array when empty', () => {
        const shapes: Shape[] = [];
        expect(fitShapesToViewport(shapes, 800, 600)).toBe(shapes);
    });

    it('returns shapes unchanged when content has no extent', () => {
        const point = createShape('p1', ShapeType.POINT, [{ x: 10, y: 10 }]);
        expect(fitShapesToViewport([point], 800, 600)).toEqual([point]);
    });

    it('centers and scales content with 50px padding', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], {
            fontSize: 10, strokeWidth: 2
        });
        const result = fitShapesToViewport([rect], 800, 600);
        // scale = min(700/100, 500/50) = 7; content center (50,25) -> (400,300)
        expect(result[0].points[0]).toEqual({ x: 50, y: 125, p: undefined });
        expect(result[0].points[1]).toEqual({ x: 750, y: 475, p: undefined });
        expect(result[0].fontSize).toBe(70);
        expect(result[0].strokeWidth).toBe(14);
    });

    it('uses the limiting axis for tall content', () => {
        const rect = createShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 50, y: 200 }]);
        const result = fitShapesToViewport([rect], 800, 600);
        // scale = min(700/50, 500/200) = 2.5
        expect(result[0].points[0].x).toBeCloseTo(337.5);
        expect(result[0].points[0].y).toBeCloseTo(50);
    });

    it('preserves pressure values', () => {
        const freehand = createShape('f1', ShapeType.FREEHAND, [{ x: 0, y: 0, p: 0.3 }, { x: 100, y: 50, p: 0.9 }]);
        const result = fitShapesToViewport([freehand], 800, 600);
        expect(result[0].points[0].p).toBe(0.3);
        expect(result[0].points[1].p).toBe(0.9);
    });
});