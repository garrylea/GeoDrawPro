import React from 'react';
import { Shape, ShapeType, ToolType } from '../../types';
import { recognizeFreehandShape } from '../../utils/freehandRecognition';
import { recalculateMarker } from '../../utils/markerEditing';
import { distance } from '../../utils/vectorMath';
import { resolveConstraints, constrainPointToEdge, constrainPointToPath, buildLinePointsLink } from '../../utils/constraintSystem';
import { calculateMovedShape, calculateResizedShape, calculateRotatedShape, getSelectionBounds } from '../../utils/shapeOperations';
import { createArcShape, clickDefaultPoints } from '../../utils/shapeFactory';
import { getNextLabels } from '../../utils/labeling';
import type { UsePointerHandlersDeps } from './pointerTypes';
import type { PointerHelpers } from './pointerHelpers';

/** Pointer-up commit/finalization for every tool/gesture (moved verbatim from usePointerHandlers.ts, S10). */
export const createPointerUp = (
    {
        isScrollingRef, lastScrollPos, tool, selectionStartRef, isDragging, shapeBoundsCache,
        selectedIds, setSelectedIds, setIsDragging, setIsRotating, dragHandleIndex, saveHistory,
        setShapes, initialShapeStateRef, isShiftPressed, canvasSize, svgHeight, pixelsPerUnit,
        originY, setDragHandleIndex, updateTransientVisuals, transientStateRef, selectionRectRef,
        compassPreviewPath, compassState, setCompassState, setCompassPreviewPath, currentStyle,
        generateId, activeShapeId, dragStartPos, activeLineConstraints, setActiveShapeId,
        setActiveLineConstraints, setDragStartPos, smartSketchMode, shapes, autoLabelMode,
        domCacheRef,
    }: UsePointerHandlersDeps,
    { getMousePos, bindPointToShapes }: PointerHelpers,
) => {
  const handlePointerUp = (e: React.PointerEvent) => {
      if (isScrollingRef.current) { 
          isScrollingRef.current = false; 
          lastScrollPos.current = null; 
          try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch(err) {}
          return; 
      }
      const rawPos = getMousePos(e, false);
      
      if (tool === ToolType.SELECT && selectionStartRef.current && isDragging) {
          const start = selectionStartRef.current; const current = rawPos; const x = Math.min(start.x, current.x); const y = Math.min(start.y, current.y); const w = Math.abs(current.x - start.x); const h = Math.abs(current.y - start.y);
          const selRight = x + w; const selBottom = y + h; const newSelection = new Set<string>();
          for (const [id, bounds] of shapeBoundsCache.current) { 
            // CONTAINMENT CHECK
            if (bounds.minX >= x && bounds.maxX <= selRight && bounds.minY >= y && bounds.maxY <= selBottom) { 
                newSelection.add(id); 
            } 
          }
          if (newSelection.size > 0 || selectedIds.size > 0) { setSelectedIds(newSelection); }
      }
      setIsDragging(false); setIsRotating(false); 
      
      if (dragHandleIndex !== null) {
          const finalPos = getMousePos(e, false);
          saveHistory();

          setShapes((prev: Shape[]) => { 
             const currentShapes = prev;
             const snapshots = initialShapeStateRef.current;
             
             // --- FORCE SNAPSHOT BASED RECALCULATION FOR SINGLE SELECTION ---
             // This ensures that the final committed shape is exactly calculated from Start State + Final Mouse Pos,
             // eliminating accumulation errors or "snap back" due to missing pointer moves.
             if (selectedIds.size === 1) {
                const id = Array.from(selectedIds)[0];
                const snapshot = snapshots.get(id);
                if (snapshot) {
                    const updated = calculateResizedShape(snapshot, finalPos, dragHandleIndex!, isShiftPressed);
                    let nextShapes = currentShapes.map((s) => {
                        if (s.id === id) return updated;
                        // Update attached markers
                        if (s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === id) { 
                            return recalculateMarker(s, [updated]) || s; 
                        }
                        return s;
                    });
                    return resolveConstraints(nextShapes, id, canvasSize.width, svgHeight, pixelsPerUnit, originY);
                }
             }

             // Group Selection (Box Resize) Logic
             const currentGroupBounds = selectedIds.size > 1 ? getSelectionBounds(currentShapes, selectedIds) : undefined; 
             let resizedShapes = currentShapes.map((s) => { 
                 if (!selectedIds.has(s.id)) return s; 
                 return calculateResizedShape(s, finalPos, dragHandleIndex!, isShiftPressed, currentGroupBounds || undefined); 
             }); 
             
             // Resolve constraints for all resized shapes
             selectedIds.forEach(id => {
                 resizedShapes = resolveConstraints(resizedShapes, id, canvasSize.width, svgHeight, pixelsPerUnit, originY);
             });
             
             return resizedShapes.map((s) => (s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId && selectedIds.has(s.markerConfig.targets[0].shapeId)) ? (recalculateMarker(s, resizedShapes) || s) : s); 
          });

          setDragHandleIndex(null);
          updateTransientVisuals(null); 
          transientStateRef.current = null;
          initialShapeStateRef.current.clear();
          return;
      }

      if (selectionRectRef.current) { selectionRectRef.current.style.display = 'none'; selectionRectRef.current.setAttribute('width', '0'); selectionRectRef.current.setAttribute('height', '0'); }
      selectionStartRef.current = null; shapeBoundsCache.current.clear(); 

      const tState = transientStateRef.current;
      if (tState) {
          saveHistory();
          const { dx, dy, rotation, rotationCenter: rotCenter } = tState;
          setShapes((prev: Shape[]) => {
              let updatedShapes = prev;
              if ((dx && dx !== 0) || (dy && dy !== 0)) {
                  // 1. Move the shapes that were directly selected
                  updatedShapes = prev.map((s: Shape) => {
                      if (selectedIds.has(s.id)) { 
                          const moved = calculateMovedShape(s, dx || 0, dy || 0, pixelsPerUnit, [], canvasSize.width, svgHeight, originY);
                          
                          // Handle special point binding on release (for free points)
                          if (s.type === ShapeType.POINT) {
                              if (s.constraint && (s.constraint.type === 'on_edge' || s.constraint.type === 'on_path')) {
                                  const parent = prev.find(p => p.id === s.constraint!.parentId);
                                  if (parent) {
                                      if (s.constraint.type === 'on_edge' && s.constraint.edgeIndex !== undefined) {
                                          const { point: constrainedPos, t } = constrainPointToEdge(moved.points[0], parent, s.constraint.edgeIndex);
                                          return { ...moved, points: [constrainedPos], constraint: { ...s.constraint!, paramT: t } };
                                      } else if (s.constraint.type === 'on_path' && (parent.type === ShapeType.CIRCLE || parent.type === ShapeType.ELLIPSE)) {
                                          const { point: constrainedPos, angle } = constrainPointToPath(moved.points[0], parent);
                                          return { ...moved, points: [constrainedPos], constraint: { ...s.constraint!, paramAngle: angle } };
                                      }
                                  }
                              } else {
                                  // Only attempt NEW binding if it wasn't already constrained
                                  const { point: finalPos, constraint } = bindPointToShapes(moved.points[0], [s.id], false);
                                  return { ...moved, points: [finalPos], constraint };
                              }
                          }
                          return moved;
                      }
                      return s;
                  });
              }
              if (rotation && rotCenter) {
                  updatedShapes = updatedShapes.map((s: Shape) => {
                      if (!selectedIds.has(s.id)) return s;
                      return calculateRotatedShape(s, rotation, rotCenter, isShiftPressed);
                  });
              }
              
              // 2. CRITICAL: Recursively resolve ALL constraints.
              let finalShapes = updatedShapes;
              
              // We must resolve starting from each moved item.
              // If a Point was moved, it will trigger Line update.
              // If a Triangle was moved, it will trigger Point update, which then triggers Line update.
              selectedIds.forEach(id => {
                  finalShapes = resolveConstraints(finalShapes, id, canvasSize.width, svgHeight, pixelsPerUnit, originY);
              });

              return finalShapes.map((s: Shape) => (s.type === ShapeType.MARKER && s.markerConfig && selectedIds.has(s.markerConfig.targets[0].shapeId)) ? (recalculateMarker(s, finalShapes) || s) : s);
          });
          updateTransientVisuals(null);
          transientStateRef.current = null;
          domCacheRef.current.clear();
      }

      if (tool === ToolType.COMPASS) { if (compassPreviewPath) { saveHistory(); const center = compassState.center!; const radius = distance(center, compassState.radiusPoint!); const startAngle = compassState.startAngle!; const endAngle = startAngle + compassState.accumulatedRotation; const arcShape = createArcShape(generateId(), center, radius, startAngle, endAngle, compassPreviewPath, currentStyle); setShapes(prev => [...prev, arcShape]); setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null); } return; }
      if (activeShapeId && tool === ToolType.LINE) {
          if (dragStartPos && distance(dragStartPos, rawPos) > 5) {
              // Fix: Explicitly pass true for isCreatingLine to allow point linking
              const { point: finalEndPos, constraint: endC } = bindPointToShapes(rawPos, [activeShapeId], true);
              const link = buildLinePointsLink(activeLineConstraints[0], endC);

              setShapes(prev => prev.map(s => {
                  if (s.id === activeShapeId) {
                      const updated: Shape = { ...s, points: [s.points[0], finalEndPos] };
                      if (link) updated.constraint = link;
                      return updated;
                  }
                  return s;
              }));
              setSelectedIds(new Set([activeShapeId]));
              setActiveShapeId(null);
              setActiveLineConstraints([]);
          }
          setDragStartPos(null);
          return;
      }
      setDragStartPos(null);
      
      if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) { const shape = shapes.find(s => s.id === activeShapeId); if (shape && shape.points.length > 5) { const recognized = recognizeFreehandShape(shape.points); if (recognized) { let labels: string[] | undefined = undefined; if (autoLabelMode && recognized.type !== ShapeType.LINE) { labels = getNextLabels(shapes, recognized.type === ShapeType.TRIANGLE ? 3 : 4); } setShapes((prev: Shape[]) => prev.map((s: Shape) => s.id === activeShapeId ? { ...s, type: recognized.type, points: recognized.points, labels, usePressure: false } : s)); } } }
      
      if (activeShapeId) {
          const s = shapes.find(sh => sh.id === activeShapeId);
          if (s && distance(s.points[0], rawPos) < 10) {
              const defaultPoints = clickDefaultPoints(tool, rawPos, pixelsPerUnit);
              if (defaultPoints) setShapes((prev: Shape[]) => prev.map((sh: Shape) => sh.id === activeShapeId ? { ...sh, points: defaultPoints } : sh));
          }
          if (tool !== ToolType.FREEHAND) setSelectedIds(new Set([activeShapeId]));
          setActiveShapeId(null);
      }
  };

  return { handlePointerUp };
};
