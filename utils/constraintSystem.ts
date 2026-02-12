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
    // 1. Find direct dependents (search parentId OR parents array)
    const dependents = allShapes.filter(s => 
        s.constraint?.parentId === modifiedShapeId || 
        s.constraint?.parents?.includes(modifiedShapeId)
    );
    
    if (dependents.length === 0) return allShapes;

    let updatedShapes = [...allShapes];

    for (const dependent of dependents) {
        if (!dependent.constraint) continue;

        const { type, parentId, parents, edgeIndex, paramT, paramX } = dependent.constraint;
        let nextShape: Shape | null = null;

        // --- CASE 1: Point on Edge (Polygon/Line/Rect etc.) ---
        if (type === 'on_edge' && edgeIndex !== undefined && paramT !== undefined && parentId === modifiedShapeId) {
            const parent = updatedShapes.find(s => s.id === parentId);
            if (parent) {
                const visualPoints = getRotatedCorners(parent);
                if (visualPoints.length >= 2) {
                    const p1 = visualPoints[edgeIndex];
                    const p2 = visualPoints[(edgeIndex + 1) % visualPoints.length];
                    if (p1 && p2) {
                        const newPos = lerp(p1, p2, paramT);
                        nextShape = { ...dependent, points: [newPos] };
                    }
                }
            }
        }
        
        // --- CASE 2: Point on Function Graph ---
        else if (type === 'on_path' && paramX !== undefined && parentId === modifiedShapeId) {
             const parent = updatedShapes.find(s => s.id === parentId);
             if (parent && parent.type === ShapeType.FUNCTION_GRAPH && parent.formulaParams) {
                 const fType = parent.functionType || 'quadratic';
                 const mx = paramX;
                 const my = evaluateQuadratic(mx, parent.formulaParams, parent.functionForm, fType);
                 const newPos = mathToScreen({ x: mx, y: my }, canvasWidth, canvasHeight, pixelsPerUnit, originY);
                 nextShape = { ...dependent, points: [newPos] };
             }
        }

        // --- CASE 3: Line/Shape connected to dynamic Points ---
        else if (type === 'points_link') {
            const pids = parents || (parentId ? [parentId] : []);
            const newPoints = [...dependent.points];
            let changed = false;

            pids.forEach((pid, idx) => {
                if (!pid) return;
                // If this vertex is linked to the modified parent
                const parent = updatedShapes.find(s => s.id === pid);
                if (parent && parent.points.length > 0) {
                    newPoints[idx] = parent.points[0];
                    changed = true;
                }
            });

            if (changed) {
                nextShape = { ...dependent, points: newPoints };
            }
        }

        // Apply update if a new state was calculated
        if (nextShape) {
            updatedShapes = updatedShapes.map(s => s.id === dependent.id ? nextShape! : s);
            
            // RECURSION: Propagate changes to shapes depending on this shape
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
        // Search in both parentId and parents array
        const children = allShapes.filter(s => 
            !visited.has(s.id) && 
            (s.constraint?.parentId === pid || s.constraint?.parents?.includes(pid))
        );
        
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
