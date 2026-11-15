import React, { Dispatch, SetStateAction, MutableRefObject, RefObject } from 'react';
import { Shape, ShapeType, ToolType, Point, Constraint, AxisConfig, TransientState } from '../types';
import { recognizeFreehandShape } from '../utils/freehandRecognition';
import { getSnapPoint, snapToRuler } from '../utils/snapping';
import { recalculateMarker } from '../utils/markerEditing';
import { getAngleArcPath } from '../utils/svgPaths';
import { getRotatedCorners, getClosestPointOnShape } from '../utils/shapeGeometry';
import { distance, getAngleDegrees } from '../utils/vectorMath';
import { mathToScreen, screenToMath } from '../utils/coordinates';
import { evaluateQuadratic, generateQuadraticPath } from '../utils/quadraticFunction';
import { resolveConstraints, constrainPointToEdge, constrainPointToPath, buildLinePointsLink } from '../utils/constraintSystem';
import { getHitShape, calculateMovedShape, calculateResizedShape, getSelectionBounds, calculateRotatedShape, removeShapesWithDependents } from '../utils/shapeOperations';
import { getNextLabels } from '../utils/labeling';
import { createToolShape, createTextShape, createRulerShape, createProtractorShape, createFunctionGraphShape, createArcShape, clickDefaultPoints } from '../utils/shapeFactory';
import { CompassState } from './useInteractionSession';

export interface UsePointerHandlersDeps {
    // useInteractionSession
    isDragging: boolean;
    setIsDragging: Dispatch<SetStateAction<boolean>>;
    isRotating: boolean;
    setIsRotating: Dispatch<SetStateAction<boolean>>;
    dragStartPos: Point | null;
    setDragStartPos: Dispatch<SetStateAction<Point | null>>;
    dragHandleIndex: number | null;
    setDragHandleIndex: Dispatch<SetStateAction<number | null>>;
    activeShapeId: string | null;
    setActiveShapeId: Dispatch<SetStateAction<string | null>>;
    activeLineConstraints: (Constraint | undefined)[];
    setActiveLineConstraints: Dispatch<SetStateAction<(Constraint | undefined)[]>>;
    setSnapIndicator: Dispatch<SetStateAction<(Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' }) | null>>;
    setCursorPos: Dispatch<SetStateAction<Point | null>>;
    cursorPosRef: MutableRefObject<Point | null>;
    lastHitTestTime: MutableRefObject<number>;
    isScrollingRef: MutableRefObject<boolean>;
    lastScrollPos: MutableRefObject<{ x: number; y: number } | null>;
    selectionRectRef: RefObject<SVGRectElement>;
    selectionStartRef: MutableRefObject<Point | null>;
    shapeBoundsCache: MutableRefObject<Map<string, { minX: number; minY: number; maxX: number; maxY: number }>>;
    hoveredShapeId: string | null;
    setHoveredShapeId: Dispatch<SetStateAction<string | null>>;
    rotationCenter: Point | null;
    isShiftPressed: boolean;
    isAltPressed: boolean;
    compassState: CompassState;
    setCompassState: Dispatch<SetStateAction<CompassState>>;
    compassPreviewPath: string | null;
    setCompassPreviewPath: Dispatch<SetStateAction<string | null>>;
    lastRotationMouseAngle: MutableRefObject<number>;
    // useDocument
    shapes: Shape[];
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    shapesRef: MutableRefObject<Shape[]>;
    saveHistory: () => void;
    selectedIds: Set<string>;
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    // useViewport
    zoom: number;
    canvasSize: { width: number; height: number };
    svgHeight: number;
    pixelsPerUnit: number;
    originY: number;
    containerRef: RefObject<HTMLDivElement>;
    // useTransientTransforms
    transientStateRef: MutableRefObject<TransientState | null>;
    domCacheRef: MutableRefObject<Map<string, Element>>;
    initialShapeStateRef: MutableRefObject<Map<string, Shape>>;
    updateTransientVisuals: (state: TransientState | null) => void;
    refreshDomCache: (idsOverride?: Set<string>) => void;
    // useInlineEditors
    textEditing: { id: string; x: number; y: number; text: string } | null;
    angleEditing: { id: string; index: number; x: number; y: number; value: string } | null;
    finishTextEditing: () => void;
    setTextEditing: Dispatch<SetStateAction<{ id: string; x: number; y: number; text: string } | null>>;
    // Editor locals
    svgRef: RefObject<SVGSVGElement>;
    tool: ToolType;
    setTool: Dispatch<SetStateAction<ToolType>>;
    currentStyle: { fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted' };
    axisConfig: AxisConfig;
    lockBackground: boolean;
    pickingMirrorMode: boolean;
    markingAnglesMode: boolean;
    autoLabelMode: boolean;
    smartSketchMode: boolean;
    pressureEnabled: boolean;
    generateId: () => string;
    handleFold: (lineId: string) => void;
}

/**
 * Pointer gesture handlers for the drawing canvas.
 * Moved verbatim from Editor.tsx (S7); the only delta is the identifier
 * source (destructured deps instead of the Editor closure). Plain functions,
 * recreated each render — no useCallback, exactly as before.
 */
export const usePointerHandlers = ({
    isDragging, setIsDragging, isRotating, setIsRotating, dragStartPos, setDragStartPos,
    dragHandleIndex, setDragHandleIndex, activeShapeId, setActiveShapeId,
    activeLineConstraints, setActiveLineConstraints, setSnapIndicator, setCursorPos,
    cursorPosRef, lastHitTestTime, isScrollingRef, lastScrollPos,
    selectionRectRef, selectionStartRef, shapeBoundsCache,
    hoveredShapeId, setHoveredShapeId, rotationCenter, isShiftPressed, isAltPressed,
    compassState, setCompassState, compassPreviewPath, setCompassPreviewPath, lastRotationMouseAngle,
    shapes, setShapes, shapesRef, saveHistory, selectedIds, setSelectedIds,
    zoom, canvasSize, svgHeight, pixelsPerUnit, originY, containerRef,
    transientStateRef, domCacheRef, initialShapeStateRef, updateTransientVisuals, refreshDomCache,
    textEditing, angleEditing, finishTextEditing, setTextEditing,
    svgRef, tool, setTool, currentStyle, axisConfig, lockBackground,
    pickingMirrorMode, markingAnglesMode, autoLabelMode, smartSketchMode, pressureEnabled,
    generateId, handleFold
}: UsePointerHandlersDeps) => {
  const getMousePos = (e: React.PointerEvent | PointerEvent | React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0, p: 0.5 };
    const rect = svgRef.current.getBoundingClientRect();
    let pressure = (e as PointerEvent).pressure;
    if (pressure === undefined || (e as any).pointerType === 'mouse') pressure = 0.5;
    const raw = { 
        x: ((e as any).clientX - rect.left) / zoom, 
        y: ((e as any).clientY - rect.top) / zoom, 
        p: pressure 
    };
    if (tool === ToolType.FREEHAND) { setSnapIndicator(null); return raw; }
    if (snap && !isShiftPressed && !isAltPressed) { 
        // FIX: Exclude selected shapes from snapping when dragging handles to prevent jitter
        // due to snapping to the shape's own vertices.
        const excludeIds = activeShapeId 
            ? [activeShapeId] 
            : (tool === ToolType.SELECT && isDragging && selectedIds.size > 0 ? Array.from(selectedIds) : []);

        const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) ? { width: canvasSize.width, height: svgHeight, ppu: pixelsPerUnit } : undefined;
        const { point, snapped, type } = getSnapPoint(raw, shapes, excludeIds, gridSnapConfig);
        
        if (!snapped && hoveredShapeId) {
            const shape = shapes.find(s => s.id === hoveredShapeId);
            if (shape?.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
                const mp = screenToMath(raw, canvasSize.width, svgHeight, pixelsPerUnit, originY);
                const my = evaluateQuadratic(mp.x, shape.formulaParams, shape.functionForm, shape.functionType || 'quadratic');
                const sp = mathToScreen({ x: mp.x, y: my }, canvasSize.width, svgHeight, pixelsPerUnit, originY);
                if (Math.abs(sp.y - raw.y) < 20) { setSnapIndicator({ ...sp, type: 'midpoint' }); return { ...sp, p: pressure }; }
            }
        }
        setSnapIndicator(snapped ? { ...point, type } : null); return { ...point, p: pressure };
    }
    setSnapIndicator(null); return raw;
  };

  // Unified logic to determine if a point should be bound to a shape's edge or another point
  const bindPointToShapes = (pos: Point, excludeIds: string[] = [], isCreatingLine: boolean = false): { point: Point, constraint?: Constraint } => {
    const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) ? { width: canvasSize.width, height: svgHeight, ppu: pixelsPerUnit } : undefined;
    const snapResult = getSnapPoint(pos, shapesRef.current.filter(s => !excludeIds.includes(s.id)), [], gridSnapConfig);
    
    let finalConstraint = snapResult.constraint;
    
    // --- SEMANTIC CONSTRAINT FILTERING ---
    if (isCreatingLine) {
        // LINES: Must prioritize linking to existing POINTS (points_link)
        // Robustness Fallback: If near a POINT, force points_link
        if (!finalConstraint || finalConstraint.type !== 'points_link') {
            const nearPoint = shapesRef.current.find(s => s.type === ShapeType.POINT && !excludeIds.includes(s.id) && distance(pos, s.points[0]) < 10);
            if (nearPoint) finalConstraint = { type: 'points_link', parentId: nearPoint.id };
        }
    } else {
        // POINTS: Must NEVER link to another POINT. They only link to EDGES or PATHS.
        if (finalConstraint?.type === 'points_link') {
            finalConstraint = undefined; // Reject point-to-point binding
        }
    }

    return {
      point: snapResult.snapped ? snapResult.point : pos,
      constraint: finalConstraint
    };
  };

  const getHittableShapes = (p: Point) => {
      return shapes.filter(s => {
          if (s.type === ShapeType.IMAGE && s.isBackground && lockBackground) {
              const corners = getRotatedCorners(s);
              const distToEdge = distance(p, getClosestPointOnShape(p, { ...s, points: corners, type: ShapeType.POLYGON }));
              return distToEdge <= 15;
          }
          return true;
      });
  };

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
            const updatedShape = calculateResizedShape(snapshotShape, pos, dragHandleIndex, isShiftPressed);
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
             const resizedDummy = calculateResizedShape(dummyShape, pos, dragHandleIndex, isShiftPressed);
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
          const finalPos = getMousePos(e, true); 
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

    return { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick, getMousePos };
};
