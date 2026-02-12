import { Shape, ShapeType, Point } from '../types';
import { lerp, evaluateQuadratic, mathToScreen, getRotatedCorners, getShapeCenter, distance, rotatePoint } from './mathUtils';

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
    originY?: number,
    depth: number = 0
): Shape[] => {
    if (depth > 15) {
        console.warn('[ConstraintSystem] Max recursion depth reached');
        return allShapes;
    }

    // 1. Find direct dependents
    const dependents = allShapes.filter(s => {
        if (!s.constraint) return false;
        const isDirect = s.constraint.parentId === modifiedShapeId;
        const isMulti = Array.isArray(s.constraint.parents) && s.constraint.parents.some(p => p === modifiedShapeId);
        return isDirect || isMulti;
    });
    
    if (dependents.length === 0) return allShapes;

    let updatedShapes = [...allShapes];

    for (const dependentStub of dependents) {
        // CRITICAL: Always get the LATEST version of the dependent from our accumulating array.
        const currentDependent = updatedShapes.find(s => s.id === dependentStub.id);
        if (!currentDependent || !currentDependent.constraint) continue;

        const { type, parentId, parents, edgeIndex, paramT, paramX } = currentDependent.constraint;
        let nextShape: Shape | null = null;

        // --- CASE 1: Point on Edge ---
        if (type === 'on_edge' && edgeIndex !== undefined && paramT !== undefined && parentId === modifiedShapeId) {
            const parent = updatedShapes.find(s => s.id === parentId);
            if (parent) {
                const visualPoints = getRotatedCorners(parent);
                if (visualPoints.length >= 2) {
                    const p1 = visualPoints[edgeIndex];
                    const p2 = visualPoints[(edgeIndex + 1) % visualPoints.length];
                    if (p1 && p2) {
                        const newPos = lerp(p1, p2, paramT);
                        nextShape = { ...currentDependent, points: [newPos] };
                    }
                }
            }
        }
        
        // --- CASE 2: Point on Path (Function Graph, Circle, Ellipse) ---
        else if (type === 'on_path' && parentId === modifiedShapeId) {
             const parent = updatedShapes.find(s => s.id === parentId);
             if (!parent) continue;

             if (parent.type === ShapeType.FUNCTION_GRAPH && parent.formulaParams && paramX !== undefined) {
                 const fType = parent.functionType || 'quadratic';
                 const mx = paramX;
                 const my = evaluateQuadratic(mx, parent.formulaParams, parent.functionForm, fType);
                 const newPos = mathToScreen({ x: mx, y: my }, canvasWidth, canvasHeight, pixelsPerUnit, originY);
                 nextShape = { ...currentDependent, points: [newPos] };
             }
             else if (parent.type === ShapeType.CIRCLE && dependentStub.constraint!.paramAngle !== undefined) {
                 const center = getShapeCenter(parent.points, parent.type);
                 const radius = Math.abs(parent.points[1].x - parent.points[0].x) / 2;
                 const rad = (dependentStub.constraint!.paramAngle! * Math.PI) / 180;
                 const newPos = {
                     x: center.x + radius * Math.cos(rad),
                     y: center.y + radius * Math.sin(rad)
                 };
                 nextShape = { ...currentDependent, points: [newPos] };
             }
             else if (parent.type === ShapeType.ELLIPSE && dependentStub.constraint!.paramAngle !== undefined) {
                 const center = getShapeCenter(parent.points, parent.type);
                 const rx = Math.abs(parent.points[0].x - parent.points[1].x) / 2;
                 const ry = Math.abs(parent.points[0].y - parent.points[1].y) / 2;
                 const rad = (dependentStub.constraint!.paramAngle! * Math.PI) / 180;
                 
                 // Initial unrotated position
                 let newPos = {
                     x: center.x + rx * Math.cos(rad),
                     y: center.y + ry * Math.sin(rad)
                 };
                 // Apply parent rotation if exists
                 if (parent.rotation) {
                     newPos = rotatePoint(newPos, center, parent.rotation);
                 }
                 nextShape = { ...currentDependent, points: [newPos] };
             }
        }

        // --- CASE 3: Line/Shape connected to dynamic Points ---
        else if (type === 'points_link') {
            const pids = parents || (parentId ? [parentId] : []);
            const newPoints = [...currentDependent.points];
            let changed = false;

            pids.forEach((pid, idx) => {
                if (!pid) return;
                const parent = updatedShapes.find(s => s.id === pid);
                if (parent && parent.points.length > 0) {
                    const pt = parent.points[0];
                    if (Math.abs(newPoints[idx].x - pt.x) > 0.01 || Math.abs(newPoints[idx].y - pt.y) > 0.01) {
                        newPoints[idx] = { x: pt.x, y: pt.y };
                        changed = true;
                    }
                }
            });

            if (changed) {
                nextShape = { ...currentDependent, points: newPoints, rotation: 0 };
            }
        }

        if (nextShape) {
            updatedShapes = updatedShapes.map(s => s.id === currentDependent.id ? nextShape! : s);
            updatedShapes = resolveConstraints(updatedShapes, currentDependent.id, canvasWidth, canvasHeight, pixelsPerUnit, originY, depth + 1);
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
 */
export const constrainPointToEdge = (
    cursorPos: Point,
    parent: Shape,
    edgeIndex: number
): { point: Point, t: number } => {
    const visualPoints = getRotatedCorners(parent);
    if (visualPoints.length < 2 || edgeIndex >= visualPoints.length) return { point: cursorPos, t: 0 };

    const p1 = visualPoints[edgeIndex];
    const p2 = visualPoints[(edgeIndex + 1) % visualPoints.length];
    
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
