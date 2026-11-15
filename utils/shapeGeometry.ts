import { Point, Shape, ShapeType } from '../types';
import { distance, getClosestPointOnSegment, rotatePoint } from './vectorMath';
import { screenToMath, mathToScreen } from './coordinates';
import { evaluateQuadratic } from './quadraticFunction';

export const getClosestPointOnShape = (p: Point, shape: Shape): Point => {
    if (!shape.points || shape.points.length === 0) return p;
    if (shape.points.length === 1) return shape.points[0];

    let minDist = Infinity;
    let closest = shape.points[0];

    for (let i = 0; i < shape.points.length - 1; i++) {
        const cp = getClosestPointOnSegment(p, shape.points[i], shape.points[i+1]);
        const d = distance(p, cp);
        if (d < minDist) {
            minDist = d;
            closest = cp;
        }
    }

    if ([ShapeType.POLYGON, ShapeType.TRIANGLE, ShapeType.RECTANGLE, ShapeType.SQUARE].includes(shape.type)) {
        const cp = getClosestPointOnSegment(p, shape.points[shape.points.length-1], shape.points[0]);
        const d = distance(p, cp);
        if (d < minDist) {
            minDist = d;
            closest = cp;
        }
    }

    return closest;
};

const isPointInPolygon = (p: Point, vertices: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x, yi = vertices[i].y;
        const xj = vertices[j].x, yj = vertices[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

export const getShapeCenter = (points: Point[], type?: ShapeType, fontSize?: number, text?: string): Point => {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (type === ShapeType.TEXT) {
        const fs = fontSize || 16;
        // Unified with getRotatedCorners: 0.8 factor
        const w = (text || '').length * fs * 0.8;
        const h = fs;
        return { x: points[0].x + w/2, y: points[0].y + h/2 };
    }
    if (type === ShapeType.TRIANGLE && points.length === 3) {
        return {
            x: (points[0].x + points[1].x + points[2].x) / 3,
            y: (points[0].y + points[1].y + points[2].y) / 3
        };
    }
    // Default for polygons, rectangles, squares, circles, ellipses
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

export const getRotatedCorners = (shape: Shape): Point[] => {
    const { type, points, rotation, fontSize, text } = shape;
    if (!points || points.length === 0) return [];

    let corners: Point[] = [];
    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TEXT, ShapeType.IMAGE, ShapeType.RULER, ShapeType.PROTRACTOR].includes(type)) {
        let x, y, w, h;
        if (type === ShapeType.TEXT) {
             x = points[0].x; y = points[0].y;
             const fs = fontSize || 16;
             const hasLatexMarker = text?.startsWith('$') && text?.endsWith('$');
             const hasLatexCommands = text?.includes('\\');
             const isLatex = text && (hasLatexMarker || hasLatexCommands);

             if (isLatex) {
                 w = Math.max(40, (text || '').length * fs * 1.0);
                 h = fs * 2.5;
                 y = y - fs * 0.9;
             } else {
                 w = Math.max(20, (text || '').length * fs * 0.8);
                 h = fs * 1.2;
                 y = y - fs * 0.1;
             }
        } else {
             const p0 = points[0];
             const p1 = points[1] || points[0];
             const minX = Math.min(p0.x, p1.x);
             const minY = Math.min(p0.y, p1.y);
             w = Math.abs(p1.x - p0.x);
             h = Math.abs(p1.y - p0.y);
             x = minX; y = minY;
        }
        corners = [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }];
    } else {
        corners = [...points];
    }
    if (rotation) {
        const center = getShapeCenter(points, type, fontSize, text);
        return corners.map(p => rotatePoint(p, center, rotation));
    }
    return corners;
};

export const isPointInShape = (
    p: Point,
    shape: Shape,
    canvasWidth?: number,
    canvasHeight?: number,
    ppu?: number,
    originY?: number,
    hitTolerance?: number
): boolean => {
    let threshold = hitTolerance !== undefined ? hitTolerance : 18;
    if (hitTolerance === undefined && shape.type === ShapeType.LINE) {
        threshold = 6;
    }

    if (shape.type === ShapeType.MARKER) {
        if (!shape.points || shape.points.length === 0) return false;
        const v = shape.points[0];
        const d = distance(p, v);
        return d >= 15 && d <= 35;
    }
    if (shape.type === ShapeType.FUNCTION_GRAPH) {
        if (!shape.formulaParams || !canvasWidth || !canvasHeight || !ppu) return false;
        if (ppu <= 0) return false;
        const mPos = screenToMath(p, canvasWidth, canvasHeight, ppu, originY);
        const fType = shape.functionType || 'quadratic';
        const expectedMY = evaluateQuadratic(mPos.x, shape.formulaParams, shape.functionForm, fType);
        const expectedSP = mathToScreen({ x: mPos.x, y: expectedMY }, canvasWidth, canvasHeight, ppu, originY);
        if (!isFinite(expectedSP.y)) return false;
        // Reduced tolerance for function graphs to avoid interfering with nearby shapes
        return Math.abs(expectedSP.y - p.y) < Math.min(threshold, 8);
    }
    if (shape.type === ShapeType.POINT) {
         return distance(p, shape.points[0]) < Math.max(10, shape.strokeWidth + 5 + (hitTolerance || 0));
    }

    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.RULER, ShapeType.PROTRACTOR, ShapeType.TEXT].includes(shape.type)) {
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;

        // Edge detection for near misses just outside the shape
        const tempShape = { ...shape, points: corners, type: ShapeType.POLYGON };
        const closest = getClosestPointOnShape(p, tempShape);
        return distance(p, closest) < threshold;
    }

    if (shape.type === ShapeType.CIRCLE) {
         const center = getShapeCenter(shape.points);
         // Visual radius is half of the width/height of the bounding box
         const radius = Math.abs(shape.points[1].x - shape.points[0].x) / 2;
         const d = distance(p, center);

         if (d <= radius + threshold/2) return true;
         return Math.abs(d - radius) < threshold;
    }

    if (shape.type === ShapeType.ELLIPSE) {
        const center = getShapeCenter(shape.points);
        let localP = p;
        if (shape.rotation) localP = rotatePoint(p, center, -shape.rotation);
        const rx = Math.abs(shape.points[0].x - shape.points[1].x) / 2;
        const ry = Math.abs(shape.points[0].y - shape.points[1].y) / 2;

        if (rx > 0 && ry > 0) {
            const val = Math.pow(localP.x - center.x, 2) / (rx * rx) + Math.pow(localP.y - center.y, 2) / (ry * ry);
            if (val <= 1) return true;
            // Edge check for ellipse
            const edgeThreshold = 0.15; // relative tolerance
            return Math.abs(val - 1) < edgeThreshold || distance(p, getClosestPointOnShape(p, shape)) < threshold;
        }
        return false;
    }

    if ((shape.type === ShapeType.POLYGON || shape.type === ShapeType.TRIANGLE) && shape.points.length >= 3) {
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;

        const tempShape = { ...shape, points: corners, type: ShapeType.POLYGON };
        const closest = getClosestPointOnShape(p, tempShape);
        return distance(p, closest) < threshold;
    }

    if (shape.type === ShapeType.PATH || shape.type === ShapeType.FREEHAND) {
        if (shape.points && shape.points.length > 1) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < shape.points.length; i++) {
                const pt = shape.points[i];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
            if (p.x < minX - threshold || p.x > maxX + threshold ||
                p.y < minY - threshold || p.y > maxY + threshold) {
                return false;
            }
            const closest = getClosestPointOnShape(p, shape);
            return distance(p, closest) < threshold;
        }
        return false;
    }

    let pointsToCheck = shape.points;
    if (shape.rotation) {
         const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
         pointsToCheck = shape.points.map(pt => rotatePoint(pt, center, shape.rotation));
    }
    const tempShape = { ...shape, points: pointsToCheck };
    const closest = getClosestPointOnShape(p, tempShape);
    return distance(p, closest) < threshold;
};

export const getPolygonAngles = (points: Point[]): number[] => {
    if (points.length < 3) return [];
    const angles = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const pPrev = points[(i - 1 + n) % n];
        const pCurr = points[i];
        const pNext = points[(i + 1) % n];
        const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 === 0 || mag2 === 0) { angles.push(0); continue; }
        let angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
        angles.push(Math.round(angle));
    }
    return angles;
};