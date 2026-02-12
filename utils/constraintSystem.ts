import { Shape, ShapeType, Point } from '../types';
import { lerp, mathToScreen, evaluateQuadratic, getRotatedCorners } from './mathUtils';

/**
 * Updates all shapes that depend on the modified shape.
 * This is a recursive function that propagates changes through the dependency graph.
 */
export const resolveConstraints = (
    allShapes: Shape[], 
    modifiedShapeId: string,
    canvasWidth: number,
    canvasHeight: number,
    pixelsPerUnit: number,
    originY?: number
): Shape[] => {
    // 1. Find direct dependents
    const dependents = allShapes.filter(s => s.constraint?.parentId === modifiedShapeId);
    
    if (dependents.length === 0) return allShapes;

    let updatedShapes = [...allShapes];

    for (const dependent of dependents) {
        const parent = updatedShapes.find(s => s.id === modifiedShapeId);
        if (!parent || !dependent.constraint) continue;

        const { type, edgeIndex, paramT, paramX } = dependent.constraint;
        let newPoint: Point | null = null;

        // --- CASE 1: Point on Edge (Polygon/Line/Rect etc.) ---
        if (type === 'on_edge' && edgeIndex !== undefined && paramT !== undefined) {
            // CRITICAL FIX: Use visual points (rotated) instead of raw points
            const visualPoints = getRotatedCorners(parent);
            if (visualPoints.length >= 2) {
                const p1 = visualPoints[edgeIndex];
                const p2 = visualPoints[(edgeIndex + 1) % visualPoints.length];
                
                // Re-calculate position based on t
                if (p1 && p2) {
                    newPoint = lerp(p1, p2, paramT);
                }
            }
        }
        
        // --- CASE 2: Point on Function Graph ---
        else if (type === 'on_path' && paramX !== undefined && parent.type === ShapeType.FUNCTION_GRAPH && parent.formulaParams) {
             const fType = parent.functionType || 'quadratic';
             const mx = paramX;
             const my = evaluateQuadratic(mx, parent.formulaParams, parent.functionForm, fType);
             newPoint = mathToScreen({ x: mx, y: my }, canvasWidth, canvasHeight, pixelsPerUnit, originY);
        }

        // Apply update if a new position was calculated
        if (newPoint) {
            updatedShapes = updatedShapes.map(s => {
                if (s.id === dependent.id) {
                    return { ...s, points: [newPoint!] };
                }
                return s;
            });
            
            // RECURSION: Update things that depend on this dependent (e.g. Lines connected to this Point)
            updatedShapes = resolveConstraints(updatedShapes, dependent.id, canvasWidth, canvasHeight, pixelsPerUnit, originY);
        }
    }

    return updatedShapes;
};

/**
 * Recursively finds all shapes that depend on the given parent IDs.
 */
export const getDependents = (allShapes: Shape[], parentIds: Set<string>): Shape[] => {
    const dependents: Shape[] = [];
    const queue = Array.from(parentIds);
    const visited = new Set<string>(parentIds);

    while (queue.length > 0) {
        const pid = queue.shift()!;
        const children = allShapes.filter(s => s.constraint?.parentId === pid && !visited.has(s.id));
        
        children.forEach(child => {
            dependents.push(child);
            visited.add(child.id);
            queue.push(child.id);
        });
    }
    return dependents;
};

/**
 * Constrains a point to an edge when it is being dragged.
 * Calculates the new 't' parameter and snaps the point to the segment.
 */
export const constrainPointToEdge = (
    cursorPos: Point,
    parent: Shape,
    edgeIndex: number
): { point: Point, t: number } => {
    // CRITICAL: Must use visual points for dragging projection
    const visualPoints = getRotatedCorners(parent);
    if (visualPoints.length < 2 || edgeIndex >= visualPoints.length) return { point: cursorPos, t: 0 };

    const p1 = visualPoints[edgeIndex];
    const p2 = visualPoints[(edgeIndex + 1) % visualPoints.length];
    
    // Project cursor onto vector p1->p2
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return { point: p1, t: 0 };

    const t = ((cursorPos.x - p1.x) * dx + (cursorPos.y - p1.y) * dy) / len2;
    const clampedT = Math.max(0, Math.min(1, t));
    
    return {
        point: lerp(p1, p2, clampedT),
        t: clampedT
    };
};
