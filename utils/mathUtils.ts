import { Point, Shape, ShapeType } from '../types';

export const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const sub = (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y });
export const add = (p1: Point, p2: Point): Point => ({ x: p1.x + p2.x, y: p1.y + p2.y });
export const mag = (p: Point): number => Math.sqrt(p.x * p.x + p.y * p.y);

// Calculate angle of line p1-p2 in degrees
export const getAngleDegrees = (p1: Point, p2: Point): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return 0;
    return Math.atan2(dy, dx) * 180 / Math.PI;
};

// Calculate the center of the bounding box/points
export const getShapeCenter = (points: Point[]): Point => {
    if (points.length === 0) return { x: 0, y: 0 };
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2
    };
};

// Rotate a point around a center by an angle (in degrees)
export const rotatePoint = (point: Point, center: Point, angleDeg: number): Point => {
    if (angleDeg === 0) return point;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos)
    };
};

// Get the actual world coordinates of the shape's corners (applying rotation)
export const getRotatedCorners = (shape: Shape): Point[] => {
    const { type, points, rotation } = shape;
    if (!points || points.length === 0) return [];

    const center = getShapeCenter(points);
    let corners: Point[] = [];

    if (type === ShapeType.TRIANGLE || type === ShapeType.LINE) {
        corners = points.map(p => rotatePoint(p, center, rotation || 0));
    } else {
        const p0 = points[0];
        const p1 = points[1] || p0;
        const minX = Math.min(p0.x, p1.x);
        const maxX = Math.max(p0.x, p1.x);
        const minY = Math.min(p0.y, p1.y);
        const maxY = Math.max(p0.y, p1.y);
        
        const baseCorners = [
            { x: minX, y: minY }, // TL
            { x: maxX, y: minY }, // TR
            { x: maxX, y: maxY }, // BR
            { x: minX, y: maxY }, // BL
        ];
        
        corners = baseCorners.map(p => rotatePoint(p, center, rotation || 0));
    }
    return corners;
};

// --- Reflection / Symmetry Utils ---

// Reflect a point across an infinite line defined by lineP1 and lineP2
// Uses Vector Projection Method: P_reflected = 2 * P_projected - P_original
export const reflectPointAcrossLine = (p: Point, lineP1: Point, lineP2: Point): Point => {
    const dx = lineP2.x - lineP1.x;
    const dy = lineP2.y - lineP1.y;
    
    // Length squared of the line segment
    const l2 = dx * dx + dy * dy;
    
    // Degenerate line check
    if (l2 === 0) return p; 

    // Calculate projection factor 't' of vector (lineP1->p) onto vector (lineP1->lineP2)
    // t = ( (p - lineP1) . (lineP2 - lineP1) ) / |lineP2 - lineP1|^2
    const t = ((p.x - lineP1.x) * dx + (p.y - lineP1.y) * dy) / l2;
    
    // Find the closest point (projection) on the infinite line
    const closestX = lineP1.x + t * dx;
    const closestY = lineP1.y + t * dy;

    // The reflected point is symmetric to p regarding the closest point.
    // P_reflected = Closest + (Closest - p) = 2 * Closest - p
    return {
        x: 2 * closestX - p.x,
        y: 2 * closestY - p.y
    };
};

// "Bake" the rotation into the points so rotation becomes 0.
export const bakeRotation = (shape: Shape): Shape => {
    if (!shape.rotation || shape.rotation === 0) return shape;
    
    const center = getShapeCenter(shape.points);
    const newPoints = shape.points.map(p => rotatePoint(p, center, shape.rotation));
    
    return { ...shape, points: newPoints, rotation: 0 };
};

// Helper to calculate expanded snap points for shapes
export const getDetailedSnapPoints = (shape: Shape): Point[] => {
    const { type, points, rotation } = shape;
    if (!points || points.length === 0) return [];

    let basePoints: Point[] = [];

    // For Rectangles and Squares: 4 corners + 4 midpoints
    if (type === ShapeType.RECTANGLE || type === ShapeType.SQUARE) {
        if (points.length < 2) basePoints = points;
        else {
            const p0 = points[0];
            const p1 = points[1] || p0;
            
            const minX = Math.min(p0.x, p1.x);
            const maxX = Math.max(p0.x, p1.x);
            const minY = Math.min(p0.y, p1.y);
            const maxY = Math.max(p0.y, p1.y);
            const midX = (minX + maxX) / 2;
            const midY = (minY + maxY) / 2;

            basePoints = [
                { x: minX, y: minY }, // Top Left
                { x: midX, y: minY }, // Top Mid
                { x: maxX, y: minY }, // Top Right
                { x: maxX, y: midY }, // Right Mid
                { x: maxX, y: maxY }, // Bottom Right
                { x: midX, y: maxY }, // Bottom Mid
                { x: minX, y: maxY }, // Bottom Left
                { x: minX, y: midY }, // Left Mid
            ];
        }
    }
    // For Circles and Ellipses: 8 points ON the circumference
    else if (type === ShapeType.CIRCLE || type === ShapeType.ELLIPSE) {
        if (points.length < 2) basePoints = points;
        else {
            const p0 = points[0];
            const p1 = points[1] || p0;
            
            const minX = Math.min(p0.x, p1.x);
            const maxX = Math.max(p0.x, p1.x);
            const minY = Math.min(p0.y, p1.y);
            const maxY = Math.max(p0.y, p1.y);
            
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const rx = (maxX - minX) / 2;
            const ry = (maxY - minY) / 2;

            const angles = [0, 45, 90, 135, 180, 225, 270, 315];
            
            basePoints = angles.map(deg => {
                const rad = (deg * Math.PI) / 180;
                return {
                    x: cx + rx * Math.cos(rad),
                    y: cy + ry * Math.sin(rad)
                };
            });
        }
    }
    // For Lines, Triangles, Points, Text
    else {
        basePoints = points;
    }

    // Apply Rotation to all calculated snap points
    if (rotation && rotation !== 0) {
        const center = getShapeCenter(points);
        return basePoints.map(p => rotatePoint(p, center, rotation));
    }

    return basePoints;
};

// Returns a snapped point or the original point if nothing is close
export const getSnapPoint = (
  currentPos: Point, 
  shapes: Shape[], 
  excludeShapeIds: string[], 
  threshold: number = 10
): { point: Point; snapped: boolean; snappedToShapeId?: string } => {
  let closestDist = threshold;
  let snapTarget: Point | null = null;
  let snappedId: string | undefined;

  for (const shape of shapes) {
    if (excludeShapeIds.includes(shape.id)) continue;

    const isPointShape = shape.type === ShapeType.POINT;
    // Points have stronger magnetism to help starting lines
    const attractionBonus = isPointShape ? 0.5 : 1.0; 

    // Use detailed snap points (corners + midpoints for boxes, perimeter for circles)
    const snapCandidates = getDetailedSnapPoints(shape);

    for (const pt of snapCandidates) {
      const d = distance(currentPos, pt) * attractionBonus;
      if (d < closestDist) {
        closestDist = d;
        snapTarget = { ...pt }; 
        snappedId = shape.id;
      }
    }
  }

  if (snapTarget) {
    return { point: snapTarget, snapped: true, snappedToShapeId: snappedId };
  }
  return { point: currentPos, snapped: false };
};

export const calculateTriangleAngles = (p: Point[]) => {
  if (p.length !== 3) return { A: 0, B: 0, C: 0 };
  const [A, B, C] = p;

  const distA = distance(B, C); 
  const distB = distance(A, C); 
  const distC = distance(A, B); 

  const radA = Math.acos((distB**2 + distC**2 - distA**2) / (2 * distB * distC));
  const radB = Math.acos((distA**2 + distC**2 - distB**2) / (2 * distA * distC));
  const radC = Math.acos((distA**2 + distB**2 - distC**2) / (2 * distA * distB));

  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  return {
    A: isNaN(radA) ? 0 : Math.round(toDeg(radA) * 10) / 10,
    B: isNaN(radB) ? 0 : Math.round(toDeg(radB) * 10) / 10,
    C: isNaN(radC) ? 0 : Math.round(toDeg(radC) * 10) / 10,
  };
};

export const parseAngle = (input: string): number => {
    const context: Record<string, number> = {
        alpha: 30,
        beta: 45,
        gamma: 60
    };
    let expr = input.toLowerCase();
    for(const [key, val] of Object.entries(context)) {
        expr = expr.replace(new RegExp(key, 'g'), String(val));
    }
    try {
        if (/[^0-9+\-*/().\s]/.test(expr)) return NaN;
        // eslint-disable-next-line no-new-func
        return new Function(`return ${expr}`)();
    } catch {
        return NaN;
    }
};

export const solveTriangleASA = (A: Point, B: Point, angleA: number, angleB: number, oldC: Point): Point => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const c = Math.sqrt(dx*dx + dy*dy);
    const baseAngle = Math.atan2(dy, dx); 
    
    // Determine orientation of current triangle
    const angleAC_current = Math.atan2(oldC.y - A.y, oldC.x - A.x);
    const diff = angleAC_current - baseAngle;
    // Normalize diff to -PI to PI
    const delta = Math.atan2(Math.sin(diff), Math.cos(diff));
    
    // If delta is positive, point C is "counter-clockwise" relative to vector AB
    const direction = delta >= 0 ? 1 : -1;

    const radA = (angleA * Math.PI) / 180;
    const radB = (angleB * Math.PI) / 180;
    const radC = Math.PI - radA - radB;

    if (radC <= 0.05) return oldC; // Degenerate triangle protection

    // Sine rule
    const b = (c * Math.sin(radB)) / Math.sin(radC);

    return {
        x: A.x + b * Math.cos(baseAngle + direction * radA), 
        y: A.y + b * Math.sin(baseAngle + direction * radA)
    };
};

export const getShapeSize = (shape: Shape): number => {
    if (shape.points.length < 2) return 0;
    const xs = shape.points.map(p => p.x);
    const ys = shape.points.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return Math.sqrt(w*w + h*h);
};

export const isPointInRect = (p: Point, r: {start: Point, end: Point}) => {
    const xMin = Math.min(r.start.x, r.end.x);
    const xMax = Math.max(r.start.x, r.end.x);
    const yMin = Math.min(r.start.y, r.end.y);
    const yMax = Math.max(r.start.y, r.end.y);
    return p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
}

export const isShapeInRect = (shape: Shape, r: {start: Point, end: Point}) => {
    // Strictly contained: All points must be inside
    return shape.points.every(p => isPointInRect(p, r));
}

// Generate SVG Path for an angle arc
export const getAngleArcPath = (center: Point, p1: Point, p2: Point, radius: number): string => {
    const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
    const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
    
    let diff = endAngle - startAngle;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    
    const startX = center.x + radius * Math.cos(startAngle);
    const startY = center.y + radius * Math.sin(startAngle);
    const endX = center.x + radius * Math.cos(endAngle);
    const endY = center.y + radius * Math.sin(endAngle);
    
    const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;
    const sweepFlag = diff > 0 ? 1 : 0;

    return `M ${center.x} ${center.y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY} Z`;
};