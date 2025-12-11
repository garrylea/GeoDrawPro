
import { Point, Shape, ShapeType, MarkerType } from '../types';

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
  
  // If it's a triangle or line, the corners are the points themselves
  if (shape.type === ShapeType.TRIANGLE || shape.type === ShapeType.LINE || shape.type === ShapeType.FREEHAND) {
      if (!shape.rotation) return shape.points;
      return shape.points.map(p => rotatePoint(p, center, shape.rotation));
  }

  // For standard shapes defined by 2 points (Rect, Square, Circle, Ellipse)
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
    // Return all vertices plus the center point
    // For Box shapes, we want the calculated corners, not just the bounding box definition points
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
  // Reduced threshold from 10 to 5. 
  // This makes the "magnetic field" much smaller, allowing for precise positioning nearby without snapping.
  const snapThreshold = 5; 

  let bestDist = snapThreshold;
  let bestPoint = null;

  // 1. Priority: Snap to existing Shape Vertices first
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

  // 2. Secondary: Snap to Grid
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
    // Convert angles to radians
    const rA = (angleA * Math.PI) / 180;
    const rB = (angleB * Math.PI) / 180;
    const rC = Math.PI - rA - rB;

    if (rC <= 0.001) return oldPC; // Invalid triangle (sum >= 180 or nearly parallel)

    const c = distance(pA, pB);
    // Sine Rule: b / sin(B) = c / sin(C)  =>  b = c * sin(B) / sin(C)
    // b is the length of side AC
    const b = (c * Math.sin(rB)) / Math.sin(rC);

    // Calculate angle of vector AB
    const thetaAB = Math.atan2(pB.y - pA.y, pB.x - pA.x);

    // There are two possible directions for AC: (thetaAB + A) or (thetaAB - A)
    // We calculate both candidate points for C
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

    // To decide which candidate is correct, we choose the one closest to the old point C.
    // This preserves the current winding order/orientation of the triangle.
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
    // Bake rotation into points
    if (!s.rotation) return s;
    const center = getShapeCenter(s.points);
    const newPoints = s.points.map(p => rotatePoint(p, center, s.rotation));
    return { ...s, points: newPoints, rotation: 0 };
};

export const getAngleArcPath = (center: Point, p1: Point, p2: Point, radius: number): string => {
    // Standard wedge path (Line -> Arc -> Line -> Z)
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
    const largeArcFlag = 0; // Usually angles in simple polygons are < 180 for corners
    
    return `M ${center.x} ${center.y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY} Z`;
};

// Returns just the arc curve (Stroke), without connecting to center
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

export const simplifyToQuadratic = (points: Point[]): Point[] => {
    if (points.length <= 3) return points;

    const start = points[0];
    const end = points[points.length - 1];

    let maxDist = -1;
    let apexIndex = -1;

    // Line equation Ax + By + C = 0 derived from start/end
    const A = start.y - end.y;
    const B = end.x - start.x;
    const C = start.x * end.y - end.x * start.y;
    const denominator = Math.sqrt(A*A + B*B);

    if (denominator === 0) return [start, end];

    // Find point furthest from the chord
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

// --- Smart Shape Recognition ---

// Ramer-Douglas-Peucker algorithm for simplifying polyline
export const simplifyPath = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    // Find point furthest from the line segment [start, end]
    for (let i = 1; i < end; i++) {
        // Perpendicular distance calculation
        const p = points[i];
        const p1 = points[0];
        const p2 = points[end];
        
        let d = 0;
        const norm = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
        if (norm === 0) {
            d = distance(p, p1);
        } else {
            // |(y2-y1)x0 - (x2-x1)y0 + x2y1 - y2x1| / sqrt((y2-y1)^2 + (x2-x1)^2)
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

export interface RecognizedShape {
    type: ShapeType;
    points: Point[];
}

export const recognizeFreehandShape = (points: Point[]): RecognizedShape | null => {
    if (points.length < 10) return null; // Too few points to guess

    const start = points[0];
    const end = points[points.length - 1];
    
    // 1. Calculate Bounding Box
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

    // 2. Is it a Line?
    const lineSimplified = simplifyPath(points, 20);
    if (lineSimplified.length <= 3 && distStartEnd > diagonal * 0.75) {
        return { type: ShapeType.LINE, points: [start, end] };
    }

    // 3. Is it Closed? (Circle, Rect, Triangle)
    const isClosed = distStartEnd < perimeter * 0.25;
    
    if (isClosed) {
        // Dynamic epsilon logic: proportional to size. 
        // 4% of diagonal is a good balance for detecting corners in rough sketches.
        const epsilon = Math.max(10, diagonal * 0.04);
        const polySimplified = simplifyPath(points, epsilon);
        
        // Count corners. If shape is closed, first and last point are effectively same corner.
        // We ensure simplified path represents a closed loop for logic.
        let corners = polySimplified.length;
        if (distance(polySimplified[0], polySimplified[corners-1]) < epsilon) {
            corners -= 1; // Start/End merged
        }

        // --- POLYGON CHECKS FIRST ---
        // (Fixes issue where rough rectangles were identified as circles)
        
        if (corners === 3) {
            return { 
                type: ShapeType.TRIANGLE, 
                points: [polySimplified[0], polySimplified[1], polySimplified[2]] 
            };
        }
        
        if (corners === 4 || corners === 5) {
            // It's a Quadrilateral.
            // For standard "Smart Sketch", we convert to Axis-Aligned Bounding Box (Rect/Square)
            const ratio = width / height;
            const isSquare = ratio > 0.85 && ratio < 1.15;
            
            return { 
                type: isSquare ? ShapeType.SQUARE : ShapeType.RECTANGLE, 
                points: [{ x: minX, y: minY }, { x: maxX, y: maxY }]
            };
        }

        // --- CIRCLE CHECK SECOND ---
        // Only if it has many corners (or very few that didn't match poly), check for roundness
        
        const center = { x: minX + width/2, y: minY + height/2 };
        const distances = points.map(p => distance(p, center));
        const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((a, b) => a + Math.pow(b - avgRadius, 2), 0) / distances.length;
        const stdDev = Math.sqrt(variance);
        
        // Coefficient of variation.
        if (stdDev / avgRadius < 0.22) {
            const size = (width + height) / 2;
            const r = size / 2;
            return { 
                type: ShapeType.CIRCLE, 
                points: [{ x: center.x - r, y: center.y - r }, { x: center.x + r, y: center.y + r }] 
            };
        }
    }

    // Fallback: Return null (keep as freehand)
    return null;
};

// --- MARKER GEOMETRY CALCULATIONS ---

/**
 * Recalculates the geometry (pathData) of a marker shape based on its current targets.
 * Returns a NEW shape object if updates are needed, or null if dependencies are missing.
 */
export const recalculateMarker = (marker: Shape, allShapes: Shape[]): Shape | null => {
    if (marker.type !== ShapeType.MARKER || !marker.markerConfig) return null;
    
    const { type, targets } = marker.markerConfig;
    let newPath = '';
    
    // Helper to get actual points of a target
    const getTargetPoints = (targetIdx: number): Point[] | null => {
        if (!targets[targetIdx]) return null;
        const parent = allShapes.find(s => s.id === targets[targetIdx].shapeId);
        if (!parent) return null;
        
        // If parent is Box, we need rotated corners
        // For standard polygons (Tri/Line), corners = points.
        const corners = getRotatedCorners(parent);
        const indices = targets[targetIdx].pointIndices;
        
        // Map indices to actual corner points
        return indices.map(i => corners[i % corners.length]);
    };

    if (type === 'perpendicular') {
        // Needs 3 points forming a corner (A-B-C, B is vertex) OR intersection of 2 lines.
        let pA: Point, pB: Point, pC: Point;

        if (targets.length === 1 && targets[0].pointIndices.length === 3) {
            // Case 1: Single Shape Corner (e.g. Rectangle Corner or Triangle Corner)
            // indices [prev, curr, next]
            const pts = getTargetPoints(0);
            if (!pts) return null;
            [pA, pB, pC] = pts;
        } else if (targets.length === 2) {
             // Case 2: 2 Intersecting Lines
             const l1 = getTargetPoints(0);
             const l2 = getTargetPoints(1);
             if (!l1 || !l2) return null;
             
             // Check if any point is shared (connected lines)
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
        
        // Draw square at pB
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
        // Target is a segment (2 points)
        const pts = getTargetPoints(0);
        if (!pts || pts.length < 2) return null;
        
        const p1 = pts[0];
        const p2 = pts[1];
        const mid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        
        // Draw Arrow
        const arrowSize = 8;
        // Arrow pointing along the line
        const tip = { x: mid.x + Math.cos(angle) * arrowSize, y: mid.y + Math.sin(angle) * arrowSize };
        const back = { x: mid.x - Math.cos(angle) * arrowSize, y: mid.y - Math.sin(angle) * arrowSize };
        
        const wingAngle1 = angle + Math.PI * 0.8; // 144 deg
        const wingAngle2 = angle - Math.PI * 0.8;
        
        const wing1 = { x: tip.x + Math.cos(wingAngle1) * arrowSize, y: tip.y + Math.sin(wingAngle1) * arrowSize };
        const wing2 = { x: tip.x + Math.cos(wingAngle2) * arrowSize, y: tip.y + Math.sin(wingAngle2) * arrowSize };
        
        newPath = `M ${wing1.x} ${wing1.y} L ${tip.x} ${tip.y} L ${wing2.x} ${wing2.y} M ${back.x} ${back.y} L ${tip.x} ${tip.y}`;

    } else if (type === 'equal_tick') {
        // Target is a segment
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
             // Draw double arc
             newPath = getAngleCurve(pB, pA, pC, 20);
             newPath += " " + getAngleCurve(pB, pA, pC, 25);
        }
    }

    // Only update if path changed
    if (newPath !== marker.pathData) {
        return { ...marker, pathData: newPath };
    }
    return null;
};
