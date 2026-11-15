import { Point } from '../types';

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

export const getAngleDegrees = (p1: Point, p2: Point): number => {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
};

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