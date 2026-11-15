import { Point } from '../types';
import { getAngleDegrees } from './vectorMath';

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
        // Apply a tapering effect at the ends (first and last 5 points)
        let taper = 1.0;
        if (i < 5) taper = 0.2 + (i / 5) * 0.8;
        else if (i > points.length - 6) taper = 0.2 + ((points.length - 1 - i) / 5) * 0.8;

        const width = Math.max(0.5, baseWidth * (p.p !== undefined ? p.p : 0.5) * 2 * taper);
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

    // Handle full circle
    if (Math.abs(diff) >= 360) {
         return `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${center.x - (x1 - center.x)} ${center.y - (y1 - center.y)} A ${radius} ${radius} 0 1 1 ${x1} ${y1}`;
    }

    const largeArc = Math.abs(diff) > 180 ? 1 : 0;
    const sweepFlag = diff > 0 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
};