
import { Point, Shape, ShapeType, MarkerType } from '../types';

export interface RecognizedShape {
    type: ShapeType;
    points: Point[];
}

// --- Vector Math Helpers ---
export const normalize = (p: Point): Point => {
    const len = Math.sqrt(p.x * p.x + p.y * p.y);
    return len === 0 ? { x: 0, y: 0 } : { x: p.x / len, y: p.y / len };
};

export const crossProduct = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const dotProduct = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

export const getLineIntersection = (p1: Point, v1: Point, p2: Point, v2: Point): Point | null => {
    const det = v1.x * v2.y - v1.y * v2.x;
    if (Math.abs(det) < 1e-6) return null;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const t = (dx * v2.y - dy * v2.x) / det;
    return {
        x: p1.x + t * v1.x,
        y: p1.y + t * v1.y
    };
};

// --- Coordinate System Utilities ---
export const getPixelsPerUnit = (width: number, height: number, ticks: number) => {
    const maxDimension = Math.max(width, height) / 2;
    return (maxDimension * 0.9) / (ticks || 5);
};

export const screenToMath = (p: Point, width: number, height: number, ppu: number): Point => {
    const centerX = width / 2;
    const centerY = height / 2;
    return {
        x: (p.x - centerX) / ppu,
        y: -(p.y - centerY) / ppu 
    };
};

export const mathToScreen = (p: Point, width: number, height: number, ppu: number): Point => {
    const centerX = width / 2;
    const centerY = height / 2;
    return {
        x: centerX + p.x * ppu,
        y: centerY - p.y * ppu
    };
};

export const evaluateQuadratic = (x: number, params: { a: number; b: number; c: number; h?: number; k?: number }, form: 'standard' | 'vertex' = 'standard'): number => {
    if (form === 'vertex') {
        const h = params.h || 0;
        const k = params.k || 0;
        return params.a * Math.pow(x - h, 2) + k;
    } else {
        return params.a * x * x + params.b * x + params.c;
    }
};

export const generateQuadraticPath = (
    params: { a: number; b: number; c: number; h?: number; k?: number }, 
    form: 'standard' | 'vertex',
    width: number, 
    height: number, 
    ppu: number
): string => {
    const minScreenX = -50;
    const maxScreenX = width + 50;
    const pixelStep = 4; 
    let d = "";
    let first = true;

    for (let sx = minScreenX; sx <= maxScreenX; sx += pixelStep) {
        const mx = (sx - (width / 2)) / ppu;
        const my = evaluateQuadratic(mx, params, form);
        const sy = (height / 2) - my * ppu;
        
        if (sy < -height * 2 || sy > height * 2) {
            first = true;
            continue;
        }

        if (first) {
            d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
            first = false;
        } else {
            d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
    }
    return d;
};

// --- Basic Geometry ---
export const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const sub = (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y });
export const add = (p1: Point, p2: Point): Point => ({ x: p1.x + p2.x, y: p1.y + p2.y });
export const lerp = (p1: Point, p2: Point, t: number): Point => ({
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
});

export const getProjectionParameter = (p: Point, a: Point, b: Point): number => {
    const atob = { x: b.x - a.x, y: b.y - a.y };
    const atop = { x: p.x - a.x, y: p.y - a.y };
    const len2 = atob.x * atob.x + atob.y * atob.y;
    if (len2 === 0) return 0;
    return (atop.x * atob.x + atop.y * atob.y) / len2;
};

export const getClosestPointOnSegment = (p: Point, a: Point, b: Point): Point => {
    let t = getProjectionParameter(p, a, b);
    t = Math.max(0, Math.min(1, t));
    return lerp(a, b, t);
};

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
        const w = (text || '').length * fs * 0.6;
        const h = fs;
        return { x: points[0].x + w/2, y: points[0].y + h/2 };
    }
    if (type === ShapeType.TRIANGLE && points.length === 3) {
        return {
            x: (points[0].x + points[1].x + points[2].x) / 3,
            y: (points[0].y + points[1].y + points[2].y) / 3
        };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

export const rotatePoint = (point: Point, center: Point, angleDeg: number): Point => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos
    };
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
             w = (text || '').length * fs * 0.6;
             h = fs;
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

export const isPointInShape = (p: Point, shape: Shape, canvasWidth?: number, canvasHeight?: number, ppu?: number): boolean => {
    const threshold = 10;
    if (shape.type === ShapeType.MARKER) {
        if (!shape.points || shape.points.length === 0) return false;
        const v = shape.points[0];
        const d = distance(p, v);
        return d >= 15 && d <= 35; 
    }
    if (shape.type === ShapeType.FUNCTION_GRAPH) {
        if (!shape.formulaParams || !canvasWidth || !canvasHeight || !ppu) return false;
        const mPos = screenToMath(p, canvasWidth, canvasHeight, ppu);
        const expectedMY = evaluateQuadratic(mPos.x, shape.formulaParams, shape.functionForm);
        const expectedSP = mathToScreen({ x: mPos.x, y: expectedMY }, canvasWidth, canvasHeight, ppu);
        return Math.abs(expectedSP.y - p.y) < threshold;
    }
    if (shape.type === ShapeType.POINT) {
         return distance(p, shape.points[0]) < Math.max(10, shape.strokeWidth + 5);
    }
    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.RULER, ShapeType.PROTRACTOR, ShapeType.TEXT].includes(shape.type)) {
        const corners = getRotatedCorners(shape);
        return isPointInPolygon(p, corners);
    }
    if (shape.type === ShapeType.PATH) {
        if (shape.points && shape.points.length > 1) {
            const closest = getClosestPointOnShape(p, shape);
            return distance(p, closest) < threshold;
        }
        return false;
    }
    if (shape.type === ShapeType.CIRCLE) {
         const center = getShapeCenter(shape.points);
         const radius = distance(shape.points[0], shape.points[1]) / 2;
         return distance(p, center) <= radius;
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
        }
        return false;
    }
    if ((shape.type === ShapeType.POLYGON || shape.type === ShapeType.TRIANGLE) && shape.points.length >= 3) {
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;
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

export const isShapeInRect = (shape: Shape, rect: { start: Point, end: Point }): boolean => {
    const xMin = Math.min(rect.start.x, rect.end.x);
    const xMax = Math.max(rect.start.x, rect.end.x);
    const yMin = Math.min(rect.start.y, rect.end.y);
    const yMax = Math.max(rect.start.y, rect.end.y);
    const corners = getRotatedCorners(shape);
    if (corners.length > 0) {
        return corners.every(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
    }
    if (shape.points && shape.points.length > 0) {
        return shape.points.every(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
    }
    return false;
};

export const getSnapPoint = (
    cursor: Point, 
    shapes: Shape[], 
    excludeIds: string[] = [],
    gridConfig?: { width: number; height: number; ppu: number }
): { point: Point; snapped: boolean; constraint?: any } => {
    const snapDist = 5; 
    let closestPt = cursor;
    let minD = snapDist;
    let snapped = false;
    let constraint = null;
    for (const s of shapes) {
        if (excludeIds.includes(s.id)) continue;
        if (s.type === ShapeType.FUNCTION_GRAPH) continue; 
        if (s.type === ShapeType.MARKER) continue; 
        const pointsToCheck = s.points.length > 50 ? [s.points[0], s.points[s.points.length-1]] : s.points;
        for (const p of pointsToCheck) {
            const d = distance(cursor, p);
            if (d < minD) {
                minD = d; closestPt = p; snapped = true;
                constraint = { type: 'intersection', parents: [s.id] }; 
            }
        }
    }
    if (gridConfig) {
        const { width, height, ppu } = gridConfig;
        const centerX = width / 2;
        const centerY = height / 2;
        const gridX = centerX + Math.round((cursor.x - centerX) / ppu) * ppu;
        const gridY = centerY + Math.round((cursor.y - centerY) / ppu) * ppu;
        const gridPt = { x: gridX, y: gridY };
        const d = distance(cursor, gridPt);
        if (d < minD) {
            minD = d; closestPt = gridPt; snapped = true;
            constraint = { type: 'grid' };
        }
    }
    return { point: closestPt, snapped, constraint };
};

export const reflectPointAcrossLine = (p: Point, l1: Point, l2: Point): Point => {
    const dx = l2.x - l1.x;
    const dy = l2.y - l1.y;
    const a = (dx * dx - dy * dy) / (dx * dx + dy * dy);
    const b = 2 * dx * dy / (dx * dx + dy * dy);
    const x2 = a * (p.x - l1.x) + b * (p.y - l1.y) + l1.x;
    const y2 = b * (p.x - l1.x) - a * (p.y - l1.y) + l1.y;
    return { x: x2, y: y2 };
};

export const getAngleDegrees = (center: Point, p: Point): number => {
    return Math.atan2(p.y - center.y, p.x - center.x) * (180 / Math.PI);
};

export const getAngleArcPath = (center: Point, start: Point, end: Point, radius: number): string => {
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let diff = endAngle - startAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;
    const sweepFlag = diff > 0 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

export const getPolygonAngles = (points: Point[]): (number | undefined)[] => {
    const angles: (number | undefined)[] = [];
    const n = points.length;
    for(let i=0; i<n; i++) {
        const pP = points[(i - 1 + n) % n], pC = points[i], pN = points[(i + 1) % n];
        const v1 = { x: pP.x - pC.x, y: pP.y - pC.y }, v2 = { x: pN.x - pC.x, y: pN.y - pC.y };
        const m1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y), m2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);
        if (m1 === 0 || m2 === 0) { angles.push(0); continue; }
        const dot = v1.x * v2.x + v1.y * v2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * (180 / Math.PI);
        angles.push(Math.round(angle));
    }
    return angles;
};

export const getSmoothSvgPath = (points: Point[]): string => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
};

// --- Ramer-Douglas-Peucker simplification for better recognition ---
const simplifyPath = (points: Point[], tolerance: number): Point[] => {
    if (points.length <= 2) return points;
    
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    
    for (let i = 1; i < end; i++) {
        const d = distanceToLine(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    
    if (dmax > tolerance) {
        const res1 = simplifyPath(points.slice(0, index + 1), tolerance);
        const res2 = simplifyPath(points.slice(index), tolerance);
        return [...res1.slice(0, -1), ...res2];
    } else {
        return [points[0], points[end]];
    }
};

const distanceToLine = (p: Point, a: Point, b: Point): number => {
    const l2 = Math.pow(distance(a, b), 2);
    if (l2 === 0) return distance(p, a);
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    const projection = lerp(a, b, Math.max(0, Math.min(1, t)));
    return distance(p, projection);
};

export const recognizeFreehandShape = (points: Point[]): RecognizedShape | null => {
    if (points.length < 5) return null;

    // 1. Line Recognition (is it just a straight stroke?)
    const totalPathLen = points.reduce((acc, p, i) => i === 0 ? 0 : acc + distance(points[i-1], p), 0);
    const startEndDist = distance(points[0], points[points.length - 1]);
    if (totalPathLen / startEndDist < 1.15 && totalPathLen > 30) {
        return { type: ShapeType.LINE, points: [points[0], points[points.length - 1]] };
    }

    // 2. Closed Shape Pre-processing
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const w = maxX - minX, h = maxY - minY;
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    
    // 3. Circle/Ellipse Recognition (Radius variance check)
    const radii = points.map(p => distance(p, center));
    const avgRadius = radii.reduce((a, b) => a + b) / radii.length;
    const variance = radii.reduce((a, b) => a + Math.pow(b - avgRadius, 2), 0) / radii.length;
    const stdDev = Math.sqrt(variance);

    // If std deviation is low relative to radius, it's round
    if (stdDev / avgRadius < 0.15) {
        const ratio = w / h;
        const pts = [{ x: minX, y: minY }, { x: maxX, y: maxY }];
        if (Math.abs(1 - ratio) < 0.2) {
            return { type: ShapeType.CIRCLE, points: pts };
        } else {
            return { type: ShapeType.ELLIPSE, points: pts };
        }
    }

    // 4. Polygon Recognition (Triangle vs Rectangle)
    // Simplify the path significantly to find corners
    const corners = simplifyPath(points, Math.max(w, h) * 0.15);
    
    // Douglas-Peucker might leave a "close" point at the end, clean it
    const distinctCorners = corners.filter((p, i) => i === 0 || distance(p, corners[i-1]) > 20);
    
    // Check if it's effectively a triangle
    if (distinctCorners.length === 3 || (distinctCorners.length === 4 && distance(distinctCorners[0], distinctCorners[3]) < 50)) {
        return { type: ShapeType.TRIANGLE, points: distinctCorners.slice(0, 3) };
    }

    // 5. Fallback: Rectangle / Square
    const ratio = w / h;
    const pts = [{ x: minX, y: minY }, { x: maxX, y: maxY }];
    if (Math.abs(1 - ratio) < 0.15) {
        return { type: ShapeType.SQUARE, points: pts };
    }
    return { type: ShapeType.RECTANGLE, points: pts };
};

export const recalculateMarker = (marker: Shape, allShapes: Shape[]): Shape | null => {
    if (!marker.markerConfig) return null;
    const target = marker.markerConfig.targets[0];
    const parent = allShapes.find(s => s.id === target.shapeId);
    if (!parent) return null;
    const corners = getRotatedCorners(parent);
    const i = target.pointIndices[1];
    if (!corners[i]) return null;
    const pPrev = corners[target.pointIndices[0]], pCurr = corners[i], pNext = corners[target.pointIndices[2]];
    const v1 = normalize({ x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y }), v2 = normalize({ x: pNext.x - pCurr.x, y: pNext.y - pCurr.y });
    let pathData = "";
    if (marker.markerConfig.type === 'perpendicular') {
        const size = 15;
        const p1 = { x: pCurr.x + v1.x * size, y: pCurr.y + v1.y * size };
        const p3 = { x: pCurr.x + v2.x * size, y: pCurr.y + v2.y * size };
        const p2 = { x: p1.x + v2.x * size, y: p1.y + v2.y * size };
        pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`;
    } else {
        pathData = getAngleArcPath(pCurr, { x: pCurr.x + v1.x * 25, y: pCurr.y + v1.y * 25 }, { x: pCurr.x + v2.x * 25, y: pCurr.y + v2.y * 25 }, 25);
    }
    return { ...marker, points: [pCurr], pathData };
};

/**
 * Fits a collection of shapes into the specified viewport.
 * Scales all points proportionally and centers the resulting bounding box.
 */
export const fitShapesToViewport = (shapes: Shape[], canvasW: number, canvasH: number): Shape[] => {
    if (shapes.length === 0 || canvasW <= 0 || canvasH <= 0) return shapes;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    shapes.forEach(s => {
        s.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    });

    if (minX === Infinity) return shapes;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return shapes;

    // Proportional scale factor
    const padding = 0.8; 
    const scale = Math.min((canvasW * padding) / contentW, (canvasH * padding) / contentH);
    
    // We limit max up-scaling to avoid pixelated icons/text if the user opens a tiny diagram on a 4K screen.
    const finalScale = Math.min(scale, 1.5);
    
    // Center logic
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    const canvasCenterX = canvasW / 2;
    const canvasCenterY = canvasH / 2;

    const newShapes = shapes.map(s => {
        const newPoints = s.points.map(p => ({
            x: canvasCenterX + (p.x - contentCenterX) * finalScale,
            y: canvasCenterY + (p.y - contentCenterY) * finalScale
        }));

        return {
            ...s,
            points: newPoints,
            strokeWidth: Math.max(1, s.strokeWidth * finalScale),
            fontSize: s.fontSize ? Math.max(8, s.fontSize * finalScale) : s.fontSize
        };
    });

    // Final pass to fix markers which rely on absolute vertex positions
    return newShapes.map(s => {
        if (s.type === ShapeType.MARKER) {
            return recalculateMarker(s, newShapes) || s;
        }
        return s;
    });
};
