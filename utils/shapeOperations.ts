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
    pixelsPerUnit: number,
    originY?: number,
    hitTolerance?: number
): Shape | null => {
    const hits = shapesList.filter(s => isPointInShape(pos, s, canvasWidth, canvasHeight, pixelsPerUnit, originY, hitTolerance));
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
 * Calculates the bounding box for a set of selected shapes.
 */
export const getSelectionBounds = (shapes: Shape[], selectedIds: Set<string>) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasSelection = false;

    shapes.forEach(s => {
        if (selectedIds.has(s.id)) {
            hasSelection = true;
            const corners = getRotatedCorners(s);
            corners.forEach(p => {
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            });
        }
    });

    if (!hasSelection || minX === Infinity) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/**
 * Calculates the new geometry of a shape when a specific handle is dragged (Resizing).
 * Supports both individual shape resizing and group resizing (via groupBounds).
 */
export const calculateResizedShape = (
    shape: Shape,
    cursorPos: Point,
    handleIndex: number,
    isShiftPressed: boolean,
    groupBounds?: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }
): Shape => {
    // Determine if we are doing a box scale.
    // Group bounds presence forces box scaling logic for all included shapes.
    const isBoxScale = groupBounds !== undefined || [
        ShapeType.RECTANGLE, 
        ShapeType.SQUARE, 
        ShapeType.IMAGE, 
        ShapeType.CIRCLE, 
        ShapeType.ELLIPSE, 
        ShapeType.RULER, 
        ShapeType.PATH, 
        ShapeType.FREEHAND
    ].includes(shape.type);

    // Special Case: Single Text Element Resize (updates font size directly)
    if (!groupBounds && shape.type === ShapeType.TEXT) { 
        const center = shape.points[0]; 
        const dist = distance(center, cursorPos);
        return { ...shape, fontSize: Math.max(8, Math.round(dist / 2)) }; 
    }

    if (isBoxScale && handleIndex >= 0 && handleIndex < 4) {
         // Determine Bounds: either the Group's bounds or the Shape's own bounds
         let minX, maxX, minY, maxY, w, h;
         
         if (groupBounds) {
             ({ minX, maxX, minY, maxY, width: w, height: h } = groupBounds);
         } else {
             // Calculate Shape Bounds locally
             minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
             shape.points.forEach(p => {
                 minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                 minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
             });
             w = maxX - minX;
             h = maxY - minY;
         }
         
         if (w === 0 || h === 0) return shape;

         // Fixed Corner Map: 0(TL)->BR(2), 1(TR)->BL(3), 2(BR)->TL(0), 3(BL)->TR(1)
         // Note: handleIndex 0-3 comes from the SelectionOverlay (TL, TR, BR, BL)
         
         // Edges of the BOUNDING BOX
         const currentCorners = [
            {x: minX, y: minY}, // 0 TL
            {x: maxX, y: minY}, // 1 TR
            {x: maxX, y: maxY}, // 2 BR
            {x: minX, y: maxY}  // 3 BL
         ];
         
         const fixedIdx = (handleIndex + 2) % 4;
         const fixedPoint = currentCorners[fixedIdx];
         let targetPos = { ...cursorPos };

         // Aspect Ratio / Shift Lock Logic
         // If group bounds, we use group aspect ratio.
         if (isShiftPressed || (!groupBounds && [ShapeType.SQUARE, ShapeType.CIRCLE].includes(shape.type))) {
             const ratio = w / h;
             const dx = targetPos.x - fixedPoint.x;
             const dy = targetPos.y - fixedPoint.y; 
             
             if (Math.abs(dx) / Math.abs(dy) > ratio) { 
                 // Constrain Width based on Height
                 targetPos.y = fixedPoint.y + (dy > 0 ? Math.abs(dx) / ratio : -Math.abs(dx) / ratio); 
             } else { 
                 // Constrain Height based on Width
                 targetPos.x = fixedPoint.x + (dx > 0 ? Math.abs(dy) * ratio : -Math.abs(dy) * ratio); 
             }
         }
         
         // Calculate New Edges for the BOUNDING BOX
         let newLeft = minX, newRight = maxX, newTop = minY, newBottom = maxY;
         
         // Horizontal
         if (handleIndex === 0 || handleIndex === 3) { // Left Handles
             newLeft = targetPos.x;
             newRight = maxX; 
         } else { // Right Handles
             newLeft = minX; 
             newRight = targetPos.x;
         }
         
         // Vertical
         if (!groupBounds && shape.type === ShapeType.RULER) {
             // For ruler, dragging any handle should only change length, not height.
             // We lock Top/Bottom to original values.
             newTop = minY;
             newBottom = maxY;
         } else if (handleIndex === 0 || handleIndex === 1) { // Top Handles
             newTop = targetPos.y;
             newBottom = maxY; 
         } else { // Bottom Handles
             newTop = minY; 
             newBottom = targetPos.y;
         }

         // Perform Interpolation for all points in the shape
         // x' = newLeft + ((x - minX) / w) * (newRight - newLeft)
         const newPoints = shape.points.map(p => ({
             x: newLeft + ((p.x - minX) / w) * (newRight - newLeft),
             y: newTop + ((p.y - minY) / h) * (newBottom - newTop),
             p: p.p
         }));
         
         const updatedShape = { ...shape, points: newPoints };

         // If resizing Text in a group, scale font size approximately by vertical scale
         if (groupBounds && shape.type === ShapeType.TEXT && shape.fontSize) {
             const scaleY = Math.abs(newBottom - newTop) / h;
             updatedShape.fontSize = shape.fontSize * scaleY;
         }

         return updatedShape;
    }

    // Default Vertex Dragging (Single Polygon/Line/Triangle)
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
        
        // Note: For move calculation, we don't strictly need to regenerate path here as Editor does it,
        // but if we do, we need the origin. Assuming Editor regenerates paths on state update.
        // Returning params is enough for Editor to regenerate path.
        return { ...shape, formulaParams: params };
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