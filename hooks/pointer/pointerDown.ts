import React from 'react';
import { Shape, ShapeType, ToolType } from '../../types';
import { getHitShape, removeShapesWithDependents } from '../../utils/shapeOperations';
import { getRotatedCorners, getClosestPointOnShape } from '../../utils/shapeGeometry';
import { distance, getAngleDegrees } from '../../utils/vectorMath';
import { generateQuadraticPath } from '../../utils/quadraticFunction';
import { buildLinePointsLink } from '../../utils/constraintSystem';
import { getNextLabels } from '../../utils/labeling';
import { createToolShape, createTextShape, createRulerShape, createProtractorShape, createFunctionGraphShape } from '../../utils/shapeFactory';
import type { UsePointerHandlersDeps } from './pointerTypes';
import type { PointerHelpers } from './pointerHelpers';

/** Pointer-down and double-click dispatch (moved verbatim from usePointerHandlers.ts, S10). */
export const createPointerDown = (
    {
        isScrollingRef, lastScrollPos, textEditing, angleEditing, finishTextEditing,
        svgRef, zoom, tool, setSelectedIds, activeShapeId, saveHistory, generateId,
        setShapes, currentStyle, setActiveShapeId, activeLineConstraints, setActiveLineConstraints,
        setDragStartPos, setIsDragging, canvasSize, svgHeight, pixelsPerUnit, originY,
        compassState, setCompassState, shapes, refreshDomCache, setTool, handleFold,
        pickingMirrorMode, markingAnglesMode, autoLabelMode, pressureEnabled, setTextEditing,
        selectedIds, selectionStartRef, shapeBoundsCache, selectionRectRef,
    }: UsePointerHandlersDeps,
    { getMousePos, bindPointToShapes, getHittableShapes }: PointerHelpers,
) => {
  const handleDoubleClick = (e: React.MouseEvent) => {
      const pos = getMousePos(e, false);
      
      const hittableShapes = getHittableShapes(pos);
      let hit = getHitShape(pos, hittableShapes, canvasSize.width, svgHeight, pixelsPerUnit, originY);
      if (!hit) {
          const target = e.target as Element;
          const group = target.closest('g[data-shape-id]');
          if (group) { const id = group.getAttribute('data-shape-id'); if (id) { const s = shapes.find(sh => sh.id === id); if (s && s.type === ShapeType.TEXT) hit = s; } }
      }
      if (hit && hit.type === ShapeType.TEXT) {
          setTextEditing({ id: hit.id, x: hit.points[0].x, y: hit.points[0].y, text: hit.text || '' }); e.stopPropagation(); e.preventDefault();
      } else if (tool === ToolType.SELECT) { // ALLOW creation even if hitting another shape
          e.preventDefault(); saveHistory(); const id = generateId();
          const newShape = createTextShape(id, pos, currentStyle);
          setShapes(prev => [...prev, newShape]); setTextEditing({ id, x: pos.x, y: pos.y, text: '' }); setSelectedIds(new Set<string>([id]));
      }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) { 
        isScrollingRef.current = true; 
        lastScrollPos.current = { x: e.clientX, y: e.clientY }; 
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        e.preventDefault(); 
        return; 
    }
    if (textEditing || angleEditing) { if (textEditing) finishTextEditing(); return; }
    
    const rect = svgRef.current?.getBoundingClientRect();
    const rawPos = { 
        x: (e.clientX - (rect?.left || 0)) / zoom, 
        y: (e.clientY - (rect?.top || 0)) / zoom 
    };
    
    // CRITICAL UX FIX: Disable snapping for FREEHAND tool to allow smooth drawing
    const shouldSnap = tool !== ToolType.FREEHAND;
    
    // Use the unified binder for initial position and constraint. 
    // Exclude activeShapeId if we are finishing a multi-click shape (like a LINE).
    const { point: pos, constraint: currentConstraint } = shouldSnap 
        ? bindPointToShapes(rawPos, activeShapeId ? [activeShapeId] : [], tool === ToolType.LINE)
        : { point: rawPos, constraint: undefined };

    if (tool !== ToolType.SELECT && tool !== ToolType.COMPASS && tool !== ToolType.ERASER && tool !== ToolType.RULER && !pickingMirrorMode && !markingAnglesMode) setSelectedIds(new Set());
    
    if (tool === ToolType.LINE) {
        if (activeShapeId) {
            // Only establish points_link if we snapped to a POINT shape
            const link = buildLinePointsLink(activeLineConstraints[0], currentConstraint);

            setShapes(prev => prev.map(s => {
                if (s.id === activeShapeId) {
                    const updated: Shape = { ...s, points: [s.points[0], pos] };
                    if (link) updated.constraint = link;
                    return updated;
                }
                return s;
            }));
            setActiveShapeId(null); setActiveLineConstraints([]); setDragStartPos(null); return;
        }
        else {
            saveHistory(); const id = generateId();
            const newShape = createToolShape(ToolType.LINE, pos, currentStyle, { id });
            setShapes(prev => [...prev, newShape]);

            // Only capture constraint if it's a point link
            const startC = currentConstraint?.type === 'points_link' ? currentConstraint : undefined;
            setActiveShapeId(id); setActiveLineConstraints([startC, undefined]); setDragStartPos(rawPos); return;
        }
    }
    if (tool === ToolType.ERASER) {
        saveHistory(); setIsDragging(true);
        const hit = getHitShape(rawPos, getHittableShapes(rawPos), canvasSize.width, svgHeight, pixelsPerUnit, originY, 12);
        if (hit && hit.type !== ShapeType.IMAGE) { setShapes(prev => removeShapesWithDependents(prev, new Set([hit.id]))); } return;
    }
    if (tool === ToolType.COMPASS) { if (!compassState.center) { setCompassState({ ...compassState, center: pos }); } else { const startAngle = getAngleDegrees(compassState.center, pos); setCompassState({ ...compassState, radiusPoint: pos, startAngle: startAngle, lastMouseAngle: startAngle, accumulatedRotation: 0 }); } return; }
    if (tool === ToolType.RULER) { const existingRuler = shapes.find(s => s.type === ShapeType.RULER); if (existingRuler) { setSelectedIds(new Set([existingRuler.id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([existingRuler.id])); return; } saveHistory(); const id = generateId(); const newShape = createRulerShape(id, pos); setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setTool(ToolType.SELECT); return; }
    if (pickingMirrorMode) { const line = shapes.find(s => (s.type === ShapeType.LINE || s.type === ShapeType.FREEHAND) && distance(pos, getClosestPointOnShape(pos, s)) < 10); if (line) handleFold(line.id); return; }
    if (tool === ToolType.FUNCTION || tool === ToolType.LINEAR_FUNCTION) { 
        const hit = getHitShape(rawPos, getHittableShapes(rawPos), canvasSize.width, svgHeight, pixelsPerUnit, originY);
        if (hit && hit.type === ShapeType.FUNCTION_GRAPH) {
            setTool(ToolType.SELECT); setSelectedIds(new Set([hit.id])); setActiveShapeId(null); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([hit.id])); return;
        }
        saveHistory(); const id = generateId(); const isLinear = tool === ToolType.LINEAR_FUNCTION; const params = isLinear ? { k: 1, b: 0 } : { a: 1, b: 0, c: 0, h: 0, k: 0 }; const fType = isLinear ? 'linear' : 'quadratic'; const pathData = generateQuadraticPath(params, 'standard', canvasSize.width, svgHeight, pixelsPerUnit, fType, originY); const newShape = createFunctionGraphShape(id, params, fType, pathData, currentStyle); setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); return;
    }
    if (tool === ToolType.SELECT) { 
        const hit = getHitShape(rawPos, getHittableShapes(rawPos), canvasSize.width, svgHeight, pixelsPerUnit, originY); 

        if (hit) { 
            let newSelection: Set<string>;
            if (e.shiftKey || e.ctrlKey) { newSelection = new Set(selectedIds); if (newSelection.has(hit.id)) newSelection.delete(hit.id); else newSelection.add(hit.id); } 
            else if (selectedIds.has(hit.id)) { newSelection = selectedIds; } 
            else { newSelection = new Set([hit.id]); }
            
            setSelectedIds(newSelection);
            setDragStartPos(rawPos);
            setIsDragging(true);
            refreshDomCache(newSelection);
            return; 
        } 
        if (!e.shiftKey && !e.ctrlKey) setSelectedIds(new Set());
        selectionStartRef.current = rawPos; shapeBoundsCache.current.clear();
        shapes.forEach(s => { const corners = getRotatedCorners(s); if (corners.length === 0) return; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; corners.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); shapeBoundsCache.current.set(s.id, { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2 }); });
        if (selectionRectRef.current) { selectionRectRef.current.setAttribute('x', rawPos.x.toString()); selectionRectRef.current.setAttribute('y', rawPos.y.toString()); selectionRectRef.current.setAttribute('width', '0'); selectionRectRef.current.setAttribute('height', '0'); selectionRectRef.current.style.display = 'block'; }
        setIsDragging(true); return; 
    }
    saveHistory(); 
    if (tool === ToolType.PROTRACTOR) { const existingProtractor = shapes.find(s => s.type === ShapeType.PROTRACTOR); if (existingProtractor) { setSelectedIds(new Set([existingProtractor.id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([existingProtractor.id])); return; } const id = generateId(); const newShape = createProtractorShape(id, pos, currentStyle.stroke); setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([id])); return; }
    if (tool === ToolType.TEXT) { e.preventDefault(); const id = generateId(); const newShape = createTextShape(id, pos, currentStyle); setShapes(prev => [...prev, newShape]); setTextEditing({ id, x: pos.x, y: pos.y, text: '' }); setSelectedIds(new Set<string>([id])); return; }
    setDragStartPos(rawPos); setIsDragging(true); const id = generateId();
    const pointCount = tool === ToolType.TRIANGLE ? 3 : (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE ? 4 : 2);
    let labels: string[] | undefined = (autoLabelMode && tool !== ToolType.POINT && tool !== ToolType.FREEHAND) ? getNextLabels(shapes, pointCount) : undefined;
    const newShape = createToolShape(tool, pos, currentStyle, { id, labels, usePressure: tool === ToolType.FREEHAND && pressureEnabled });
    if (tool === ToolType.POINT && currentConstraint) newShape.constraint = currentConstraint;
    setShapes(prev => [...prev, newShape]); setActiveShapeId(id);
  };

  return { handlePointerDown, handleDoubleClick };
};
