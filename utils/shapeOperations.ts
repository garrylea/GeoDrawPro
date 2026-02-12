
import { Shape, ShapeType, Point } from '../types';
import { 
    isPointInShape, distance, getClosestPointOnShape, getRotatedCorners, 
    rotatePoint, getShapeCenter, generateQuadraticPath,
    vertexToStandard
} from './mathUtils';

/**
 * Determines which shape interacts with the cursor at a given position.
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
    const preFiltered = shapesList.filter(s => {
        if ([ShapeType.POINT, ShapeType.MARKER, ShapeType.RULER, ShapeType.PROTRACTOR, ShapeType.FUNCTION_GRAPH].includes(s.type)) return true;
        
        // FIX: Use getRotatedCorners to calculate the actual visual Axis-Aligned Bounding Box (AABB)
        // This solves the issue where Text shapes (defined by 1 point) or Rotated shapes
        // were being filtered out incorrectly because their raw points didn't cover the click area.
        const corners = getRotatedCorners(s);
        
        if (corners.length > 0) {
             let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
             for (const p of corners) {
                 if (p.x < minX) minX = p.x;
                 if (p.x > maxX) maxX = p.x;
                 if (p.y < minY) minY = p.y;
                 if (p.y > maxY) maxY = p.y;
             }
             
             // Tolerance calculation
             const tol = (hitTolerance || 18) + (s.strokeWidth || 2) + 5;
             
             if (pos.x < minX - tol || pos.x > maxX + tol || pos.y < minY - tol || pos.y > maxY + tol) {
                 return false;
             }
             return true;
        }
        
        // Fallback for shapes without corners (should normally not happen for visual shapes)
        if (s.points && s.points.length > 0) {
             let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
             s.points.forEach(p => {
                 if (p.x < minX) minX = p.x;
                 if (p.x > maxX) maxX = p.x;
                 if (p.y < minY) minY = p.y;
                 if (p.y > maxY) maxY = p.y;
             });
             const tol = (hitTolerance || 18) + (s.strokeWidth || 2) + 10;
             if (pos.x < minX - tol || pos.x > maxX + tol || pos.y < minY - tol || pos.y > maxY + tol) {
                 return false;
             }
        }
        return true;
    });

    const hits = preFiltered.filter(s => isPointInShape(pos, s, canvasWidth, canvasHeight, pixelsPerUnit, originY, hitTolerance));
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
 * Calculates the new geometry of a shape when a specific handle is dragged.
 * Implements specific stabilization strategies for different shape types to avoid center-shift jitter.
 */
export const calculateResizedShape = (
    shape: Shape,
    cursorPos: Point,
    handleIndex: number, 
    isShiftPressed: boolean,
    groupBounds?: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }
): Shape => {
    
    // --- STRATEGY A: Vertex Deformations (Bake Rotation) ---
    // Used for Triangle, Polygon, Line, Path, Freehand, AND POINT.
    // When dragging a single vertex of a polygon, the shape's centroid changes.
    // If we maintain a separate 'rotation' property, the changing centroid moves the 
    // rotation pivot, causing the shape to visually shift or "flip" (local coordinate instability).
    // The robust solution is to bake the rotation into the vertex coordinates (World Space)
    // and reset rotation to 0.
    const isVertexShape = !groupBounds && (
        shape.type === ShapeType.TRIANGLE || 
        [ShapeType.POLYGON, ShapeType.LINE, ShapeType.PATH, ShapeType.FREEHAND, ShapeType.POINT].includes(shape.type)
    );

    if (isVertexShape) {
        // Handle degenerate cases or invalid indices
        if (shape.points.length <= handleIndex) return shape;

        const rotation = shape.rotation || 0;
        const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);

        // 1. Calculate World/Screen coordinates for ALL points
        // This effectively "applies" the rotation permanently to the points.
        const screenPoints = shape.points.map(p => rotatePoint(p, center, rotation));
        
        // 2. Update the dragged point to the exact cursor position (World Space)
        // Accessing property 'p' safely in case element is undefined (though length check above handles most cases)
        const currentP = screenPoints[handleIndex];
        if (currentP) {
            screenPoints[handleIndex] = { ...cursorPos, p: currentP.p };
        } else {
            // Fallback if index is somehow out of bounds despite length check
            return shape;
        }

        // 3. Return the shape with updated points and 0 rotation.
        // This eliminates any center-pivot ambiguity and visual jitter.
        return { ...shape, points: screenPoints, rotation: 0, lockedAngles: [] };
    }

    // --- STRATEGY B: Anchor-Based Scaling (The "Pin" Method) ---
    // Used for individual box shapes: Rectangle, Image, Text, Square, Circle, Ellipse
    if (!groupBounds) {
        const rotationRad = (shape.rotation * Math.PI) / 180;
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);

        // handleIndex indices: 0:TL, 1:TR, 2:BR, 3:BL
        const corners = getRotatedCorners(shape);
        // Safety check for corners
        if (corners.length < 4) return shape;

        const anchorIdx = (handleIndex + 2) % 4; // Diagonal opposite is the pin
        const fixedAnchorScreen = corners[anchorIdx];

        // 1. Map mouse position to local coordinate system relative to anchor
        const dx = cursorPos.x - fixedAnchorScreen.x;
        const dy = cursorPos.y - fixedAnchorScreen.y;

        // Vector pointing from anchor to mouse in unrotated local space
        let vectorLocal = {
            x: dx * cos + dy * sin,
            y: -dx * sin + dy * cos
        };

        // 2. Determine initial width/height for aspect ratio constraints
        let oldW, oldH;

        if (shape.type === ShapeType.TEXT) {
            const fs = shape.fontSize || 16;
            oldW = Math.max(20, (shape.text || '').length * fs * 0.8);
            oldH = fs * 1.2;
        } else {
            let minXRaw = Infinity, maxXRaw = -Infinity, minYRaw = Infinity, maxYRaw = -Infinity;
            shape.points.forEach(p => {
                minXRaw = Math.min(minXRaw, p.x); maxXRaw = Math.max(maxXRaw, p.x);
                minYRaw = Math.min(minYRaw, p.y); maxYRaw = Math.max(maxYRaw, p.y);
            });
            oldW = Math.max(1, maxXRaw - minXRaw);
            oldH = Math.max(1, maxYRaw - minYRaw);
        }

        // 3. Apply aspect ratio constraints (Shift key or fixed-aspect shapes)
        if (isShiftPressed || [ShapeType.SQUARE, ShapeType.CIRCLE].includes(shape.type)) {
            const ratio = oldW / oldH;
            if (Math.abs(vectorLocal.x / vectorLocal.y) > ratio) {
                const signY = vectorLocal.y >= 0 ? 1 : -1;
                vectorLocal.y = signY * Math.abs(vectorLocal.x) / ratio;
            } else {
                const signX = vectorLocal.x >= 0 ? 1 : -1;
                vectorLocal.x = signX * Math.abs(vectorLocal.y) * ratio;
            }
        }

        // 4. Derive the new center point based on the constrained local vector
        const centerOffsetLocal = {
            x: vectorLocal.x / 2,
            y: vectorLocal.y / 2
        };

        const centerOffsetScreen = {
            x: centerOffsetLocal.x * cos - centerOffsetLocal.y * sin,
            y: centerOffsetLocal.x * sin + centerOffsetLocal.y * cos
        };

        const newCenterScreen = {
            x: fixedAnchorScreen.x + centerOffsetScreen.x,
            y: fixedAnchorScreen.y + centerOffsetScreen.y
        };

        const newW = Math.abs(vectorLocal.x);
        const newH = Math.abs(vectorLocal.y);

        // 5. Build final shape points in screen-space unrotated coords
        const p1 = { x: newCenterScreen.x - newW / 2, y: newCenterScreen.y - newH / 2 };
        const p2 = { x: newCenterScreen.x + newW / 2, y: newCenterScreen.y + newH / 2 };

        let updatedShape = { ...shape };

        if (shape.type === ShapeType.TEXT && shape.fontSize) {
            const scaleY = newH / oldH;
            const newFs = Math.max(4, shape.fontSize * scaleY);
            const newAnchorY = p1.y + newFs * 0.1;
            updatedShape.fontSize = newFs;
            updatedShape.points = [{ x: p1.x, y: newAnchorY }];
        } else {
            updatedShape.points = [p1, p2];
        }

        return updatedShape;
    } 

    // --- STRATEGY C: Group Scaling (AABB based) ---
    else {
        let { minX, maxX, minY, maxY, width: w, height: h } = groupBounds;
        const fixedIdx = (handleIndex + 2) % 4;
        const currentCorners = [{x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY}];
        const fixedPoint = currentCorners[fixedIdx];
        let targetPos = { ...cursorPos };

        if (isShiftPressed) {
            const ratio = w / h;
            const dx = targetPos.x - fixedPoint.x;
            const dy = targetPos.y - fixedPoint.y; 
            if (Math.abs(dx) / (Math.abs(dy) || 0.001) > ratio) { 
                targetPos.y = fixedPoint.y + (dy > 0 ? 1 : -1) * Math.abs(dx) / ratio; 
            } else { 
                targetPos.x = fixedPoint.x + (dx > 0 ? 1 : -1) * Math.abs(dy) * ratio; 
            }
        }
        
        let newLeft = minX, newRight = maxX, newTop = minY, newBottom = maxY;
        if (handleIndex === 0 || handleIndex === 3) { newLeft = targetPos.x; newRight = maxX; } 
        else { newLeft = minX; newRight = targetPos.x; }
        if (handleIndex === 0 || handleIndex === 1) { newTop = targetPos.y; newBottom = maxY; } 
        else { newTop = minY; newBottom = targetPos.y; }

        const nw = Math.max(0.1, Math.abs(newRight - newLeft));
        const nh = Math.max(0.1, Math.abs(newBottom - newTop));

        const newPoints = shape.points.map(p => ({
            x: newLeft + ((p.x - minX) / w) * nw,
            y: newTop + ((p.y - minY) / h) * nh,
            p: p.p
        }));
        
        const updatedShape = { ...shape, points: newPoints };
        if (shape.type === ShapeType.TEXT && shape.fontSize) {
            const scaleY = nh / h;
            updatedShape.fontSize = Math.max(4, shape.fontSize * scaleY);
        }
        return updatedShape;
    }
};

/**
 * Calculates the new geometry of a shape when it is moved (translated).
 */
export const calculateMovedShape = (
    shape: Shape,
    dx: number,
    dy: number,
    pixelsPerUnit: number,
    drivingPoints: Point[] = [],
    canvasWidth?: number,
    canvasHeight?: number,
    originY?: number
): Shape => {
    if (shape.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
        const dmx = dx / pixelsPerUnit;
        const dmy = -dy / pixelsPerUnit;
        const params = { ...shape.formulaParams };
        
        if (shape.functionType === 'linear') { 
            params.b = Math.round(((params.b || 0) + dmy - (params.k || 1) * dmx) * 10) / 10; 
        } else { 
            // For Quadratic, movement is essentially a vertex shift.
            // Regardless of the current 'form', we update h/k first, then sync b/c.
            // New Vertex Position
            const newH = Math.round(((params.h || 0) + dmx) * 10) / 10;
            const newK = Math.round(((params.k || 0) + dmy) * 10) / 10;
            
            params.h = newH;
            params.k = newK;

            // Sync Standard Form (b, c) based on new Vertex (h, k) and existing a
            const a = params.a ?? 1;
            const { b, c } = vertexToStandard(a, newH, newK);
            
            params.b = Math.round(b * 10) / 10;
            params.c = Math.round(c * 10) / 10;
        }
        
        let pathData = shape.pathData;
        if (canvasWidth && canvasHeight) {
             pathData = generateQuadraticPath(
                 params, 
                 shape.functionForm || 'standard', 
                 canvasWidth, 
                 canvasHeight, 
                 pixelsPerUnit, 
                 shape.functionType || 'quadratic', 
                 originY
             );
        }

        return { ...shape, formulaParams: params, pathData };
    }

    if (drivingPoints.length > 0) { 
        if (shape.constraint) return shape; // Constrained shapes don't get driven by points directly

        const linkedPoints = shape.points.map(p => 
            drivingPoints.some(dp => Math.abs(dp.x - p.x) < 5.0 && Math.abs(dp.y - p.y) < 5.0) 
            ? { x: p.x + dx, y: p.y + dy, p: p.p } 
            : p
        ); 
        if (linkedPoints.some((lp, i) => lp.x !== shape.points[i].x || lp.y !== shape.points[i].y)) {
            return { ...shape, points: linkedPoints }; 
        }
        return shape;
    }

    // Only translate the whole shape if NOT using driving points
    return { 
        ...shape, 
        points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p })) 
    };
};

/**
 * Calculates the new geometry of a shape when it is rotated.
 */
export const calculateRotatedShape = (
    shape: Shape,
    delta: number,
    rotationCenter: Point,
    isShiftPressed: boolean
): Shape => {
    let newRotation = (shape.rotation || 0) + delta;
    if (isShiftPressed) newRotation = Math.round(newRotation / 15) * 15;
    
    const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
    const newCenter = rotatePoint(center, rotationCenter, delta);
    const dRx = newCenter.x - center.x;
    const dRy = newCenter.y - center.y;
    
    return { 
        ...shape, 
        points: shape.points.map(p => ({ x: p.x + dRx, y: p.y + dRy, p: p.p })), 
        rotation: newRotation 
    };
};
