import { describe, it, expect } from 'vitest';
import { recognizeFreehandShape } from './freehandRecognition';
import { ShapeType, Point } from '../types';

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