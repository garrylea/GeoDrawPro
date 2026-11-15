import { Point, ShapeType } from '../types';
import { distance } from './vectorMath';

// Internal Helper for Douglas-Peucker: Distance from point to line segment squared
const getSqSegDist = (p: Point, p1: Point, p2: Point) => {
    let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
    if (dx !== 0 || dy !== 0) {
        const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) { x = p2.x; y = p2.y; }
        else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
};

// Internal Helper: Ramer-Douglas-Peucker Simplification
const simplifyDP = (points: Point[], sqTolerance: number): Point[] => {
    const len = points.length;
    if (len <= 2) return points;
    let maxSqDist = 0;
    let index = 0;
    for (let i = 1; i < len - 1; i++) {
        const sqDist = getSqSegDist(points[i], points[0], points[len - 1]);
        if (sqDist > maxSqDist) { maxSqDist = sqDist; index = i; }
    }
    if (maxSqDist > sqTolerance) {
        const res1 = simplifyDP(points.slice(0, index + 1), sqTolerance);
        const res2 = simplifyDP(points.slice(index), sqTolerance);
        return res1.slice(0, res1.length - 1).concat(res2);
    }
    return [points[0], points[len - 1]];
};

export const recognizeFreehandShape = (points: Point[]): { type: ShapeType, points: Point[] } | null => {
    if (points.length < 5) return null;

    // 1. Calculate Bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const width = maxX - minX;
    const height = maxY - minY;
    const maxDim = Math.max(width, height);
    if (maxDim < 5) return null;

    const p0 = points[0];
    const pLast = points[points.length - 1];
    const distEnd = Math.sqrt(Math.pow(p0.x - pLast.x, 2) + Math.pow(p0.y - pLast.y, 2));

    // 2. Line Check: If not closed
    if (distEnd > maxDim * 0.35) {
        return { type: ShapeType.LINE, points: [p0, pLast] };
    }

    // 3. Circularity Analysis
    // Calculate Centroid
    let cx = 0, cy = 0;
    points.forEach(p => { cx += p.x; cy += p.y; });
    cx /= points.length;
    cy /= points.length;

    // Calculate radii statistics
    let sumR = 0;
    let sumSqR = 0;
    points.forEach(p => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const r = Math.sqrt(dx*dx + dy*dy);
        sumR += r;
        sumSqR += r*r;
    });
    const avgR = sumR / points.length;
    const variance = (sumSqR / points.length) - (avgR * avgR);
    const stdDev = Math.sqrt(Math.max(0, variance));
    // Coefficient of variation: < 0.16 usually implies a circle drawn by hand
    const circleScore = avgR > 0 ? stdDev / avgR : 1;

    // 4. Area Analysis (Fill Ratio)
    let signedArea = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        signedArea += (p1.x * p2.y - p2.x * p1.y);
    }
    const polygonArea = Math.abs(signedArea) / 2;
    const boxArea = width * height;
    const fillRatio = boxArea > 0 ? polygonArea / boxArea : 0;

    // 5. RDP Simplification (Geometry count)
    const tolerance = Math.max(10, maxDim * 0.06);
    const simplified = simplifyDP(points, tolerance * tolerance);
    let vertices = [...simplified];
    // Remove duplicate end if closed
    if (vertices.length > 2 && distance(vertices[0], vertices[vertices.length - 1]) < tolerance) {
        vertices.pop();
    }
    const vCount = vertices.length;

    // --- DECISION TREE ---

    // A. CIRCLE DETECTOR
    // Requirement: Square-ish bounding box + low radius variance
    const aspectRatio = width / height;
    if (aspectRatio > 0.8 && aspectRatio < 1.25 && circleScore < 0.16) {
        return { type: ShapeType.CIRCLE, points: [{x: minX, y: minY}, {x: maxX, y: maxY}] };
    }

    // B. TRIANGLE DETECTOR
    // Low fill ratio (triangle is 0.5) OR explicitly 3 points
    if (fillRatio < 0.62 || vCount === 3) {
        // If we have way too many vertices but low ratio, force simplified triangle
        if (vertices.length !== 3) {
             const aggrSimple = simplifyDP(points, (maxDim * 0.15) ** 2);
             if (aggrSimple.length >= 3) {
                 vertices = aggrSimple.slice(0, 3);
             } else {
                 return { type: ShapeType.POLYGON, points: vertices };
             }
        }
        return { type: ShapeType.TRIANGLE, points: vertices };
    }

    // C. RECTANGLE DETECTOR
    // High fill ratio (rect is 1.0) OR explicitly 4 points
    if (fillRatio > 0.88 || vCount === 4) {
        return { type: ShapeType.RECTANGLE, points: [{x: minX, y: minY}, {x: maxX, y: maxY}] };
    }

    // D. ELLIPSE (Default for blobs that are not Circles)
    // The range 0.62 - 0.88 is typical for Ellipses/Circles.
    return { type: ShapeType.ELLIPSE, points: [{x: minX, y: minY}, {x: maxX, y: maxY}] };
};