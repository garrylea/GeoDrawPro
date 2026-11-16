import React from 'react';
import { ShapeType, ToolType, Point, Constraint } from '../../types';
import { getSnapPoint } from '../../utils/snapping';
import { getRotatedCorners, getClosestPointOnShape } from '../../utils/shapeGeometry';
import { distance } from '../../utils/vectorMath';
import { mathToScreen, screenToMath, clientToCanvas } from '../../utils/coordinates';
import { evaluateQuadratic } from '../../utils/quadraticFunction';
import type { UsePointerHandlersDeps } from './pointerTypes';

/** Coordinate/snap/hit-test helpers (moved verbatim from usePointerHandlers.ts, S10). */
export const createPointerHelpers = ({
    svgRef, zoom, tool, setSnapIndicator, isShiftPressed, isAltPressed, activeShapeId,
    isDragging, selectedIds, axisConfig, canvasSize, svgHeight, pixelsPerUnit, originY,
    shapes, shapesRef, hoveredShapeId, lockBackground,
}: UsePointerHandlersDeps) => {
  const getMousePos = (e: React.PointerEvent | PointerEvent | React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0, p: 0.5 };
    let pressure = (e as PointerEvent).pressure;
    if (pressure === undefined || (e as any).pointerType === 'mouse') pressure = 0.5;
    const base = clientToCanvas(e as { clientX: number; clientY: number }, svgRef.current, zoom);
    const raw = { ...base, p: pressure };
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

  return { getMousePos, bindPointToShapes, getHittableShapes };
};

export type PointerHelpers = ReturnType<typeof createPointerHelpers>;
