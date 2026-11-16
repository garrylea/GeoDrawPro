import React from 'react';
import { Shape, ShapeType, ToolType } from '../../types';
import { getSnapPoint, snapToRuler } from '../../utils/snapping';
import { recalculateMarker } from '../../utils/markerEditing';
import { getAngleArcPath } from '../../utils/svgPaths';
import { distance, getAngleDegrees } from '../../utils/vectorMath';
import { resolveConstraints, constrainPointToEdge, constrainPointToPath, buildLinePointsLink } from '../../utils/constraintSystem';
import { getHitShape, calculateResizedShape, getSelectionBounds, removeShapesWithDependents } from '../../utils/shapeOperations';
import type { UsePointerHandlersDeps } from './pointerTypes';

/** Pointer-move handling for every tool/gesture (moved verbatim from usePointerHandlers.ts, S10). */
export const createPointerMove = ({
    isScrollingRef, containerRef, lastScrollPos, svgRef, zoom, cursorPosRef,
    axisConfig, canvasSize, svgHeight, pixelsPerUnit, originY, tool, selectedIds,
    activeShapeId, shapesRef, setShapes, setCursorPos, compassState, setCompassState,
    setCompassPreviewPath, isDragging, selectionStartRef, selectionRectRef, isRotating,
    rotationCenter, lastRotationMouseAngle, transientStateRef, updateTransientVisuals,
    lastHitTestTime, shapes, hoveredShapeId, setHoveredShapeId, dragHandleIndex,
    initialShapeStateRef, isShiftPressed, dragStartPos, activeLineConstraints,
}: UsePointerHandlersDeps) => {
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrollingRef.current && containerRef.current && lastScrollPos.current) { const dx = e.clientX - lastScrollPos.current.x; const dy = e.clientY - lastScrollPos.current.y; containerRef.current.scrollLeft -= dx; containerRef.current.scrollTop -= dy; lastScrollPos.current = { x: e.clientX, y: e.clientY }; return; }
    
    const rect = svgRef.current?.getBoundingClientRect();
    const rawPos = { 
        x: (e.clientX - (rect?.left || 0)) / zoom, 
        y: (e.clientY - (rect?.top || 0)) / zoom 
    };
    cursorPosRef.current = rawPos;

    // Snapping configuration for detecting constraints
    const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) ? { width: canvasSize.width, height: svgHeight, ppu: pixelsPerUnit } : undefined;
    
    // CRITICAL UX FIX: Disable snapping for FREEHAND tool
    const shouldSnap = tool !== ToolType.FREEHAND;

    // Detect snapping target (all shapes except current dragging selection and the active shape being drawn)
    const snapResult = shouldSnap 
        ? getSnapPoint(rawPos, shapesRef.current.filter(s => !selectedIds.has(s.id) && s.id !== activeShapeId), [], gridSnapConfig)
        : { point: rawPos, snapped: false, constraint: undefined, type: undefined };
        
    const pos = snapResult.point;

    if (tool !== ToolType.SELECT) { setCursorPos(rawPos); }
    if (activeShapeId && tool === ToolType.LINE) {
        setShapes(prev => prev.map(s => {
            if (s.id === activeShapeId) {
                const updated: Shape = { ...s, points: [s.points[0], pos] };
                updated.constraint = buildLinePointsLink(activeLineConstraints[0], snapResult.constraint);
                return updated;
            }
            return s;
        }));
    }
    if (tool === ToolType.COMPASS && compassState.radiusPoint) { const center = compassState.center!; const radius = distance(center, compassState.radiusPoint); const currentMouseAngle = getAngleDegrees(center, rawPos); let delta = currentMouseAngle - compassState.lastMouseAngle; if (delta > 180) delta -= 360; if (delta < -180) delta += 360; const newAccumulated = compassState.accumulatedRotation + delta; setCompassState(prev => ({ ...prev, lastMouseAngle: currentMouseAngle, accumulatedRotation: newAccumulated })); const startAngle = compassState.startAngle!; const endAngle = startAngle + newAccumulated; setCompassPreviewPath(getAngleArcPath(center, null, null, radius, startAngle, endAngle)); return; }
    if (tool === ToolType.ERASER && isDragging) { const hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY, 12); if (hit && hit.type !== ShapeType.IMAGE) setShapes(prev => removeShapesWithDependents(prev, new Set([hit.id]))); return; }
    if (tool === ToolType.SELECT && selectionStartRef.current && isDragging && selectionRectRef.current) { const start = selectionStartRef.current; const current = rawPos; const x = Math.min(start.x, current.x); const y = Math.min(start.y, current.y); const w = Math.abs(current.x - start.x); const h = Math.abs(current.y - start.y); selectionRectRef.current.setAttribute('x', x.toString()); selectionRectRef.current.setAttribute('y', y.toString()); selectionRectRef.current.setAttribute('width', w.toString()); selectionRectRef.current.setAttribute('height', h.toString()); return; }

    if (isRotating && rotationCenter && activeShapeId === null) { 
        const currentAngle = Math.atan2(rawPos.y - rotationCenter.y, rawPos.x - rotationCenter.x) * (180 / Math.PI); 
        const delta = currentAngle - lastRotationMouseAngle.current; 
        transientStateRef.current = { rotation: delta, rotationCenter };
        updateTransientVisuals(transientStateRef.current);
        return; 
    }
    
    if (!isDragging) { 
        const now = Date.now();
        if (now - lastHitTestTime.current > 50) {
            const hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY); 
            if (hoveredShapeId !== (hit ? hit.id : null)) { setHoveredShapeId(hit ? hit.id : null); }
            lastHitTestTime.current = now;
        }
    }

    if (dragHandleIndex !== null && selectedIds.size > 0) { 
        const initialShapesArray = Array.from(initialShapeStateRef.current.values()) as Shape[];
        const singleShape = selectedIds.size === 1 ? shapes.find(s => selectedIds.has(s.id)) : null;

        if (singleShape) {
            const snapshotShape = initialShapesArray.find(s => s.id === singleShape.id) || singleShape;
            // Resize tracks the raw cursor: snapped positions quantize the size and let nearby shapes hijack the handle.
            const updatedShape = calculateResizedShape(snapshotShape, rawPos, dragHandleIndex, isShiftPressed);
            setShapes(prev => {
                let nextShapes = prev.map(s => {
                    if (s.id === singleShape.id) return updatedShape;
                    if (s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === singleShape.id) { return recalculateMarker(s, [updatedShape]) || s; }
                    return s;
                });
                return resolveConstraints(nextShapes, singleShape.id, canvasSize.width, svgHeight, pixelsPerUnit, originY);
            });
            return; 
        }

        const relevantSnapshotShapes = initialShapesArray.filter(s => selectedIds.has(s.id));
        const initialGroupBounds = getSelectionBounds(relevantSnapshotShapes, selectedIds);
        
        if (initialGroupBounds) {
             const dummyShape: Shape = { id: 'dummy', type: ShapeType.RECTANGLE, points: [{x: initialGroupBounds.minX, y: initialGroupBounds.minY}, {x: initialGroupBounds.maxX, y: initialGroupBounds.maxY}], fill: '', stroke: '', strokeWidth: 0, rotation: 0 };
             const resizedDummy = calculateResizedShape(dummyShape, rawPos, dragHandleIndex, isShiftPressed);
             let newMinX = Infinity, newMaxX = -Infinity, newMinY = Infinity, newMaxY = -Infinity;
             resizedDummy.points.forEach(p => { newMinX = Math.min(newMinX, p.x); newMaxX = Math.max(newMaxX, p.x); newMinY = Math.min(newMinY, p.y); newMaxY = Math.max(newMaxY, p.y); });
             const oldW = initialGroupBounds.width; const oldH = initialGroupBounds.height; const newW = newMaxX - newMinX; const newH = newMaxY - newMinY;
             const scaleX = oldW > 0 ? newW / oldW : 1; const scaleY = oldH > 0 ? newH / oldH : 1;
             const oldCx = initialGroupBounds.minX + oldW / 2; const oldCy = initialGroupBounds.minY + oldH / 2; const newCx = newMinX + newW / 2; const newCy = newMinY + newH / 2;
             const dx = newCx - oldCx; const dy = newCy - oldCy;
             transientStateRef.current = { scale: { x: scaleX, y: scaleY }, scaleCenter: { x: oldCx, y: oldCy }, dx, dy };
             updateTransientVisuals(transientStateRef.current);
        }
        return; 
    }
    
    if (activeShapeId && tool !== ToolType.LINE) { 
        // RULER SNAPPING FOR FREEHAND
        let effectivePos = pos;
        let wasSnapped = false;
        if (tool === ToolType.FREEHAND && isDragging && activeShapeId) {
            const ruler = shapes.find(s => s.type === ShapeType.RULER);
            if (ruler) {
                const { point, snapped } = snapToRuler(pos, ruler, 25);
                if (snapped) {
                    effectivePos = point;
                    wasSnapped = true;
                }
            }
        }

        setShapes((prev: Shape[]) => prev.map((s: Shape) => { 
            if (s.id !== activeShapeId) return s; 
            let newPoints = [...s.points]; 
            newPoints[newPoints.length - 1] = effectivePos; 
            if (s.type === ShapeType.SQUARE || s.type === ShapeType.CIRCLE) { 
                const d = Math.max(Math.abs(effectivePos.x - s.points[0].x), Math.abs(effectivePos.y - s.points[0].y)); 
                const sx = effectivePos.x > s.points[0].x ? 1 : -1; 
                // CRITICAL FIX: Use s.points[0].y for Y comparison, not .x
                const sy = effectivePos.y > s.points[0].y ? 1 : -1; 
                newPoints[1] = { x: s.points[0].x + d * sx, y: s.points[0].y + d * sy }; 
            } else if (s.type === ShapeType.TRIANGLE) { 
                newPoints[1] = { x: s.points[0].x, y: effectivePos.y }; newPoints[2] = effectivePos; 
            } else if (s.type === ShapeType.FREEHAND) { 
                newPoints = [...s.points, effectivePos]; 
            } 
            return { ...s, points: newPoints, usePressure: wasSnapped ? false : s.usePressure }; 
        })); 
    } 
    else if (selectedIds.size > 0 && dragStartPos && isDragging && !selectionStartRef.current) { 
        const singleSelId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
        const isPointDrag = singleSelId && shapesRef.current.find(s => s.id === singleSelId)?.type === ShapeType.POINT;

        if (isPointDrag) {
             const draggingShape = shapesRef.current.find(s => s.id === singleSelId);
             if (!draggingShape) return;

             let newPos = pos;
             let newConstraint = snapResult.constraint;

             // 1. Logic for points ALREADY on edges or paths (Stable sliding)
             // CRITICAL: We prioritize the existing constraint over the snap result
             if (draggingShape.constraint) {
                  const parent = shapesRef.current.find(s => s.id === draggingShape.constraint!.parentId);
                  if (parent) {
                      if (draggingShape.constraint.type === 'on_edge' && draggingShape.constraint.edgeIndex !== undefined) {
                           const { point: constrainedPos, t } = constrainPointToEdge(rawPos, parent, draggingShape.constraint.edgeIndex);
                           newPos = constrainedPos;
                           newConstraint = { ...draggingShape.constraint, paramT: t };
                      } else if (draggingShape.constraint.type === 'on_path' && (parent.type === ShapeType.CIRCLE || parent.type === ShapeType.ELLIPSE)) {
                           const { point: constrainedPos, angle } = constrainPointToPath(rawPos, parent);
                           newPos = constrainedPos;
                           newConstraint = { ...draggingShape.constraint, paramAngle: angle };
                      }
                  }
             }

             // 2. Hybrid Drive: Update REAL state immediately for point dragging
             // This ensures perfect edge locking and real-time line stretching via resolveConstraints
             setShapes(prev => {
                 const next = prev.map(s => s.id === singleSelId ? { ...s, points: [newPos], constraint: newConstraint } : s);
                 // Propagate to lines/markers immediately
                 return resolveConstraints(next, singleSelId, canvasSize.width, svgHeight, pixelsPerUnit, originY);
             });
             
             // Ensure any transient leftovers are cleared
             if (transientStateRef.current) {
                 transientStateRef.current = null;
                 updateTransientVisuals(null);
             }
             return; 
        }
        const dx = rawPos.x - dragStartPos.x, dy = rawPos.y - dragStartPos.y; 
        transientStateRef.current = { dx, dy };
        updateTransientVisuals(transientStateRef.current);
    }
  };

  return { handlePointerMove };
};
