
import { Shape, ShapeType, Point } from '../types';
import { 
    isPointInShape, distance, getClosestPointOnShape, getRotatedCorners, 
    generateQuadraticPath, evaluateQuadratic, screenToMath, mathToScreen, 
    recalculateMarker 
} from './mathUtils';

/**
 * Determines which shape interacts with the cursor at a given position.
 * Handles priority sorting (Points > Lines > Areas) and size comparisons.
 */
export const getHitShape = (
    pos: Point, 
    shapesList: Shape[], 
    canvasWidth: number, 
    canvasHeight: number, 
    pixelsPerUnit: number
): Shape | null => {
    const hits = shapesList.filter(s => isPointInShape(pos, s, canvasWidth, canvasHeight, pixelsPerUnit));
    if (hits.length === 0) return null;

    return hits.sort((a, b) => {
        const getPriority = (s: Shape) => {
             if (s.type === ShapeType.POINT || s.type === ShapeType.MARKER) return 0;
             if (s.type === ShapeType.RULER || s.type === ShapeType.PROTRACTOR) return 1;
             if (s.type === ShapeType.LINE || s.type === ShapeType.PATH || s.type === ShapeType.FUNCTION_GRAPH || s.type === ShapeType.FREEHAND) return 2;
             if (s.type === ShapeType.TEXT) return 3;
             if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TRIANGLE, ShapeType.POLYGON].includes(s.type)) return 4;
             if (s.type === ShapeType.IMAGE) return 5;
             return 4;
        };

        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pa !== pb) return pa - pb;

        // Tie-breaker: Smaller object wins
        const getSize = (s: Shape) => {
             const corners = getRotatedCorners(s);
             if (corners.length === 0) return 0;
             let minX = corners[0].x, maxX = corners[0].x, minY = corners[0].y, maxY = corners[0].y;
             corners.forEach(p => {
                 minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                 minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
             });
             const w = maxX - minX;
             const h = maxY - minY;
             return w * h;
        };
        
        // Special case for lines: prefer closer distance if priorities match
        if (pa === 2) { 
             const da = distance(pos, getClosestPointOnShape(pos, a));
             const db = distance(pos, getClosestPointOnShape(pos, b));
             return da - db;
        }

        return getSize(a) - getSize(b);
    })[0];
};

/**
 * Calculates the new geometry of a shape when a specific handle is dragged (Resizing).
 */
export const calculateResizedShape = (
    shape: Shape,
    cursorPos: Point,
    handleIndex: number,
    isShiftPressed: boolean
): Shape => {
    if (shape.type === ShapeType.FREEHAND && handleIndex < 4) {
         const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
         const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), w = maxX - minX, h = maxY - minY;
         if (w === 0 || h === 0) return shape;
         
         const corners = [ { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY } ];
         const fixedPoint = corners[(handleIndex + 2) % 4];
         let targetPos = { ...cursorPos };

         if (isShiftPressed) { 
             const ratio = w / h;
             const dx = targetPos.x - fixedPoint.x;
             const dy = targetPos.y - fixedPoint.y; 
             if (Math.abs(dx) / Math.abs(dy) > ratio) { 
                 targetPos.y = fixedPoint.y + (dy > 0 ? Math.abs(dx) / ratio : -Math.abs(dx) / ratio); 
             } else { 
                 targetPos.x = fixedPoint.x + (dx > 0 ? Math.abs(dy) * ratio : -Math.abs(dy) * ratio); 
             } 
         }

         const nMinX = Math.min(fixedPoint.x, targetPos.x), nMinY = Math.min(fixedPoint.y, targetPos.y);
         const nW = Math.abs(targetPos.x - fixedPoint.x), nH = Math.abs(targetPos.y - fixedPoint.y);
         
         return { ...shape, points: shape.points.map(p => ({ x: nMinX + ((p.x - minX) / w) * nW, y: nMinY + ((p.y - minY) / h) * nH, p: p.p })) };
    }

    if (shape.type === ShapeType.TEXT) { 
        // Simple scale heuristic for text
        const center = shape.points[0]; 
        const dist = distance(center, cursorPos);
        return { ...shape, fontSize: Math.max(8, Math.round(dist / 2)) }; 
    }

    const isBoxShape = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.RULER].includes(shape.type);
    
    // Explicitly handle 2-point box shapes (Rectangle, Image, Square, Circle, Ellipse)
    if (isBoxShape && shape.points.length === 2) {
         const p0 = shape.points[0], p1 = shape.points[1];
         const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
         const minY = Math.min(p0.y, p1.y), maxY = Math.max(p0.y, p1.y);
         // Corners correspond to SelectionOverlay handles: 0:TL, 1:TR, 2:BR, 3:BL
         const corners = [ { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY } ];
         
         if (handleIndex >= 0 && handleIndex < 4) {
             const fixedPoint = corners[(handleIndex + 2) % 4]; 
             let targetPos = { ...cursorPos };
             
             if (shape.type === ShapeType.RULER) {
                 const currentHeight = Math.abs(p1.y - p0.y);
                 const sign = Math.sign(targetPos.y - fixedPoint.y) || 1;
                 return { ...shape, points: [fixedPoint, { x: targetPos.x, y: fixedPoint.y + sign * currentHeight }] };
             }
             
             // Ensure IMAGE is included in proportional scaling check
             if (isShiftPressed || shape.type === ShapeType.SQUARE || shape.type === ShapeType.CIRCLE || shape.type === ShapeType.IMAGE) { 
                 const w = maxX - minX, h = maxY - minY; 
                 if (w > 0 && h > 0) { 
                     const ratio = w / h;
                     const dx = targetPos.x - fixedPoint.x;
                     const dy = targetPos.y - fixedPoint.y; 
                     // Adjust targetPos to maintain aspect ratio
                     if (Math.abs(dx) / Math.abs(dy) > ratio) { 
                         targetPos.y = fixedPoint.y + (dy > 0 ? Math.abs(dx) / ratio : -Math.abs(dx) / ratio); 
                     } else { 
                         targetPos.x = fixedPoint.x + (dx > 0 ? Math.abs(dy) * ratio : -Math.abs(dy) * ratio); 
                     } 
                 } 
             }
             return { ...shape, points: [fixedPoint, targetPos] };
         }
    }

    // Default point dragging for Polygons, Lines, Triangles
    const newPoints = [...shape.points]; 
    if (handleIndex < newPoints.length) {
        newPoints[handleIndex] = cursorPos;
    }
    return { ...shape, points: newPoints };
};

/**
 * Calculates the new geometry of a shape when it is moved (translated).
 * Handles regular shapes and Function Graphs (updating algebraic parameters).
 * Optionally handles dragging dependent points (constraints).
 */
export const calculateMovedShape = (
    shape: Shape,
    dx: number,
    dy: number,
    pixelsPerUnit: number,
    canvasWidth: number,
    canvasHeight: number,
    drivingPoints: Point[] = []
): Shape => {
    // 1. Handle Function Graphs (Algebraic update)
    if (shape.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
        const dmx = dx / pixelsPerUnit;
        const dmy = -dy / pixelsPerUnit;
        
        const params = { ...shape.formulaParams };
        const fType = shape.functionType || 'quadratic';
        
        if (fType === 'linear') { 
            params.b = (params.b || 0) + dmy - (params.k || 1) * dmx; 
        } else { 
            if (shape.functionForm === 'vertex') { 
                params.h = (params.h || 0) + dmx; 
                params.k = (params.k || 0) + dmy; 
            } else { 
                // Standard form translation: y' = a(x-dx)^2 + b(x-dx) + c + dy
                // New b' = b - 2*a*dmx
                // New c' = c + a*dmx^2 - b*dmx + dmy
                const a = params.a ?? 1; 
                const b = params.b || 0; 
                const c = params.c || 0; 
                params.b = b - 2 * a * dmx; 
                params.c = c + a * Math.pow(dmx, 2) - b * dmx + dmy; 
            } 
        }
        
        const path = generateQuadraticPath(params, shape.functionForm || 'standard', canvasWidth, canvasHeight, pixelsPerUnit, fType);
        return { ...shape, formulaParams: params, pathData: path };
    }

    // 2. Handle Driving Points (Linked Geometry)
    // If this shape is NOT the one being explicitly dragged, but one of its points matches a "driving point"
    if (drivingPoints.length > 0 && !shape.constraint) { 
        const linkedPoints = shape.points.map(p => 
            drivingPoints.some(dp => Math.abs(dp.x - p.x) < 5.0 && Math.abs(dp.y - p.y) < 5.0) 
            ? { x: p.x + dx, y: p.y + dy, p: p.p } 
            : p
        ); 
        
        // If any point changed, return new shape
        if (linkedPoints.some((lp, i) => lp.x !== shape.points[i].x || lp.y !== shape.points[i].y)) {
            return { ...shape, points: linkedPoints }; 
        }
        return shape; // No points matched, return original
    }

    // 3. Standard Translation
    return { 
        ...shape, 
        points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p })) 
    };
};
