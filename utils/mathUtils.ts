
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

// Find intersection of Ray(p1, v1) and Ray(p2, v2)
// p + t*v
export const getLineIntersection = (p1: Point, v1: Point, p2: Point, v2: Point): Point | null => {
    const det = v1.x * v2.y - v1.y * v2.x;
    if (Math.abs(det) < 1e-6) return null; // Parallel

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const t = (dx * v2.y - dy * v2.x) / det;
    // const u = (dx * v1.y - dy * v1.x) / det;

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

    // For polygons, lines, etc. iterate segments
    for (let i = 0; i < shape.points.length - 1; i++) {
        const cp = getClosestPointOnSegment(p, shape.points[i], shape.points[i+1]);
        const d = distance(p, cp);
        if (d < minDist) {
            minDist = d;
            closest = cp;
        }
    }
    
    // Check closing segment for polygons/rects/tris
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

// --- Helper: Point in Polygon (Ray Casting) ---
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

// --- Rotation & Geometry Helpers (Moved up for use in hit testing) ---

export const getShapeCenter = (points: Point[], type?: ShapeType, fontSize?: number, text?: string): Point => {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    
    if (type === ShapeType.TEXT) {
        const fs = fontSize || 16;
        const w = (text || '').length * fs * 0.6;
        const h = fs;
        return { x: points[0].x + w/2, y: points[0].y + h/2 };
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
        } else if (type === ShapeType.RULER || type === ShapeType.PROTRACTOR) {
             // Basic bounding box logic for these tools
             const p0 = points[0];
             const p1 = points[1] || points[0];
             const minX = Math.min(p0.x, p1.x);
             const minY = Math.min(p0.y, p1.y);
             w = Math.abs(p1.x - p0.x);
             h = Math.abs(p1.y - p0.y);
             x = minX; y = minY;
        } else {
             const p0 = points[0];
             const p1 = points[1] || points[0];
             const minX = Math.min(p0.x, p1.x);
             const minY = Math.min(p0.y, p1.y);
             w = Math.abs(p1.x - p0.x);
             h = Math.abs(p1.y - p0.y);
             x = minX; y = minY;
        }
        corners = [
            { x: x, y: y },         
            { x: x + w, y: y },     
            { x: x + w, y: y + h }, 
            { x: x, y: y + h }      
        ];
    } else {
        corners = [...points];
    }

    if (rotation) {
        const center = getShapeCenter(points, type, fontSize, text);
        return corners.map(p => rotatePoint(p, center, rotation));
    }
    return corners;
};

// --- Hit Testing ---

export const isPointInShape = (p: Point, shape: Shape, canvasWidth?: number, canvasHeight?: number, ppu?: number): boolean => {
    const threshold = 10;
    
    // 0. Marker Detection
    if (shape.type === ShapeType.MARKER) {
        if (!shape.points || shape.points.length === 0) return false;
        const v = shape.points[0];
        const d = distance(p, v);
        // Hit zone: 15px to 35px radius annulus
        return d >= 15 && d <= 35; 
    }

    // 1. Function Graph Detection
    if (shape.type === ShapeType.FUNCTION_GRAPH) {
        if (!shape.formulaParams || !canvasWidth || !canvasHeight || !ppu) return false;
        const mPos = screenToMath(p, canvasWidth, canvasHeight, ppu);
        const expectedMY = evaluateQuadratic(mPos.x, shape.formulaParams, shape.functionForm);
        const expectedSP = mathToScreen({ x: mPos.x, y: expectedMY }, canvasWidth, canvasHeight, ppu);
        return Math.abs(expectedSP.y - p.y) < threshold;
    }

    // 2. Point Detection (Special Case)
    if (shape.type === ShapeType.POINT) {
         // Points hit test is simple radius check
         return distance(p, shape.points[0]) < Math.max(10, shape.strokeWidth + 5);
    }
    
    // 3. Rectangular Shapes Detection (Ruler, Rect, Square, Image, Protractor, Text)
    // We calculate the ACTUAL rotated corners on screen and check if the mouse point is inside that polygon.
    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.RULER, ShapeType.PROTRACTOR, ShapeType.TEXT].includes(shape.type)) {
        const corners = getRotatedCorners(shape);
        return isPointInPolygon(p, corners);
    }

    // 4. Path/Compass Detection
    // For these, we might still need to account for rotation if they were rotatable,
    // but Compass/Path are usually complex. We'll use the generic edge detection.
    if (shape.type === ShapeType.PATH) {
        if (shape.points && shape.points.length > 1) {
            // NOTE: If paths support rotation later, this needs `rotatePoint` logic or transforming the path.
            // Currently assuming paths (compass arcs) aren't arbitrarily rotated after creation via 'rotation' prop.
            const closest = getClosestPointOnShape(p, shape);
            return distance(p, closest) < threshold;
        }
        return false;
    }

    // 5. Circle/Ellipse Detection
    // For Circle, rotation doesn't change hit area (unless resized to ellipse, handled by Ellipse logic).
    if (shape.type === ShapeType.CIRCLE) {
         const center = getShapeCenter(shape.points);
         const width = Math.abs(shape.points[0].x - shape.points[1].x);
         const radius = width / 2;
         return distance(p, center) <= radius;
    }
    
    if (shape.type === ShapeType.ELLIPSE) {
        // For rotated ellipse hit testing, we either rotate point back or do complex math.
        // Since we are avoiding "rotate point back" per request preference for other shapes,
        // but Ellipse is NOT a polygon, we keep the original logic (or would need General Ellipse Eq).
        // However, user specifically asked about Ruler/Rect style selection.
        // For consistency with the "Don't rotate point back" request, we *could* approximate with a polygon
        // using getRotatedCorners (bounding box), but that includes empty corners.
        // Let's stick to the cleanest mathematical check for Ellipse which implies local space.
        // To respect "Minimal changes", we keep existing ellipse logic but it requires localP.
        // Since I removed localP global calculation, I will re-introduce localP LOCALLY just for Ellipse.
        const center = getShapeCenter(shape.points);
        let localP = p;
        if (shape.rotation) {
             localP = rotatePoint(p, center, -shape.rotation);
        }
        const rx = Math.abs(shape.points[0].x - shape.points[1].x) / 2;
        const ry = Math.abs(shape.points[0].y - shape.points[1].y) / 2;
        if (rx > 0 && ry > 0) {
            const val = Math.pow(localP.x - center.x, 2) / (rx * rx) + Math.pow(localP.y - center.y, 2) / (ry * ry);
            if (val <= 1) return true;
        }
        return false;
    }

    // 6. Polygon/Triangle Detection
    if ((shape.type === ShapeType.POLYGON || shape.type === ShapeType.TRIANGLE) && shape.points.length >= 3) {
        // Use rotated corners (which returns all points for polygons)
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;
    }

    // 7. General Edge Detection (Lines, Freehand, etc.)
    // For rotated lines, getRotatedCorners handles it if we treat it as polygon? No, Line is 1D.
    // We need to check distance to rotated segment.
    let pointsToCheck = shape.points;
    if (shape.rotation) {
         // Create temporary rotated points for hit testing
         const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
         pointsToCheck = shape.points.map(pt => rotatePoint(pt, center, shape.rotation));
    }
    
    // Standard edge distance check on (potentially rotated) points
    // Re-implement getClosestPointOnShape logic inline or create temp shape object
    const tempShape = { ...shape, points: pointsToCheck };
    const closest = getClosestPointOnShape(p, tempShape);
    return distance(p, closest) < threshold;
};

export const isShapeInRect = (shape: Shape, rect: { start: Point, end: Point }): boolean => {
    const xMin = Math.min(rect.start.x, rect.end.x);
    const xMax = Math.max(rect.start.x, rect.end.x);
    const yMin = Math.min(rect.start.y, rect.end.y);
    const yMax = Math.max(rect.start.y, rect.end.y);

    // Use Rotated Corners to ensure box selection works on what user sees
    const corners = getRotatedCorners(shape);
    if (corners.length > 0) {
        return corners.some(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
    }
    // Fallback for points
    if (shape.points) {
        return shape.points.some(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax);
    }
    return false;
};

// --- Snapping ---

export const getSnapPoint = (
    cursor: Point, 
    shapes: Shape[], 
    excludeIds: string[] = [],
    gridConfig?: { width: number; height: number; ppu: number }
): { point: Point; snapped: boolean; constraint?: any } => {
    const snapDist = 10;
    let closestPt = cursor;
    let minD = snapDist;
    let snapped = false;
    let constraint = null;

    for (const s of shapes) {
        if (excludeIds.includes(s.id)) continue;
        if (s.type === ShapeType.FUNCTION_GRAPH) continue; 
        if (s.type === ShapeType.MARKER) continue; // Don't snap to markers

        const pointsToCheck = s.points.length > 50 ? [s.points[0], s.points[s.points.length-1]] : s.points;

        for (const p of pointsToCheck) {
            const d = distance(cursor, p);
            if (d < minD) {
                minD = d;
                closestPt = p;
                snapped = true;
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
            minD = d;
            closestPt = gridPt;
            snapped = true;
            constraint = { type: 'grid' };
        }
    }

    return { point: closestPt, snapped, constraint };
};

export const getDetailedSnapPoints = (shape: Shape) => {
    if (shape.points) return shape.points;
    return [];
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

// --- Angles ---

export const getAngleDegrees = (center: Point, p: Point): number => {
    return Math.atan2(p.y - center.y, p.x - center.x) * (180 / Math.PI);
};

export const getAngleArcPath = (center: Point, start: Point, end: Point, radius: number): string => {
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    
    // Normalize to -PI to PI
    let diff = endAngle - startAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // We want the arc to always be positive sweep?
    // SVG Arc flags: rx ry x-axis-rotation large-arc-flag sweep-flag x y
    // sweep-flag 1 is positive angle direction
    
    const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;
    const sweepFlag = diff > 0 ? 1 : 0;
    
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

export const getPolygonAngles = (points: Point[]): (number | undefined)[] => {
    const angles: number[] = [];
    const n = points.length;
    
    for(let i=0; i<n; i++) {
        const pPrev = points[(i - 1 + n) % n];
        const pCurr = points[i];
        const pNext = points[(i + 1) % n];
        
        const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
        
        const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y);
        const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);
        
        if (mag1 === 0 || mag2 === 0) {
            angles.push(0); 
            continue;
        }

        const dot = v1.x * v2.x + v1.y * v2.y;
        let angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        angles.push(Math.round(angleRad * 180 / Math.PI));
    }
    return angles;
};

export const recalculateMarker = (marker: Shape, shapes: Shape[]): Shape | null => {
    if (!marker.markerConfig || marker.markerConfig.targets.length === 0) return null;
    const targetConfig = marker.markerConfig.targets[0];
    const targetShape = shapes.find(s => s.id === targetConfig.shapeId);
    if (!targetShape) return null;

    const corners = getRotatedCorners(targetShape);
    const indices = targetConfig.pointIndices;
    if (indices.length < 3) return null;

    const pPrev = corners[indices[0]];
    const pCurr = corners[indices[1]];
    const pNext = corners[indices[2]];

    if (!pPrev || !pCurr || !pNext) return null;

    // Vectors from center (curr)
    const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
    const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
    
    const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y);
    const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);
    
    if (mag1 === 0 || mag2 === 0) return null;

    // Calculate dynamic radius based on proportional size of legs
    // Min 15, Max 40, aiming for roughly 25% of the shortest leg length
    const minLeg = Math.min(mag1, mag2);
    const radius = Math.max(15, Math.min(40, minLeg * 0.25));

    // Unit vectors
    const u1 = { x: v1.x / mag1, y: v1.y / mag1 };
    const u2 = { x: v2.x / mag2, y: v2.y / mag2 };

    let pathData = "";

    if (marker.markerConfig.type === 'perpendicular') {
        // Draw rhombus (parallelogram) for right angle
        const p1 = { x: pCurr.x + u1.x * radius, y: pCurr.y + u1.y * radius };
        const p2 = { x: pCurr.x + u2.x * radius, y: pCurr.y + u2.y * radius };
        // Vector addition p1 + u2*radius OR p2 + u1*radius
        const p3 = { x: p1.x + u2.x * radius, y: p1.y + u2.y * radius }; 
        
        pathData = `M ${p1.x} ${p1.y} L ${p3.x} ${p3.y} L ${p2.x} ${p2.y}`;
    } else {
        // Default: angle_arc
        const rArc = radius + 5; // Slight offset for arc to look nice
        const start = { x: pCurr.x + u1.x * rArc, y: pCurr.y + u1.y * rArc };
        const end = { x: pCurr.x + u2.x * rArc, y: pCurr.y + u2.y * rArc };
        pathData = getAngleArcPath(pCurr, start, end, rArc);
    }

    return { ...marker, points: [pCurr], pathData };
};

// --- Freehand ---
export const getSmoothSvgPath = (points: Point[]): string => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
};

// Ramer-Douglas-Peucker simplification
const perpendicularDistance = (p: Point, lineStart: Point, lineEnd: Point) => {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) return distance(p, lineStart);

    const mag = Math.sqrt(dx*dx + dy*dy);
    return Math.abs(dy*p.x - dx*p.y + lineEnd.x*lineStart.y - lineEnd.y*lineStart.x) / mag;
};

const simplifyPoints = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const recResults1 = simplifyPoints(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyPoints(points.slice(index, end + 1), epsilon);
        return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
        return [points[0], points[end]];
    }
};

export const recognizeFreehandShape = (points: Point[]): RecognizedShape | null => {
    if (points.length < 2) return null;
    
    const p0 = points[0];
    const pLast = points[points.length - 1];
    const totalLen = distance(p0, pLast);

    // 1. OPEN SHAPE -> LINE
    // Threshold: 40px gap between start and end to consider it "Open"
    if (totalLen > 40) {
        return {
            type: ShapeType.LINE,
            points: [p0, pLast]
        };
    }

    // 2. CLOSED SHAPE
    
    // Calculate bounding box for fallback types
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const w = maxX - minX;
    const h = maxY - minY;
    // Standard bounding box points for Rect/Square/Circle/Ellipse in this app
    const bboxPoints = [{x: minX, y: minY}, {x: maxX, y: maxY}];
    const ratio = w > h ? w/h : h/w;
    
    // Check circularity to distinguish Round vs Angular
    const center = getShapeCenter(points);
    const radii = points.map(p => distance(p, center));
    const avgRadius = radii.reduce((a,b) => a+b, 0) / radii.length;
    const variance = radii.reduce((a,b) => a + Math.pow(b - avgRadius, 2), 0) / radii.length;
    const cv = Math.sqrt(variance) / avgRadius; // Coefficient of Variation

    // Detect Corners using RDP
    const corners = simplifyPoints(points, 20);
    // Remove duplicate end point if it closed the loop
    const uniqueCorners = [...corners];
    if (distance(uniqueCorners[0], uniqueCorners[uniqueCorners.length-1]) < 40) {
        uniqueCorners.pop();
    }
    
    // TRIANGLE (Strictly 3 corners)
    if (uniqueCorners.length === 3) {
         return { type: ShapeType.TRIANGLE, points: uniqueCorners };
    }

    // QUADRILATERAL (Strictly 4 corners)
    if (uniqueCorners.length === 4) {
         if (ratio < 1.2) return { type: ShapeType.SQUARE, points: bboxPoints };
         return { type: ShapeType.RECTANGLE, points: bboxPoints };
    }

    // ROUND (Circle/Ellipse) 
    // If CV is low (round), map to Circle or Ellipse based on aspect ratio.
    if (cv < 0.22) {
         if (ratio < 1.2) return { type: ShapeType.CIRCLE, points: bboxPoints };
         return { type: ShapeType.ELLIPSE, points: bboxPoints };
    }

    // FALLBACK -> RECTANGLE / SQUARE
    // Maps everything else (Quads, Pentagons, messy shapes) to a bounding box Rectangle/Square.
    // This eliminates POLYGON and FREEHAND types.
    if (ratio < 1.2) {
         return { type: ShapeType.SQUARE, points: bboxPoints };
    } else {
         return { type: ShapeType.RECTANGLE, points: bboxPoints };
    }
};

// --- Missing Exports (Stubs with Correct Types) ---

export const calculateTriangleAngles = (): number[] => [];
export const parseAngle = (): number => 0;
export const solveTriangleASA = (): Point[] => [];
export const getShapeSize = (): { width: number, height: number } => ({ width: 0, height: 0 });
export const getAngleCurve = (): string => "";
export const simplifyToQuadratic = (): any => null;
export const getShapeIntersection = (): Point[] => [];
export const resolveConstraints = (): void => {};
export const getProjectedPointOnLine = (): Point => ({ x: 0, y: 0 });
export const bakeRotation = (): void => {};
