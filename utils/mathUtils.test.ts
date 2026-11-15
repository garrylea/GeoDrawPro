import { describe, it, expect } from 'vitest';
import {
    recognizeFreehandShape, solveTriangleASA, getSnapPoint, isPointInShape,
    sanitizeLoadedShapes, snapToRuler, reflectPointAcrossLine, getPolygonAngles,
    getAngleArcPath, recalculateMarker, standardToVertex, vertexToStandard,
    getSmoothSvgPath, getVariableWidthPath, fitShapesToViewport,
    evaluateQuadratic, generateQuadraticPath, getPixelsPerUnit,
    screenToMath, mathToScreen, normalize, getProjectionParameter,
    getClosestPointOnShape, getShapeCenter
} from './mathUtils';
import { Shape, ShapeType, Point } from '../types';

const createShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: 'black', strokeWidth: 2, rotation: 0, ...overrides
});

const sampleClosedPolygon = (vertices: Point[], perEdge: number): Point[] => {
    const pts: Point[] = [];
    for (let e = 0; e < vertices.length; e++) {
        const a = vertices[e];
        const b = vertices[(e + 1) % vertices.length];
        for (let i = 0; i < perEdge; i++) {
            const t = i / perEdge;
            pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    pts.push({ ...vertices[0] });
    return pts;
};

const sampleClosedCurve = (n: number, at: (theta: number) => Point): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
        pts.push(at((i / n) * Math.PI * 2));
    }
    pts.push({ ...pts[0] });
    return pts;
};

describe('recognizeFreehandShape', () => {
    it('returns null for fewer than 5 points', () => {
        expect(recognizeFreehandShape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }])).toBeNull();
    });

    it('returns null for a tiny scribble smaller than 5px', () => {
        const pts = [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 102, y: 101 }, { x: 101, y: 102 }, { x: 100, y: 101 }, { x: 100, y: 100 }];
        expect(recognizeFreehandShape(pts)).toBeNull();
    });

    it('recognizes an open stroke as a line with the exact endpoints', () => {
        const pts: Point[] = [];
        for (let i = 0; i < 12; i++) {
            const t = i / 11;
            const jitter = i === 0 || i === 11 ? 0 : 3 * Math.sin(i * 2);
            pts.push({ x: 10 + 290 * t, y: 20 + 20 * t + jitter });
        }
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.LINE,
            points: [{ x: 10, y: 20 }, { x: 300, y: 40 }]
        });
    });

    it('recognizes a closed round stroke as a circle with its bounding box', () => {
        const pts = sampleClosedCurve(64, t => ({ x: 200 + 100 * Math.cos(t), y: 200 + 100 * Math.sin(t) }));
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.CIRCLE,
            points: [{ x: 100, y: 100 }, { x: 300, y: 300 }]
        });
    });

    it('still recognizes a hand-drawn circle with wobbly radius', () => {
        const pts = sampleClosedCurve(64, t => {
            const r = 100 + 4 * Math.sin(7 * t);
            return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) };
        });
        expect(recognizeFreehandShape(pts)?.type).toBe(ShapeType.CIRCLE);
    });

    it('recognizes a triangular stroke as a triangle with the 3 corners', () => {
        const pts = sampleClosedPolygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }], 15);
        const result = recognizeFreehandShape(pts);
        expect(result?.type).toBe(ShapeType.TRIANGLE);
        expect(result?.points).toHaveLength(3);
        expect(result?.points[0].x).toBeCloseTo(0);
        expect(result?.points[0].y).toBeCloseTo(0);
        expect(result?.points[1].x).toBeCloseTo(200);
        expect(result?.points[1].y).toBeCloseTo(0);
        expect(result?.points[2].x).toBeCloseTo(0);
        expect(result?.points[2].y).toBeCloseTo(200);
    });

    it('recognizes a rectangular stroke as a rectangle with its bounding box', () => {
        const pts = sampleClosedPolygon([{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 120 }, { x: 0, y: 120 }], 12);
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.RECTANGLE,
            points: [{ x: 0, y: 0 }, { x: 240, y: 120 }]
        });
    });

    it('recognizes an elongated closed blob as an ellipse with its bounding box', () => {
        const pts = sampleClosedCurve(96, t => ({ x: 250 + 200 * Math.cos(t), y: 250 + 80 * Math.sin(t) }));
        expect(recognizeFreehandShape(pts)).toEqual({
            type: ShapeType.ELLIPSE,
            points: [{ x: 50, y: 170 }, { x: 450, y: 330 }]
        });
    });

    it('forces a triangle from a concave dart via aggressive simplification', () => {
        // Fill ratio 0.4 (< 0.62) but 4 RDP vertices: the aggressive pass
        // collapses the concave notch and yields a 3-point triangle.
        const pts = sampleClosedPolygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 200 }], 20);
        const result = recognizeFreehandShape(pts);
        expect(result?.type).toBe(ShapeType.TRIANGLE);
        expect(result?.points).toHaveLength(3);
    });
});

describe('solveTriangleASA', () => {
    const angleAt = (vertex: Point, a: Point, b: Point): number => {
        const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
        const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
        const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
        return Math.acos(cos) * (180 / Math.PI);
    };

    it('solves an equilateral triangle on the same side as the current third point', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 60, { x: 50, y: 87 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 3);
        expect(result!.y).toBeCloseTo(86.6025, 3);
    });

    it('mirrors the solution when the third point is on the opposite side', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 60, { x: 50, y: -87 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 3);
        expect(result!.y).toBeCloseTo(-86.6025, 3);
    });

    it('solves a 90/45 right triangle', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 90, 45, { x: 0, y: 100 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(0, 3);
        expect(result!.y).toBeCloseTo(100, 3);
    });

    it('solves a 60/30 triangle', () => {
        const result = solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 60, 30, { x: 25, y: 44 });
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(25, 3);
        expect(result!.y).toBeCloseTo(43.3013, 3);
    });

    it('recovers the third vertex when given the triangle own angles', () => {
        const A = { x: 0, y: 0 }, B = { x: 100, y: 0 }, C = { x: 50, y: 80 };
        const result = solveTriangleASA(A, B, angleAt(A, B, C), angleAt(B, A, C), C);
        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(50, 4);
        expect(result!.y).toBeCloseTo(80, 4);
    });

    it('returns null when the two rays are parallel (angles sum to 180)', () => {
        expect(solveTriangleASA({ x: 0, y: 0 }, { x: 100, y: 0 }, 90, 90, { x: 50, y: 50 })).toBeNull();
    });

    it('returns null when the two base vertices coincide', () => {
        expect(solveTriangleASA({ x: 50, y: 50 }, { x: 50, y: 50 }, 60, 60, { x: 50, y: 100 })).toBeNull();
    });
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

describe('isPointInShape', () => {
    it('hits a filled ellipse interior and misses far outside', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }], { fill: 'blue' });
        expect(isPointInShape({ x: 200, y: 150 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 400, y: 150 }, ellipse)).toBe(false);
    });

    it('hits a transparent ellipse by its interior and edge', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 300, y: 200 }]);
        expect(isPointInShape({ x: 200, y: 120 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 300, y: 150 }, ellipse)).toBe(true);
        expect(isPointInShape({ x: 320, y: 150 }, ellipse)).toBe(false);
    });

    it('accounts for ellipse rotation', () => {
        const points = [{ x: 100, y: 100 }, { x: 300, y: 200 }];
        const rotated = createShape('e1', ShapeType.ELLIPSE, points, { fill: 'blue', rotation: 90 });
        const plain = createShape('e2', ShapeType.ELLIPSE, points, { fill: 'blue' });
        // (200,240) is inside the 90°-rotated ellipse but outside the unrotated one.
        expect(isPointInShape({ x: 200, y: 240 }, rotated)).toBe(true);
        expect(isPointInShape({ x: 200, y: 240 }, plain)).toBe(false);
    });

    it('rejects a degenerate ellipse with zero width', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{ x: 100, y: 100 }, { x: 100, y: 200 }], { fill: 'blue' });
        expect(isPointInShape({ x: 100, y: 150 }, ellipse)).toBe(false);
    });

    it('selects a polygon by its interior regardless of fill', () => {
        const polygon = createShape('p1', ShapeType.POLYGON, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
        expect(isPointInShape({ x: 50, y: 50 }, polygon)).toBe(true);
        expect(isPointInShape({ x: 50, y: 2 }, polygon)).toBe(true);
        expect(isPointInShape({ x: 50, y: 50 }, { ...polygon, fill: 'blue' })).toBe(true);
    });

    it('selects a triangle by its interior regardless of fill', () => {
        const triangle = createShape('t1', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
        expect(isPointInShape({ x: 20, y: 20 }, triangle)).toBe(true);
        expect(isPointInShape({ x: 2, y: 20 }, triangle)).toBe(true);
        expect(isPointInShape({ x: 20, y: 20 }, { ...triangle, fill: 'blue' })).toBe(true);
    });

    it('hit-tests a triangle against its rotated corners', () => {
        const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
        const rotated = createShape('t1', ShapeType.TRIANGLE, points, { fill: 'blue', rotation: 90 });
        const plain = createShape('t2', ShapeType.TRIANGLE, points, { fill: 'blue' });
        expect(isPointInShape({ x: 60, y: 80 }, rotated)).toBe(true);
        expect(isPointInShape({ x: 60, y: 80 }, plain)).toBe(false);
    });

    it('hits a path near its segments and respects the bounding box', () => {
        const path = createShape('pa1', ShapeType.PATH, [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]);
        expect(isPointInShape({ x: 50, y: 45 }, path)).toBe(true);
        expect(isPointInShape({ x: 50, y: 200 }, path)).toBe(false);
    });

    it('rejects paths with fewer than two points', () => {
        expect(isPointInShape({ x: 0, y: 0 }, createShape('pa1', ShapeType.PATH, [{ x: 0, y: 0 }]))).toBe(false);
        expect(isPointInShape({ x: 0, y: 0 }, createShape('pa2', ShapeType.PATH, []))).toBe(false);
    });

    it('hits a freehand stroke near its segments', () => {
        const freehand = createShape('f1', ShapeType.FREEHAND, [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]);
        expect(isPointInShape({ x: 50, y: 45 }, freehand)).toBe(true);
        expect(isPointInShape({ x: 50, y: 200 }, freehand)).toBe(false);
    });

    it('hit-tests a rotated line against its rotated endpoints', () => {
        const line = createShape('l1', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { rotation: 90 });
        // Rotated around (50,0): the line now runs vertically through x=50.
        expect(isPointInShape({ x: 52, y: 0 }, line)).toBe(true);
        expect(isPointInShape({ x: 100, y: 0 }, line)).toBe(false);
    });

    it('rejects a marker with no points', () => {
        expect(isPointInShape({ x: 0, y: 0 }, createShape('m1', ShapeType.MARKER, []))).toBe(false);
    });

    it('rejects function graphs without params or with invalid ppu', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }]);
        expect(isPointInShape({ x: 400, y: 300 }, graph, 800, 600, 40)).toBe(false);
        const withParams = { ...graph, functionType: 'linear' as const, formulaParams: { k: 1, b: 0 } };
        expect(isPointInShape({ x: 400, y: 300 }, withParams, 800, 600, 0)).toBe(false);
    });

    it('rejects a function graph whose evaluation is not finite', () => {
        const graph = createShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }], {
            functionType: 'linear', formulaParams: { k: Infinity, b: 0 }
        });
        expect(isPointInShape({ x: 440, y: 160 }, graph, 800, 600, 40, 200)).toBe(false);
    });

    it('hits LaTeX text using the taller latex bounds', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: '$x^2$', fontSize: 20 });
        // Latex box: y 82..132, x 100..200 (plus the 18px edge tolerance)
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
        expect(isPointInShape({ x: 150, y: 160 }, text)).toBe(false);
    });

    it('treats text with backslash commands as LaTeX', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: '\\frac{1}{2}', fontSize: 20 });
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
    });

    it('hits plain text inside its estimated box', () => {
        const text = createShape('t1', ShapeType.TEXT, [{ x: 100, y: 100 }], { text: 'Hello', fontSize: 20 });
        // Plain box: x 100..180, y 98..122 (plus the 18px edge tolerance)
        expect(isPointInShape({ x: 150, y: 100 }, text)).toBe(true);
        expect(isPointInShape({ x: 210, y: 100 }, text)).toBe(false);
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

describe('reflectPointAcrossLine', () => {
    it('reflects across the x-axis', () => {
        expect(reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 3, y: -4 });
    });

    it('reflects across the y-axis', () => {
        expect(reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: -3, y: 4 });
    });

    it('reflects across the diagonal y = x', () => {
        const r = reflectPointAcrossLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 10 });
        expect(r.x).toBeCloseTo(4);
        expect(r.y).toBeCloseTo(3);
    });

    it('reflects across an offset vertical line', () => {
        const r = reflectPointAcrossLine({ x: 2, y: 3 }, { x: 5, y: 0 }, { x: 5, y: 10 });
        expect(r.x).toBeCloseTo(8);
        expect(r.y).toBeCloseTo(3);
    });

    it('leaves a point on the line unchanged', () => {
        const r = reflectPointAcrossLine({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 });
        expect(r.x).toBeCloseTo(5);
        expect(r.y).toBeCloseTo(5);
    });

    it('returns the point unchanged for a degenerate line', () => {
        const p = { x: 3, y: 4 };
        expect(reflectPointAcrossLine(p, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual(p);
    });
});

describe('getPolygonAngles', () => {
    it('returns four right angles for a square', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]))
            .toEqual([90, 90, 90, 90]);
    });

    it('returns 90/45/45 for a right triangle', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toEqual([90, 45, 45]);
    });

    it('returns 60° for an equilateral triangle', () => {
        const angles = getPolygonAngles([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 86.6025 }]);
        angles.forEach(a => expect(a).toBe(60));
    });

    it('returns an empty array for fewer than three points', () => {
        expect(getPolygonAngles([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
    });

    it('reports 0 for a vertex duplicated with its neighbor', () => {
        const angles = getPolygonAngles([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]);
        expect(angles[1]).toBe(0);
    });
});

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

describe('standardToVertex / vertexToStandard', () => {
    it('converts standard form to vertex form', () => {
        expect(standardToVertex(1, -4, 3)).toEqual({ h: 2, k: -1 });
        expect(standardToVertex(2, 8, 5)).toEqual({ h: -2, k: -3 });
    });

    it('handles the degenerate a = 0 case', () => {
        expect(standardToVertex(0, 5, 7)).toEqual({ h: 0, k: 7 });
    });

    it('converts vertex form to standard form', () => {
        expect(vertexToStandard(1, 2, -1)).toEqual({ b: -4, c: 3 });
    });

    it('round-trips standard -> vertex -> standard', () => {
        const { h, k } = standardToVertex(2, 8, 5);
        const back = vertexToStandard(2, h, k);
        expect(back.b).toBeCloseTo(8);
        expect(back.c).toBeCloseTo(5);
    });

    it('round-trips vertex -> standard -> vertex', () => {
        const { b, c } = vertexToStandard(3, -1, 4);
        const back = standardToVertex(3, b, c);
        expect(back.h).toBeCloseTo(-1);
        expect(back.k).toBeCloseTo(4);
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

describe('evaluateQuadratic', () => {
    it('evaluates standard form', () => {
        expect(evaluateQuadratic(5, { a: 2, b: 3, c: 4 })).toBe(69);
    });

    it('defaults missing coefficients to a=1, b=0, c=0', () => {
        expect(evaluateQuadratic(3, {})).toBe(9);
    });

    it('evaluates vertex form', () => {
        expect(evaluateQuadratic(2, { a: 1, h: 1, k: 2 }, 'vertex')).toBe(3);
    });

    it('evaluates linear form using k as slope and b as intercept', () => {
        expect(evaluateQuadratic(2, { k: 3, b: 1 }, 'standard', 'linear')).toBe(7);
    });

    it('returns 0 for null params', () => {
        expect(evaluateQuadratic(5, null as any)).toBe(0);
    });
});

describe('generateQuadraticPath', () => {
    it('returns an empty string for invalid ppu', () => {
        expect(generateQuadraticPath({ a: 1 }, 'standard', 800, 600, 0)).toBe('');
    });

    it('draws a linear function across the extended viewport', () => {
        const d = generateQuadraticPath({ k: 1, b: 0 }, 'standard', 800, 600, 40, 'linear');
        expect(d).toBe('M -50 750 L 850 -150');
    });

    it('draws a quadratic as a polyline starting with a move', () => {
        const d = generateQuadraticPath({ a: 1, b: 0, c: 0 }, 'standard', 800, 600, 40);
        expect(d.startsWith('M ')).toBe(true);
        expect(d).toContain(' L ');
        expect(d).not.toContain('NaN');
    });

    it('returns an empty string when the whole curve is off-screen', () => {
        expect(generateQuadraticPath({ a: 1, b: 0, c: 10000 }, 'standard', 800, 600, 40)).toBe('');
    });
});

describe('coordinate helpers', () => {
    it('getPixelsPerUnit falls back to 40 for non-positive dimensions', () => {
        expect(getPixelsPerUnit(0, 600, 5)).toBe(40);
        expect(getPixelsPerUnit(800, -1, 5)).toBe(40);
    });

    it('getPixelsPerUnit targets half the smaller dimension over the tick count', () => {
        expect(getPixelsPerUnit(800, 600, 5)).toBe(60);
        expect(getPixelsPerUnit(800, 600, 0)).toBe(60);
    });

    it('getPixelsPerUnit clamps to the 20px minimum and half-dimension maximum', () => {
        expect(getPixelsPerUnit(100, 100, 5)).toBe(20);
        expect(getPixelsPerUnit(100, 100, 1)).toBe(50);
    });

    it('screenToMath returns the origin for non-positive ppu', () => {
        expect(screenToMath({ x: 100, y: 100 }, 800, 600, 0)).toEqual({ x: 0, y: 0 });
    });

    it('screenToMath and mathToScreen round-trip with a custom originY', () => {
        const screen = { x: 440, y: 160 };
        const math = screenToMath(screen, 800, 600, 40, 200);
        expect(math).toEqual({ x: 1, y: 1 });
        expect(mathToScreen(math, 800, 600, 40, 200)).toEqual(screen);
    });

    it('normalize returns the zero vector for zero length', () => {
        expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    });

    it('getProjectionParameter returns 0 for a degenerate segment', () => {
        expect(getProjectionParameter({ x: 5, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
    });

    it('getClosestPointOnShape handles empty and single-point shapes', () => {
        const p = { x: 9, y: 9 };
        expect(getClosestPointOnShape(p, createShape('s1', ShapeType.POLYGON, []))).toEqual(p);
        expect(getClosestPointOnShape(p, createShape('s2', ShapeType.POINT, [{ x: 1, y: 2 }]))).toEqual({ x: 1, y: 2 });
    });

    it('getClosestPointOnShape includes the closing edge of a polygon', () => {
        const square = createShape('s1', ShapeType.POLYGON, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
        expect(getClosestPointOnShape({ x: -5, y: 50 }, square)).toEqual({ x: 0, y: 50 });
    });

    it('getShapeCenter estimates a text center from length and font size', () => {
        expect(getShapeCenter([{ x: 100, y: 100 }], ShapeType.TEXT, 20, 'Hello')).toEqual({ x: 140, y: 110 });
    });
});