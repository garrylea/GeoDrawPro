
import { Point, Shape, ShapeType, MarkerType, Constraint } from '../types';

export interface RecognizedShape {
    type: ShapeType;
    points: Point[];
}

// --- Vector Math Helpers ---
export const normalize = (p: Point): Point => {
    const len = Math.sqrt(p.x * p.x + p.y * p.y);
    return len === 0 ? { x: 0, y: 0 } : { x: p.x / len, y: p.y / len };
};

export const rotateVector = (v: Point, rad: number): Point => {
    return {
        x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
        y: v.x * Math.sin(rad) + v.y * Math.cos(rad)
    };
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

// --- Geometric Constraint Solvers ---

/**
 * Solves for the 3rd point of a triangle given two angles and the side between them (ASA).
 * Used when a user edits an angle while another angle is already locked.
 * 
 * @param pFixed The vertex of the "Locked" angle (e.g., A)
 * @param pCurrent The vertex of the angle currently being edited (e.g., B)
 * @param angleFixedDeg The value of the locked angle (Angle A)
 * @param angleCurrentDeg The new value of the current angle (Angle B)
 * @param pThirdCurrent The current position of the 3rd point (C) - used for chirality/direction
 */
export const solveTriangleASA = (
    pFixed: Point, 
    pCurrent: Point, 
    angleFixedDeg: number, 
    angleCurrentDeg: number, 
    pThirdCurrent: Point
): Point | null => {
    // 1. Base Vector (Fixed -> Current)
    const vBase = { x: pCurrent.x - pFixed.x, y: pCurrent.y - pFixed.y };
    
    // 2. Determine Chirality (Handedness)
    // Is the triangle constructed clockwise or counter-clockwise?
    // Cross product of (Fixed->Current) x (Fixed->Third)
    const vSideOld = { x: pThirdCurrent.x - pFixed.x, y: pThirdCurrent.y - pFixed.y };
    const cross = crossProduct(vBase, vSideOld);
    
    // If cross > 0, Third is "Right/CCW" relative to Base (depending on coord system).
    // SVG coords: Y down. 
    // We use the sign to ensure we rotate the rays into the triangle's interior.
    const sign = cross >= 0 ? 1 : -1;

    // 3. Ray from Fixed Point (Angle A)
    // We rotate the base vector by the fixed angle to get direction towards C
    const radFixed = (angleFixedDeg * Math.PI / 180) * sign;
    const dirFixed = rotateVector(vBase, radFixed);

    // 4. Ray from Current Point (Angle B)
    // We need vector Current->Fixed first (inverse of Base)
    const vBaseInv = { x: -vBase.x, y: -vBase.y };
    // Rotate by -sign (opposite direction)
    const radCurrent = (angleCurrentDeg * Math.PI / 180) * (-sign);
    const dirCurrent = rotateVector(vBaseInv, radCurrent);

    // 5. Intersect the two rays
    return getLineIntersection(pFixed, dirFixed, pCurrent, dirCurrent);
};


export const getAngleDegrees = (p1: Point, p2: Point): number => {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
};

// --- Coordinate System Utilities ---
export const getPixelsPerUnit = (width: number, height: number, ticks: number) => {
    if (width <= 0 || height <= 0) return 40; 
    const minDimension = Math.min(width, height);
    const targetPPU = (minDimension / 2) / (ticks || 5);
    const minPPU = 20;
    const maxPPU = minDimension / 2; 
    return Math.min(Math.max(targetPPU, minPPU), Math.max(minPPU, maxPPU));
};

export const screenToMath = (p: Point, width: number, height: number, ppu: number, originY?: number): Point => {
    if (ppu <= 0) return { x: 0, y: 0 };
    const centerX = width / 2;
    const centerY = originY ?? (height / 2);
    return {
        x: (p.x - centerX) / ppu,
        y: -(p.y - centerY) / ppu 
    };
};

export const mathToScreen = (p: Point, width: number, height: number, ppu: number, originY?: number): Point => {
    const centerX = width / 2;
    const centerY = originY ?? (height / 2);
    return {
        x: centerX + p.x * ppu,
        y: centerY - p.y * ppu
    };
};

export const evaluateQuadratic = (
    x: number, 
    params: { a?: number; b?: number; c?: number; h?: number; k?: number }, 
    form: 'standard' | 'vertex' = 'standard',
    type: 'quadratic' | 'linear' = 'quadratic'
): number => {
    if (!params) return 0;
    if (type === 'linear') {
        const slope = params.k ?? 1;
        const intercept = params.b ?? 0;
        return slope * x + intercept;
    }
    if (form === 'vertex') {
        const h = params.h || 0;
        const k = params.k || 0; 
        const a = params.a ?? 1;
        return a * Math.pow(x - h, 2) + k;
    } else {
        const a = params.a ?? 1;
        const b = params.b || 0;
        const c = params.c || 0;
        return a * x * x + b * x + c;
    }
};

export const generateQuadraticPath = (
    params: { a?: number; b?: number; c?: number; h?: number; k?: number }, 
    form: 'standard' | 'vertex',
    width: number, 
    height: number, 
    ppu: number,
    type: 'quadratic' | 'linear' = 'quadratic',
    originY?: number
): string => {
    if (!ppu || ppu <= 0) return "";
    if (!params) params = { a: 1, b: 0, c: 0, k: 1 };

    const centerY = originY ?? (height / 2);

    if (type === 'linear') {
        const minScreenX = -50;
        const maxScreenX = width + 50;
        const mx1 = (minScreenX - (width / 2)) / ppu;
        const my1 = evaluateQuadratic(mx1, params, form, 'linear');
        const sy1 = centerY - my1 * ppu;
        const mx2 = (maxScreenX - (width / 2)) / ppu;
        const my2 = evaluateQuadratic(mx2, params, form, 'linear');
        const sy2 = centerY - my2 * ppu;
        if (!isFinite(sy1) || !isFinite(sy2)) return "";
        return `M ${minScreenX} ${sy1} L ${maxScreenX} ${sy2}`;
    }

    const minScreenX = -50;
    const maxScreenX = width + 50;
    const pixelStep = 4; 
    let d = "";
    let first = true;

    for (let sx = minScreenX; sx <= maxScreenX; sx += pixelStep) {
        const mx = (sx - (width / 2)) / ppu;
        const my = evaluateQuadratic(mx, params, form, 'quadratic');
        const sy = centerY - my * ppu;
        if (!isFinite(sy) || sy < -height * 5 || sy > height * 5) {
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
             w = Math.max(20, (text || '').length * fs * 0.8);
             h = fs * 1.2; 
             y = y - fs * 0.1; 
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
        return Math.abs(expectedSP.y - p.y) < threshold;
    }
    if (shape.type === ShapeType.POINT) {
         return distance(p, shape.points[0]) < Math.max(10, shape.strokeWidth + 5 + (hitTolerance || 0));
    }
    
    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.RULER, ShapeType.PROTRACTOR, ShapeType.TEXT].includes(shape.type)) {
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;
        
        if (hitTolerance && hitTolerance > 0) {
            const tempShape = { ...shape, points: corners, type: ShapeType.POLYGON };
            const closest = getClosestPointOnShape(p, tempShape);
            return distance(p, closest) < threshold;
        }
        return false;
    }

    if (shape.type === ShapeType.CIRCLE) {
         const center = getShapeCenter(shape.points);
         const radius = distance(shape.points[0], shape.points[1]) / 2;
         const d = distance(p, center);
         if (d <= radius) return true;
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
        }
        if (hitTolerance && hitTolerance > 0) {
            const d = distance(p, center);
            const maxR = Math.max(rx, ry);
            return d < maxR + threshold;
        }
        return false;
    }

    if ((shape.type === ShapeType.POLYGON || shape.type === ShapeType.TRIANGLE) && shape.points.length >= 3) {
        const corners = getRotatedCorners(shape);
        if (isPointInPolygon(p, corners)) return true;
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

// --- New Exported Helper Functions ---

export const getSmoothSvgPath = (points: Point[], closed: boolean = false): string => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} Z`;
    
    let d = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        if (i === 1) {
            d += ` L ${mid.x} ${mid.y}`;
        } else {
            d += ` Q ${p0.x} ${p0.y} ${mid.x} ${mid.y}`;
        }
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    if (closed) d += ' Z';
    return d;
};

export const getVariableWidthPath = (points: Point[], baseWidth: number): string => {
    if (points.length < 2) return '';
    const leftPts: Point[] = [];
    const rightPts: Point[] = [];

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const width = Math.max(1, baseWidth * (p.p !== undefined ? p.p : 0.5) * 2);
        let tx, ty;
        if (i === 0) {
            tx = points[1].x - p.x;
            ty = points[1].y - p.y;
        } else if (i === points.length - 1) {
            tx = p.x - points[i - 1].x;
            ty = p.y - points[i - 1].y;
        } else {
            tx = points[i + 1].x - points[i - 1].x;
            ty = points[i + 1].y - points[i - 1].y;
        }
        const len = Math.sqrt(tx * tx + ty * ty);
        if (len === 0) { leftPts.push(p); rightPts.push(p); continue; }
        const nx = -ty / len;
        const ny = tx / len;
        leftPts.push({ x: p.x + nx * width, y: p.y + ny * width });
        rightPts.push({ x: p.x - nx * width, y: p.y - ny * width });
    }
    
    let d = `M ${leftPts[0].x} ${leftPts[0].y}`;
    for (let i = 1; i < leftPts.length; i++) {
        const p0 = leftPts[i - 1];
        const p1 = leftPts[i];
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        d += ` Q ${p0.x} ${p0.y} ${mid.x} ${mid.y}`;
    }
    d += ` L ${leftPts[leftPts.length - 1].x} ${leftPts[leftPts.length - 1].y}`;
    d += ` L ${rightPts[rightPts.length - 1].x} ${rightPts[rightPts.length - 1].y}`;
    for (let i = rightPts.length - 2; i >= 0; i--) {
        const p0 = rightPts[i + 1];
        const p1 = rightPts[i];
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        d += ` Q ${p0.x} ${p0.y} ${mid.x} ${mid.y}`;
    }
    d += ' Z';
    return d;
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

export const reflectPointAcrossLine = (p: Point, l1: Point, l2: Point): Point => {
    const dx = l2.x - l1.x;
    const dy = l2.y - l1.y;
    const den = dx * dx + dy * dy;
    if (den === 0) return p;
    const a = (dx * dx - dy * dy) / den;
    const b = 2 * dx * dy / den;
    const x = a * (p.x - l1.x) + b * (p.y - l1.y) + l1.x;
    const y = b * (p.x - l1.x) - a * (p.y - l1.y) + l1.y;
    return { x, y };
};

export const getAngleArcPath = (center: Point, p1: Point | null, p2: Point | null, radius: number, startAngle?: number, endAngle?: number): string => {
    let sAngle = startAngle;
    let eAngle = endAngle;

    if (p1 && p2 && sAngle === undefined) {
        sAngle = getAngleDegrees(center, p1);
        eAngle = getAngleDegrees(center, p2);
    }
    if (sAngle === undefined || eAngle === undefined) return '';

    const startRad = sAngle * Math.PI / 180;
    const endRad = eAngle * Math.PI / 180;
    const x1 = center.x + radius * Math.cos(startRad);
    const y1 = center.y + radius * Math.sin(startRad);
    const x2 = center.x + radius * Math.cos(endRad);
    const y2 = center.y + radius * Math.sin(endRad);
    
    let diff = eAngle - sAngle;
    while (diff < 0) diff += 360;
    while (diff >= 360) diff -= 360;
    const largeArc = diff > 180 ? 1 : 0;
    
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
};

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

export const recalculateMarker = (marker: Shape, allShapes: Shape[]): Shape | null => {
    if (!marker.markerConfig) return marker;
    const config = marker.markerConfig;
    const target = allShapes.find(s => s.id === config.targets[0].shapeId);
    if (!target) return null;
    const indices = config.targets[0].pointIndices;
    if (!indices || indices.length < 3) return marker;
    const p1 = target.points[indices[0]];
    const p2 = target.points[indices[1]]; 
    const p3 = target.points[indices[2]];
    if (!p1 || !p2 || !p3) return null;
    const len = 20; 
    const v1 = normalize(sub(p1, p2));
    const v2 = normalize(sub(p3, p2));
    const start = { x: p2.x + v1.x * len, y: p2.y + v1.y * len };
    const end = { x: p2.x + v2.x * len, y: p2.y + v2.y * len };
    
    if (config.type === 'perpendicular') {
        const mid = { x: start.x + v2.x * len, y: start.y + v2.y * len };
        const path = `M ${start.x} ${start.y} L ${mid.x} ${mid.y} L ${end.x} ${end.y}`;
        return { ...marker, points: [start], pathData: path };
    } else {
        const a1 = getAngleDegrees(p2, p1);
        const a2 = getAngleDegrees(p2, p3);
        const path = getAngleArcPath(p2, p1, p3, len, a1, a2);
        return { ...marker, points: [start], pathData: path };
    }
};

export const getSnapPoint = (
    pos: Point, 
    shapes: Shape[], 
    excludeIds: string[] = [], 
    gridConfig?: { width: number, height: number, ppu: number, originY?: number }
): { point: Point, snapped: boolean, constraint?: Constraint } => {
    let closestDist = 10; 
    let snapPt = pos;
    let snapped = false;
    let constraint: Constraint | undefined = undefined;

    if (gridConfig) {
        const { ppu } = gridConfig;
        const gx = Math.round(pos.x / ppu) * ppu;
        const gy = Math.round(pos.y / ppu) * ppu;
        if (Math.abs(gx - pos.x) < 5 && Math.abs(gy - pos.y) < 5) {
             snapPt = { x: gx, y: gy };
             closestDist = 5; 
             snapped = true;
        }
    }

    for (const shape of shapes) {
        if (excludeIds.includes(shape.id)) continue;
        if (shape.type === ShapeType.FUNCTION_GRAPH) {
             if (shape.formulaParams && gridConfig) {
                 const originY = gridConfig.originY ?? (gridConfig.height / 2);
                 const mp = screenToMath(pos, gridConfig.width, gridConfig.height, gridConfig.ppu, originY);
                 const fType = shape.functionType || 'quadratic';
                 const my = evaluateQuadratic(mp.x, shape.formulaParams, shape.functionForm, fType);
                 const sp = mathToScreen({ x: mp.x, y: my }, gridConfig.width, gridConfig.height, gridConfig.ppu, originY);
                 if (distance(pos, sp) < closestDist) {
                     snapPt = sp;
                     closestDist = distance(pos, sp);
                     snapped = true;
                     constraint = { type: 'on_path', parentId: shape.id, paramX: mp.x };
                 }
             }
             continue;
        }
        
        if (shape.points) {
            for (const p of shape.points) {
                const d = distance(pos, p);
                if (d < closestDist) {
                    snapPt = p;
                    closestDist = d;
                    snapped = true;
                    constraint = undefined; 
                }
            }
            if (shape.points.length >= 2) {
                for(let i=0; i<shape.points.length - 1; i++) {
                    const p1 = shape.points[i];
                    const p2 = shape.points[i+1];
                    const mid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
                    const d = distance(pos, mid);
                    if (d < closestDist) {
                        snapPt = mid;
                        closestDist = d;
                        snapped = true;
                        constraint = { type: 'on_path', parentId: shape.id }; 
                    }
                }
            }
        }
    }
    return { point: snapPt, snapped, constraint };
};

export const fitShapesToViewport = (shapes: Shape[], width: number, height: number): Shape[] => {
    if (shapes.length === 0) return shapes;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shapes.forEach(s => {
        s.points.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
    });
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return shapes;
    const padding = 50;
    const scaleX = (width - padding * 2) / contentW;
    const scaleY = (height - padding * 2) / contentH;
    const scale = Math.min(scaleX, scaleY);
    const contentCenterX = minX + contentW / 2;
    const contentCenterY = minY + contentH / 2;
    const viewportCenterX = width / 2;
    const viewportCenterY = height / 2;
    return shapes.map(s => ({
        ...s,
        points: s.points.map(p => ({
            x: viewportCenterX + (p.x - contentCenterX) * scale,
            y: viewportCenterY + (p.y - contentCenterY) * scale,
            p: p.p
        })),
        fontSize: s.fontSize ? s.fontSize * scale : undefined,
        strokeWidth: s.strokeWidth * scale
    }));
};

export const sanitizeLoadedShapes = (shapes: any[]): Shape[] => {
    return shapes.map(s => ({
        ...s,
        fill: s.fill || 'transparent',
        stroke: s.stroke || '#000000',
        strokeWidth: s.strokeWidth || 1,
        strokeType: s.strokeType || 'solid',
        rotation: s.rotation || 0,
        points: s.points.map((p: any) => ({ x: Number(p.x), y: Number(p.y), p: p.p }))
    }));
};
