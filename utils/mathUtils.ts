import { Point, Shape, ShapeType } from '../types';

export const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const sub = (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y });

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
  // For standard shapes defined by 2 points (Rect, Square, Circle, Ellipse) or bounding box logic
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

export const getSnapPoint = (pos: Point, shapes: Shape[], excludeIds: string[] = []) => {
  // Simple grid snapping (20px)
  const gridSize = 20;
  const snapThreshold = 10;
  
  const gridX = Math.round(pos.x / gridSize) * gridSize;
  const gridY = Math.round(pos.y / gridSize) * gridSize;
  
  const dGrid = distance(pos, { x: gridX, y: gridY });
  
  if (dGrid < snapThreshold) {
      return { point: { x: gridX, y: gridY }, snapped: true };
  }
  
  return { point: pos, snapped: false };
};

export const getDetailedSnapPoints = (shape: Shape): Point[] => {
    // Simplified: return points and center
    return [...shape.points, getShapeCenter(shape.points)];
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
    
    // Check if any point of shape is inside rect
    return shape.points.some(p => p.x >= rLeft && p.x <= rRight && p.y >= rTop && p.y <= rBottom);
};

// --- Mathematical helpers for Operations ---

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
    
    // Law of cosines
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
    // Reconstruct C based on fixed side AB and angles A and B
    // Coordinates logic is complex, returning old point for safety in this stub
    // A proper implementation would rotate vector AB by angle A or -A depending on winding
    return oldPC; 
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
    // Bake rotation into points
    if (!s.rotation) return s;
    const center = getShapeCenter(s.points);
    const newPoints = s.points.map(p => rotatePoint(p, center, s.rotation));
    return { ...s, points: newPoints, rotation: 0 };
};

export const getAngleArcPath = (center: Point, p1: Point, p2: Point, radius: number): string => {
    // Simplified arc
    return ""; 
};

// --- Smoothing Algorithm ---

export const getSmoothSvgPath = (points: Point[]): string => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  
  // Use Quadratic Bezier curves to interpolate between points
  // Control point is the original point, end point is the midpoint of the segment
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const pNext = points[i + 1];
    
    // Midpoint between p1 and pNext
    const midX = (p1.x + pNext.x) / 2;
    const midY = (p1.y + pNext.y) / 2;
    
    // Curve from previous (implicit start) to mid using p1 as control
    d += ` Q ${p1.x} ${p1.y} ${midX} ${midY}`;
  }
  
  // Connect to the last point with a straight line from the last midpoint
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  
  return d;
};
