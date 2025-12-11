
import { Point, Shape, ShapeType, MarkerType } from '../types';

export interface RecognizedShape {
    type: ShapeType;
    points: Point[];
}

export const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const sub = (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y });
export const add = (p1: Point, p2: Point): Point => ({ x: p1.x + p2.x, y: p1.y + p2.y });
export const lerp = (p1: Point, p2: Point, t: number): Point => ({
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
});

// Returns the parameter t (0 to 1) of point p projected onto segment ab
export const getProjectionParameter = (p: Point, a: Point, b: Point): number => {
    const atob = { x: b.x - a.x, y: b.y - a.y };
    const atop = { x: p.x - a.x, y: p.y - a.y };
    const lenSq = atob.x * atob.x + atob.y * atob.y;
    if (lenSq === 0) return 0;
    let dot = atop.x * atob.x + atop.y * atob.y;
    return Math.min(1, Math.max(0, dot / lenSq));
};

export const getShapeCenter = (points: Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

export const rotatePoint = (point: Point, center: Point, angleDegrees: number): Point => {
  if (angleDegrees === 0) return point;
  const rad = (angleDegrees * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
};

export const getRotatedCorners = (shape: Shape): Point[] => {
  const center = getShapeCenter(shape.points);
  
  if (shape.type === ShapeType.TRIANGLE || shape.type === ShapeType.LINE || shape.type === ShapeType.FREEHAND) {
      if (!shape.rotation) return shape.points;
      return shape.points.map(p => rotatePoint(p, center, shape.rotation));
  }

  const xs = shape.points.map(p => p.x);
  const ys = shape.points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const corners = [
    { x: minX, y: minY }, // TL
    { x: maxX, y: minY }, // TR
    { x: maxX, y: maxY }, // BR
    { x: minX, y: maxY }, // BL
  ];

  if (!shape.rotation) return corners;
  return corners.map(p => rotatePoint(p, center, shape.rotation));
};

export const getDetailedSnapPoints = (shape: Shape): Point[] => {
    let points: Point[] = [];
    if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.PROTRACTOR].includes(shape.type)) {
        points = getRotatedCorners(shape);
    } else {
        points = shape.points;
    }
    return [...points, getShapeCenter(shape.points)];
};

export const getSnapPoint = (pos: Point, shapes: Shape[], excludeIds: string[] = []) => {
  const gridSize = 20;
  const snapThreshold = 5; 

  let bestDist = snapThreshold;
  let bestPoint = null;

  for (const shape of shapes) {
      if (excludeIds.includes(shape.id)) continue;
      
      const candidates = getDetailedSnapPoints(shape);
      
      for (const pt of candidates) {
          const d = distance(pos, pt);
          if (d < bestDist) {
              bestDist = d;
              bestPoint = pt;
          }
      }
  }

  if (bestPoint) return { point: bestPoint, snapped: true };

  const gridX = Math.round(pos.x / gridSize) * gridSize;
  const gridY = Math.round(pos.y / gridSize) * gridSize;
  const dGrid = distance(pos, { x: gridX, y: gridY });
  
  if (dGrid < snapThreshold) {
      return { point: { x: gridX, y: gridY }, snapped: true };
  }
  
  return { point: pos, snapped: false };
};

export const getShapeSize = (shape: Shape): number => {
    const xs = shape.points.map(p => p.x);
    const ys = shape.points.map(p => p.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

export const isShapeInRect = (shape: Shape, rect: { start: Point, end: Point }): boolean => {
    const rLeft = Math.min(rect.start.x, rect.end.x);
    const rRight = Math.max(rect.start.x, rect.end.x);
    const rTop = Math.min(rect.start.y, rect.end.y);
    const rBottom = Math.max(rect.start.y, rect.end.y);
    
    return shape.points.some(p => p.x >= rLeft && p.x <= rRight && p.y >= rTop && p.y <= rBottom);
};

export const getAngleDegrees = (p1: Point, p2: Point): number => {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
};

export const parseAngle = (val: string): number => {
    const f = parseFloat(val);
    return isNaN(f) ? 0 : f;
};

export const calculateTriangleAngles = (points: Point[]) => {
    if(points.length < 3) return { A: 0, B: 0, C: 0 };
    const pA = points[0], pB = points[1], pC = points[2];
    const a = distance(pB, pC);
    const b = distance(pA, pC);
    const c = distance(pA, pB);
    
    const A = Math.acos((b*b + c*c - a*a) / (2*b*c)) * (180 / Math.PI);
    const B = Math.acos((a*a + c*c - b*b) / (2*a*c)) * (180 / Math.PI);
    const C = 180 - A - B;
    
    return { 
        A: Math.round(A * 10) / 10, 
        B: Math.round(B * 10) / 10, 
        C: Math.round(C * 10) / 10 
    };
};

export const solveTriangleASA = (pA: Point, pB: Point, angleA: number, angleB: number, oldPC: Point): Point => {
    const rA = (angleA * Math.PI) / 180;
    const rB = (angleB * Math.PI) / 180;
    const rC = Math.PI - rA - rB;

    if (rC <= 0.001) return oldPC; 

    const c = distance(pA, pB);
    const b = (c * Math.sin(rB)) / Math.sin(rC);

    const thetaAB = Math.atan2(pB.y - pA.y, pB.x - pA.x);
    const thetaAC1 = thetaAB + rA;
    const thetaAC2 = thetaAB - rA;

    const C1 = {
        x: pA.x + b * Math.cos(thetaAC1),
        y: pA.y + b * Math.sin(thetaAC1)
    };

    const C2 = {
        x: pA.x + b * Math.cos(thetaAC2),
        y: pA.y + b * Math.sin(thetaAC2)
    };

    return distance(C1, oldPC) < distance(C2, oldPC) ? C1 : C2;
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

export const bakeRotation = (s: Shape): Shape => {
    if (!s.rotation) return s;
    const center = getShapeCenter(s.points);
    const newPoints = s.points.map(p => rotatePoint(p, center, s.rotation));
    return { ...s, points: newPoints, rotation: 0 };
};

export const getAngleArcPath = (center: Point, p1: Point, p2: Point, radius: number): string => {
    const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    
    let diff = angle2 - angle1;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    
    const startX = center.x + radius * Math.cos(angle1);
    const startY = center.y + radius * Math.sin(angle1);
    const endX = center.x + radius * Math.cos(angle1 + diff);
    const endY = center.y + radius * Math.sin(angle1 + diff);

    const sweepFlag = diff > 0 ? 1 : 0;
    const largeArcFlag = 0; 
    
    return `M ${center.x} ${center.y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY} Z`;
};

export const getAngleCurve = (center: Point, p1: Point, p2: Point, radius: number): string => {
    const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    
    let diff = angle2 - angle1;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    
    const startX = center.x + radius * Math.cos(angle1);
    const startY = center.y + radius * Math.sin(angle1);
    const endX = center.x + radius * Math.cos(angle1 + diff);
    const endY = center.y + radius * Math.sin(angle1 + diff);

    const sweepFlag = diff > 0 ? 1 : 0;
    const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
};

export const getSmoothSvgPath = (points: Point[]): string => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const pNext = points[i + 1];
    const midX = (p1.x + pNext.x) / 2;
    const midY = (p1.y + pNext.y) / 2;
    d += ` Q ${p1.x} ${p1.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
};

export const simplifyToQuadratic = (points: Point[]): Point[] => {
    if (points.length <= 3) return points;
    const start = points[0];
    const end = points[points.length - 1];
    let maxDist = -1;
    let apexIndex = -1;
    const A = start.y - end.y;
    const B = end.x - start.x;
    const C = start.x * end.y - end.x * start.y;
    const denominator = Math.sqrt(A*A + B*B);
    if (denominator === 0) return [start, end];
    for (let i = 1; i < points.length - 1; i++) {
        const p = points[i];
        const dist = Math.abs(A * p.x + B * p.y + C) / denominator;
        if (dist > maxDist) {
            maxDist = dist;
            apexIndex = i;
        }
    }
    if (apexIndex !== -1) {
        return [start, points[apexIndex], end];
    }
    return [start, end];
};

export const simplifyPath = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) return points;
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const p = points[i];
        const p1 = points[0];
        const p2 = points[end];
        let d = 0;
        const norm = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
        if (norm === 0) {
            d = distance(p, p1);
        } else {
            d = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x) / Math.sqrt(norm);
        }
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    if (dmax > epsilon) {
        const recResults1 = simplifyPath(points.slice(0, index + 1), epsilon);
        const recResults2 = simplifyPath(points.slice(index, end + 1), epsilon);
        return [...recResults1.slice(0, recResults1.length - 1), ...recResults2];
    } else {
        return [points[0], points[end]];
    }
};

export const recognizeFreehandShape = (points: Point[]): RecognizedShape | null => {
    if (points.length < 10) return null; 
    const start = points[0];
    const end = points[points.length - 1];
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    
    const distStartEnd = distance(start, end);
    const perimeter = points.reduce((acc, p, i) => i === 0 ? 0 : acc + distance(points[i-1], p), 0);
    const diagonal = Math.sqrt(width*width + height*height);

    const lineSimplified = simplifyPath(points, 20);
    if (lineSimplified.length <= 3 && distStartEnd > diagonal * 0.75) {
        return { type: ShapeType.LINE, points: [start, end] };
    }

    const isClosed = distStartEnd < perimeter * 0.25;
    if (isClosed) {
        const epsilon = Math.max(10, diagonal * 0.04);
        const polySimplified = simplifyPath(points, epsilon);
        let corners = polySimplified.length;
        if (distance(polySimplified[0], polySimplified[corners-1]) < epsilon) {
            corners -= 1;
        }
        if (corners === 3) {
            return { type: ShapeType.TRIANGLE, points: [polySimplified[0], polySimplified[1], polySimplified[2]] };
        }
        if (corners === 4 || corners === 5) {
            const ratio = width / height;
            const isSquare = ratio > 0.85 && ratio < 1.15;
            return { type: isSquare ? ShapeType.SQUARE : ShapeType.RECTANGLE, points: [{ x: minX, y: minY }, { x: maxX, y: maxY }] };
        }
        const center = { x: minX + width/2, y: minY + height/2 };
        const distances = points.map(p => distance(p, center));
        const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((a, b) => a + Math.pow(b - avgRadius, 2), 0) / distances.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev / avgRadius < 0.22) {
            const size = (width + height) / 2;
            const r = size / 2;
            return { type: ShapeType.CIRCLE, points: [{ x: center.x - r, y: center.y - r }, { x: center.x + r, y: center.y + r }] };
        }
    }
    return null;
};

export const recalculateMarker = (marker: Shape, allShapes: Shape[]): Shape | null => {
    if (marker.type !== ShapeType.MARKER || !marker.markerConfig) return null;
    const { type, targets } = marker.markerConfig;
    let newPath = '';
    const getTargetPoints = (targetIdx: number): Point[] | null => {
        if (!targets[targetIdx]) return null;
        const parent = allShapes.find(s => s.id === targets[targetIdx].shapeId);
        if (!parent) return null;
        const corners = getRotatedCorners(parent);
        const indices = targets[targetIdx].pointIndices;
        return indices.map(i => corners[i % corners.length]);
    };

    if (type === 'perpendicular') {
        let pA: Point, pB: Point, pC: Point;
        if (targets.length === 1 && targets[0].pointIndices.length === 3) {
            const pts = getTargetPoints(0);
            if (!pts) return null;
            [pA, pB, pC] = pts;
        } else if (targets.length === 2) {
             const l1 = getTargetPoints(0);
             const l2 = getTargetPoints(1);
             if (!l1 || !l2) return null;
             const shared = l1.find(p1 => l2.some(p2 => distance(p1, p2) < 1));
             if (shared) {
                 pB = shared;
                 pA = l1.find(p => p !== shared) || l1[0];
                 pC = l2.find(p => p !== shared) || l2[0];
             } else {
                 return null;
             }
        } else {
            return null;
        }
        const size = 15;
        const angleBA = Math.atan2(pA.y - pB.y, pA.x - pB.x);
        const angleBC = Math.atan2(pC.y - pB.y, pC.x - pB.x);
        const d1 = { x: Math.cos(angleBA) * size, y: Math.sin(angleBA) * size };
        const d2 = { x: Math.cos(angleBC) * size, y: Math.sin(angleBC) * size };
        const p1 = { x: pB.x + d1.x, y: pB.y + d1.y };
        const p2 = { x: pB.x + d2.x, y: pB.y + d2.y };
        const p3 = { x: p1.x + d2.x, y: p1.y + d2.y };
        newPath = `M ${p1.x} ${p1.y} L ${p3.x} ${p3.y} L ${p2.x} ${p2.y}`;
    
    } else if (type === 'parallel_arrow') {
        const pts = getTargetPoints(0);
        if (!pts || pts.length < 2) return null;
        const p1 = pts[0];
        const p2 = pts[1];
        const mid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const arrowSize = 8;
        const tip = { x: mid.x + Math.cos(angle) * arrowSize, y: mid.y + Math.sin(angle) * arrowSize };
        const back = { x: mid.x - Math.cos(angle) * arrowSize, y: mid.y - Math.sin(angle) * arrowSize };
        const wingAngle1 = angle + Math.PI * 0.8; 
        const wingAngle2 = angle - Math.PI * 0.8;
        const wing1 = { x: tip.x + Math.cos(wingAngle1) * arrowSize, y: tip.y + Math.sin(wingAngle1) * arrowSize };
        const wing2 = { x: tip.x + Math.cos(wingAngle2) * arrowSize, y: tip.y + Math.sin(wingAngle2) * arrowSize };
        newPath = `M ${wing1.x} ${wing1.y} L ${tip.x} ${tip.y} L ${wing2.x} ${wing2.y} M ${back.x} ${back.y} L ${tip.x} ${tip.y}`;

    } else if (type === 'equal_tick') {
        const pts = getTargetPoints(0);
        if (!pts || pts.length < 2) return null;
        const p1 = pts[0];
        const p2 = pts[1];
        const mid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const perp = angle + Math.PI / 2;
        const size = 6;
        const t1 = { x: mid.x + Math.cos(perp) * size, y: mid.y + Math.sin(perp) * size };
        const t2 = { x: mid.x - Math.cos(perp) * size, y: mid.y - Math.sin(perp) * size };
        newPath = `M ${t1.x} ${t1.y} L ${t2.x} ${t2.y}`;

    } else if (type === 'angle_arc') {
        if (targets.length === 1 && targets[0].pointIndices.length === 3) {
             const [pA, pB, pC] = getTargetPoints(0)!;
             newPath = getAngleCurve(pB, pA, pC, 20);
             newPath += " " + getAngleCurve(pB, pA, pC, 25);
        }
    }

    if (newPath !== marker.pathData) {
        return { ...marker, pathData: newPath };
    }
    return null;
};

export const getClosestPointOnSegment = (p: Point, a: Point, b: Point): Point => {
    const t = getProjectionParameter(p, a, b);
    return lerp(a, b, t);
};

export const getClosestPointOnCircle = (p: Point, shape: Shape): Point => {
    const center = { 
        x: (shape.points[0].x + shape.points[1].x) / 2, 
        y: (shape.points[0].y + shape.points[1].y) / 2 
    };
    const rx = Math.abs(shape.points[1].x - shape.points[0].x) / 2;
    const ry = Math.abs(shape.points[1].y - shape.points[0].y) / 2;
    const radius = Math.min(rx, ry);
    
    const angle = Math.atan2(p.y - center.y, p.x - center.x);
    return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
    };
};

export const getClosestPointOnShape = (p: Point, shape: Shape): Point => {
    const corners = getRotatedCorners(shape);
    let bestPoint = corners[0];
    let minD = Infinity;
    
    for (let i = 0; i < corners.length; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % corners.length];
        
        if ((shape.type === ShapeType.LINE || shape.type === ShapeType.FREEHAND) && i === corners.length - 1) continue;

        const proj = getClosestPointOnSegment(p, p1, p2);
        const d = distance(p, proj);
        
        if (d < minD) {
            minD = d;
            bestPoint = proj;
        }
    }
    return bestPoint;
};
