
import React, { useState, useRef, useEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, MarkerType, MarkerConfig, Constraint } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { CompassOverlay } from './components/ConstructionTools';
import { exportCanvas, saveProject, loadProject, isElectron } from './utils/exportUtils';
import { getSnapPoint, calculateTriangleAngles, parseAngle, solveTriangleASA, getShapeSize, distance, isShapeInRect, getDetailedSnapPoints, getShapeCenter, getRotatedCorners, rotatePoint, bakeRotation, reflectPointAcrossLine, getAngleDegrees, getAngleCurve, getAngleArcPath, simplifyToQuadratic, recognizeFreehandShape, recalculateMarker, getClosestPointOnShape, getProjectionParameter, lerp, getShapeIntersection, resolveConstraints, getSmoothSvgPath, getProjectedPointOnLine, getPixelsPerUnit, evaluateQuadratic, mathToScreen, screenToMath, generateQuadraticPath } from './utils/mathUtils';
import { Download, Trash2, Settings2, Grid3X3, Minus, Plus, Magnet, Spline, Undo, Eraser, Image as ImageIcon, Radius, Wand2, Calculator, Save, FolderOpen, CaseUpper, Sparkles, CornerRightUp, ArrowRight, Hash, Link2, Footprints, FoldHorizontal, FunctionSquare } from 'lucide-react';

export default function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  // History Stack for Undo
  const [history, setHistory] = useState<Shape[][]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);
  
  // Extended style state
  const [currentStyle, setCurrentStyle] = useState<{
      fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted'
  }>({
      ...DEFAULT_SHAPE_PROPS,
      strokeType: 'solid'
  });

  const [axisConfig, setAxisConfig] = useState<AxisConfig>({
    visible: true,
    ticks: 8, // Adjusted default ticks for better initial view
    color: '#94a3b8',
    showGrid: true,
  });

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null); 
  const [dragHandleIndex, setDragHandleIndex] = useState<number | null>(null); 
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null); 
  
  // Dynamic Geometry: Hovering & Constraints
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  // Store intersection constraint preview if hovering over intersection
  const [hoveredConstraint, setHoveredConstraint] = useState<Constraint | null>(null);
  
  // Locus Generation (Trace) State
  const [traceBuffer, setTraceBuffer] = useState<{ id: string, points: Point[] }[]>([]);

  // Store initial ratios for constrained points during resizing
  const [resizeContext, setResizeContext] = useState<{
      constrainedChildren: { childId: string; t: number; segmentIndex: number }[];
      connectedLines: { lineId: string; pointIndex: number }[];
  } | null>(null);

  // Rotation State
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Operations State
  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(false);
  const [smartSketchMode, setSmartSketchMode] = useState(false);

  // CONSTRUCTION TOOLS STATE
  const [compassState, setCompassState] = useState<{
      center: Point | null; // Step 1
      radiusPoint: Point | null; // Step 2 (Locked)
      startAngle: number | null; // Step 3 (Drawing started)
  }>({ center: null, radiusPoint: null, startAngle: null });

  // Drag Context
  const [dragContext, setDragContext] = useState<{
      movingShapeIds: Set<string>;
      connectedPoints: { shapeId: string; pointIndex: number }[];
  } | null>(null);

  // Tools State
  const [pendingLineStart, setPendingLineStart] = useState<Point | null>(null);
  const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  
  // Helper ref to calculate rotation delta
  const lastRotationMouseAngle = useRef<number>(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Derived Coordinate System Data
  const pixelsPerUnit = getPixelsPerUnit(canvasSize.width, canvasSize.height, axisConfig.ticks);

  useEffect(() => {
    const updateCanvasSize = () => {
        if (svgRef.current) {
            const { clientWidth, clientHeight } = svgRef.current;
            setCanvasSize({ width: clientWidth, height: clientHeight });
        }
    };
    updateCanvasSize();
    const observer = new ResizeObserver(() => {
        updateCanvasSize();
    });
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync Function Paths with Coordinate System Changes (Resize/Zoom/Ticks)
  useEffect(() => {
      setShapes(prev => prev.map(s => {
          if (s.type === ShapeType.FUNCTION_GRAPH && s.formulaParams) {
              const newPath = generateQuadraticPath(
                  s.formulaParams, 
                  s.functionForm || 'standard', 
                  canvasSize.width, 
                  canvasSize.height, 
                  pixelsPerUnit
              );
              return { ...s, pathData: newPath };
          }
          return s;
      }));
  }, [canvasSize.width, canvasSize.height, axisConfig.ticks]);

  useEffect(() => {
      if (textEditing && inputRef.current) {
          setTimeout(() => inputRef.current?.focus(), 50);
      }
  }, [textEditing]);

  // --- Undo Logic ---
  const saveHistory = () => {
      setHistory(prev => [...prev, shapes]);
  };

  const undo = () => {
      if (history.length === 0) return;
      const previousState = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1)); 
      setShapes(previousState);
      setSelectedIds(new Set<string>()); 
      setPendingLineStart(null); 
      setActiveShapeId(null);
  };

  // --- Deletion Logic ---
  const deleteSelected = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      // Ensure idsToDelete is strongly typed as Set<string> to avoid 'unknown' errors
      const idsToDelete = new Set<string>(Array.from(selectedIds) as string[]);
      
      setShapes(prev => prev.map(s => {
          if (s.constraint && idsToDelete.has(s.constraint.parentId || '')) {
              // Unbind child if parent deleted
              const { constraint, ...rest } = s;
              return rest;
          }
          if (s.constraint && s.constraint.type === 'intersection' && s.constraint.parents) {
              if (s.constraint.parents.some(pid => idsToDelete.has(pid))) {
                  // Unbind intersection if one parent deleted
                  const { constraint, ...rest } = s;
                  return rest;
              }
          }
          return s;
      }).filter(s => !idsToDelete.has(s.id) && 
                !(s.type === ShapeType.MARKER && s.markerConfig?.targets.some(t => idsToDelete.has(t.shapeId)))
      ));

      setSelectedIds(new Set<string>());
  };

  const clearCanvas = () => {
    if (shapes.length === 0) return;
    if (confirm('Clear all drawings? This cannot be undone.')) {
        saveHistory(); 
        setShapes([]);
        setSelectedIds(new Set<string>());
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);
          if (e.key === 'Shift') setIsShiftPressed(true);

          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
          if (textEditing) return;

          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              handleSaveProject();
              return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
              e.preventDefault();
              handleOpenProjectClick();
              return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              undo();
              return;
          }

          if (e.key === 'Escape') {
              if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
              if (markingAnglesMode) { setMarkingAnglesMode(false); return; }
              if (pendingLineStart) { setPendingLineStart(null); setTool(ToolType.SELECT); return; }
              if (activeShapeId) {
                  const idToRemove = activeShapeId;
                  setShapes(prev => prev.filter(s => s.id !== idToRemove));
                  setActiveShapeId(null);
                  setIsDragging(false);
                  setTool(ToolType.SELECT);
                  return;
              }
              // Reset Compass
              if (tool === ToolType.COMPASS && compassState.center) {
                  setCompassState({ center: null, radiusPoint: null, startAngle: null });
                  return;
              }

              if (selectedIds.size > 0) { setSelectedIds(new Set<string>()); setPivotIndex('center'); return; }
              if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
              setSnapIndicator(null);
          }

          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
              e.preventDefault();
              deleteSelected();
          }

          if (e.key === 'Enter' && selectedIds.size === 1) {
              // Ensure we treat 'selectedIds' as string collection to avoid 'unknown' issues
              const id = (Array.from(selectedIds) as string[])[0];
              const s = shapes.find(sh => sh.id === id);
              if (s && s.type === ShapeType.TEXT) {
                  e.preventDefault();
                  setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
              }
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(false);
          if (e.key === 'Shift') setIsShiftPressed(false);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [selectedIds, textEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, pendingLineStart, tool, compassState]); 

  const getMousePos = (e: React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const raw = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    if (tool === ToolType.FREEHAND) {
        setSnapIndicator(null);
        return raw;
    }

    if (snap && !isShiftPressed) { // DISABLE SNAP IF SHIFT PRESSED
        const exclude = hoveredShapeId ? [hoveredShapeId] : [];
        // Ensure selected shapes AND active drawing shape are ALWAYS excluded from snapping to avoid self-snapping
        const selectedIdsList = Array.from(selectedIds) as string[];
        if (activeShapeId) selectedIdsList.push(activeShapeId);
        
        const { point, snapped, constraint } = getSnapPoint(raw, shapes, [...selectedIdsList, ...exclude]);
        
        // SPECIAL SNAP LOGIC FOR FUNCTIONS:
        if (!snapped && hoveredShapeId) {
            const shape = shapes.find(s => s.id === hoveredShapeId);
            if (shape?.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
                // Map screen X to Math X
                const mp = screenToMath(raw, canvasSize.width, canvasSize.height, pixelsPerUnit);
                // Evaluate Y
                const my = evaluateQuadratic(mp.x, shape.formulaParams, shape.functionForm);
                // Map back
                const sp = mathToScreen({ x: mp.x, y: my }, canvasSize.width, canvasSize.height, pixelsPerUnit);
                
                // Only snap if vertical distance is small
                if (Math.abs(sp.y - raw.y) < 20) {
                     setSnapIndicator(sp);
                     setHoveredConstraint({ type: 'on_path', parentId: hoveredShapeId, paramX: mp.x });
                     return sp;
                }
            }
        }

        setSnapIndicator(snapped ? point : null);
        setHoveredConstraint(constraint || null); 
        return point;
    }
    setSnapIndicator(null);
    setHoveredConstraint(null);
    return raw;
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleToolChange = (newTool: ToolType) => {
    setTool(newTool);
    setSelectedIds(new Set<string>());
    setSnapIndicator(null);
    setCursorPos(null);
    setSelectionBox(null);
    setPendingLineStart(null);
    setTextEditing(null);
    setPivotIndex('center'); 
    setPickingMirrorMode(false);
    setMarkingAnglesMode(false);
    setHoveredShapeId(null);
    setHoveredConstraint(null);
    setCompassState({ center: null, radiusPoint: null, startAngle: null });
  };

  const updateShapes = (ids: Set<string>, updates: Partial<Shape> | ((s: Shape) => Shape)) => {
    setShapes(prev => {
        // 1. First Pass: Apply Direct Updates
        let updatedShapes = prev.map(s => {
            if (!ids.has(s.id)) return s;
            if (typeof updates === 'function') return updates(s);
            return { ...s, ...updates };
        });

        // 2. Resolve Constraints (Propagation)
        // Pass context needed for resolving function constraints (canvas size, scale)
        updatedShapes = resolveConstraints(updatedShapes, canvasSize.width, canvasSize.height, pixelsPerUnit);
        
        return updatedShapes;
    });
  };

  const handleFormulaParamChange = (key: 'a' | 'b' | 'c' | 'h' | 'k', value: number) => {
      if (selectedIds.size === 1) {
          const id = (Array.from(selectedIds) as string[])[0];
          const shape = shapes.find(s => s.id === id);
          if (shape && shape.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
              const newParams = { ...shape.formulaParams, [key]: value };
              const newPath = generateQuadraticPath(
                  newParams, 
                  shape.functionForm || 'standard', 
                  canvasSize.width, 
                  canvasSize.height, 
                  pixelsPerUnit
              );
              
              const updateSet = new Set<string>();
              updateSet.add(id);
              updateShapes(updateSet, { formulaParams: newParams, pathData: newPath });
          }
      }
  };

  const toggleFunctionForm = (form: 'standard' | 'vertex') => {
      if (selectedIds.size === 1) {
          const id = (Array.from(selectedIds) as string[])[0];
          const shape = shapes.find(s => s.id === id);
          if (shape && shape.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
              // Convert logic or reset? Resetting is safer for teaching.
              let newParams = { ...shape.formulaParams };
              if (form === 'vertex') {
                  // Default vertex at 0,0
                  newParams.h = 0; newParams.k = 0;
                  newParams.a = shape.formulaParams.a;
              } else {
                  // Standard form defaults
                  newParams.a = shape.formulaParams.a;
                  newParams.b = 0; newParams.c = 0;
              }
              const newPath = generateQuadraticPath(newParams, form, canvasSize.width, canvasSize.height, pixelsPerUnit);
              
              const updateSet = new Set<string>();
              updateSet.add(id);
              updateShapes(updateSet, { functionForm: form, formulaParams: newParams, pathData: newPath });
          }
      }
  }

  // --- Fold Animation Logic ---
  const handleFold = (lineId: string) => {
      const mirrorShape = shapes.find(s => s.id === lineId);
      if (!mirrorShape || (mirrorShape.type !== ShapeType.LINE && mirrorShape.type !== ShapeType.FREEHAND)) {
          alert("Please select a valid line/segment as the fold axis.");
          return;
      }
      const axis = { p1: getRotatedCorners(mirrorShape)[0], p2: getRotatedCorners(mirrorShape)[1] };
      const targetIds = (Array.from(selectedIds) as string[]).filter(id => id !== lineId);
      if (targetIds.length === 0) {
          alert("Select a shape to fold.");
          return;
      }
      saveHistory();
      const newShapes: Shape[] = [];
      const animations: { id: string, startPoints: Point[], axis: {p1: Point, p2: Point}, originalType: ShapeType }[] = [];

      setShapes(prev => {
          const next = [...prev];
          targetIds.forEach(tid => {
              const original = next.find(s => s.id === tid);
              if (!original) return;
              const originalIndex = next.findIndex(s => s.id === tid);
              next[originalIndex] = { ...original, strokeType: 'dashed', stroke: '#9ca3af', fill: 'none' };
              const baked = bakeRotation(original);
              const animatorId = generateId();
              const animator: Shape = {
                  ...baked,
                  id: animatorId,
                  type: [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(baked.type) ? ShapeType.POLYGON : baked.type,
                  points: [ShapeType.RECTANGLE, ShapeType.SQUARE].includes(baked.type) ? getRotatedCorners(baked) : baked.points,
                  strokeType: 'solid',
                  fill: original.fill
              } as any;
              if([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(baked.type)) {
                   if (baked.type === ShapeType.CIRCLE || baked.type === ShapeType.ELLIPSE) {
                       animator.type = ShapeType.FREEHAND;
                       animator.points = getDetailedSnapPoints(baked).slice(0, -1);
                   }
              }
              next.push(animator);
              animations.push({ id: animatorId, startPoints: JSON.parse(JSON.stringify(animator.points)), axis, originalType: original.type });
          });
          return next;
      });

      let startTime = Date.now();
      const duration = 1000;
      const loop = () => {
          const now = Date.now();
          const p = Math.min((now - startTime) / duration, 1);
          const ease = p * (2 - p);
          const angle = ease * Math.PI;
          const cos = Math.cos(angle);
          setShapes(current => current.map(s => {
              const anim = animations.find(a => a.id === s.id);
              if (!anim) return s;
              const newPoints = anim.startPoints.map(pt => {
                  const proj = getProjectedPointOnLine(pt, anim.axis.p1, anim.axis.p2);
                  const vec = { x: pt.x - proj.x, y: pt.y - proj.y };
                  return { x: proj.x + vec.x * cos, y: proj.y + vec.y * cos };
              });
              return { ...s, points: newPoints };
          }));
          if (p < 1) {
              requestAnimationFrame(loop);
          } else {
              setShapes(current => current.map(s => {
                  const anim = animations.find(a => a.id === s.id);
                  if (!anim) return s;
                  const finalPoints = anim.startPoints.map(pt => reflectPointAcrossLine(pt, anim.axis.p1, anim.axis.p2));
                  return { ...s, points: finalPoints };
              }));
              const nextSelected = new Set<string>();
              animations.forEach(a => nextSelected.add(a.id));
              setSelectedIds(nextSelected);
              setPickingMirrorMode(false);
          }
      };
      requestAnimationFrame(loop);
  };

  const calculateDragContext = (initialSelection: Set<string>, currentShapes: Shape[] = shapes) => {
      const movingIds = new Set<string>(initialSelection);
      const queue = Array.from(initialSelection) as string[];
      const visited = new Set(initialSelection);

      while(queue.length > 0) {
          const currentId = queue.shift()!;
          const leader = currentShapes.find(s => s.id === currentId);
          if (!leader) continue;
          
          const leaderSize = getShapeSize(leader);
          const leaderSnapPoints = getDetailedSnapPoints(leader);

          currentShapes.forEach(follower => {
              if (visited.has(follower.id)) return;
              if (follower.constraint) {
                  const pid = follower.constraint.parentId;
                  const parents = follower.constraint.parents;
                  if ((pid && pid === currentId) || (parents && parents.includes(currentId))) {
                      movingIds.add(follower.id);
                      visited.add(follower.id);
                      queue.push(follower.id);
                      return;
                  }
              }
              const isAttached = follower.points.some(fp => leaderSnapPoints.some(lp => distance(fp, lp) < 10));
              if (isAttached) {
                  const followerSize = getShapeSize(follower);
                  if (leaderSize > followerSize || follower.type === ShapeType.POINT || follower.type === ShapeType.TEXT) {
                      movingIds.add(follower.id);
                      visited.add(follower.id);
                      queue.push(follower.id);
                  }
              }
          });
      }
      const connectedPoints: { shapeId: string; pointIndex: number }[] = [];
      const allMovingShapes = currentShapes.filter(s => movingIds.has(s.id));
      const groupSnapPoints = allMovingShapes.flatMap(s => getDetailedSnapPoints(s));
      currentShapes.forEach(shape => {
          if (movingIds.has(shape.id)) return; 
          shape.points.forEach((pt, idx) => {
              const isConnected = groupSnapPoints.some(gp => distance(pt, gp) < 10);
              if (isConnected) {
                  connectedPoints.push({ shapeId: shape.id, pointIndex: idx });
              }
          });
      });
      return { movingShapeIds: movingIds, connectedPoints };
  };

  const toggleMarkAnglesMode = () => {
      if (selectedIds.size === 0) return;
      setMarkingAnglesMode(!markingAnglesMode);
  };

  const toggleTraceMode = () => {
      if (selectedIds.size === 0) return;
      setShapes(prev => prev.map(s => {
          if (selectedIds.has(s.id)) {
              return { ...s, isTracing: !s.isTracing };
          }
          return s;
      }));
  };

  const handleSmoothCurve = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      // Ensure we convert to array of strings explicitly before creating Set to satisfy Typescript
      const idsToUpdate = new Set<string>(Array.from(selectedIds) as string[]);
      setShapes(prev => prev.map(s => {
          if (idsToUpdate.has(s.id) && s.type === ShapeType.FREEHAND) {
              const simplifiedPoints = simplifyToQuadratic(s.points);
              return { ...s, points: simplifiedPoints };
          }
          return s;
      }));
  };

  const handleAddMarker = (type: MarkerType) => {
      if (selectedIds.size === 0) return;
      saveHistory();
      const selectedShapes = shapes.filter(s => selectedIds.has(s.id));
      const newMarkers: Shape[] = [];
      const createMarker = (config: MarkerConfig) => {
          const id = generateId();
          const marker: Shape = {
              id, type: ShapeType.MARKER, points: [],
              fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0,
              markerConfig: config
          };
          const updated = recalculateMarker(marker, shapes);
          if (updated) newMarkers.push(updated);
      };
      if (type === 'perpendicular') {
          if (selectedShapes.length === 2) {
             createMarker({ type: 'perpendicular', targets: [ { shapeId: selectedShapes[0].id, pointIndices: [0, 1] }, { shapeId: selectedShapes[1].id, pointIndices: [0, 1] } ] });
          }
          else if (selectedShapes.length === 1) {
              const s = selectedShapes[0];
              if ([ShapeType.RECTANGLE, ShapeType.SQUARE].includes(s.type)) {
                  createMarker({ type: 'perpendicular', targets: [{ shapeId: s.id, pointIndices: [2, 3, 0] }] });
              } 
              else if (s.type === ShapeType.TRIANGLE && s.points.length === 3) {
                  const angles = calculateTriangleAngles(getRotatedCorners(s));
                  const angleArr = [angles.A, angles.B, angles.C];
                  const idx90 = angleArr.findIndex(a => Math.abs(a - 90) < 5); 
                  if (idx90 !== -1) {
                      const prev = (idx90 - 1 + 3) % 3; const next = (idx90 + 1) % 3;
                      createMarker({ type: 'perpendicular', targets: [{ shapeId: s.id, pointIndices: [prev, idx90, next] }] });
                  } else {
                      createMarker({ type: 'perpendicular', targets: [{ shapeId: s.id, pointIndices: [0, 1, 2] }] });
                  }
              }
          }
      } 
      else if (type === 'parallel_arrow' || type === 'equal_tick') {
          selectedShapes.forEach(s => {
              let numEdges = 0;
              if (s.type === ShapeType.LINE) numEdges = 1;
              else if (s.type === ShapeType.TRIANGLE) numEdges = 3;
              else if (s.type === ShapeType.RECTANGLE || s.type === ShapeType.SQUARE) numEdges = 4;
              if (numEdges === 0) return;
              const existing = shapes.filter(m => m.type === ShapeType.MARKER && m.markerConfig?.type === type && m.markerConfig.targets[0].shapeId === s.id);
              const usedEdgeIndices = existing.map(m => m.markerConfig!.targets[0].pointIndices[0]);
              let nextEdge = 0;
              if (usedEdgeIndices.length > 0) {
                  const maxUsed = Math.max(...usedEdgeIndices); nextEdge = (maxUsed + 1) % numEdges;
              }
              const idx1 = nextEdge; const idx2 = (nextEdge + 1) % numEdges;
              if (s.type === ShapeType.LINE) {
                  createMarker({ type: type, targets: [{ shapeId: s.id, pointIndices: [0, 1] }] });
              } else {
                  createMarker({ type: type, targets: [{ shapeId: s.id, pointIndices: [idx1, idx2] }] });
              }
          });
      }
      setShapes(prev => [...prev, ...newMarkers]);
  };

  const handleSymbolClick = (symbol: string) => {
      if (textEditing) {
          setTextEditing(prev => prev ? ({ ...prev, text: prev.text + symbol }) : null);
          if(inputRef.current) setTimeout(() => inputRef.current?.focus(), 10);
          return;
      }
      if (selectedIds.size === 1) {
          const id = (Array.from(selectedIds) as string[])[0];
          const shape = shapes.find(s => s.id === id);
          if (shape && shape.type === ShapeType.TEXT) {
              saveHistory();
              const updateSet = new Set<string>();
              updateSet.add(id);
              updateShapes(updateSet, { text: (shape.text || '') + symbol });
          }
      }
  };

  const handleCornerClick = (shapeId: string, vertexIndex: number) => {
      saveHistory();
      if (markingAnglesMode) {
          const s = shapes.find(shape => shape.id === shapeId);
          if (!s) return;
          const len = s.type === ShapeType.TRIANGLE ? 3 : (s.type === ShapeType.RECTANGLE || s.type === ShapeType.SQUARE ? 4 : 0);
          if (len === 0) return;
          const prev = (vertexIndex - 1 + len) % len;
          const next = (vertexIndex + 1) % len;
          const mConfig: MarkerConfig = { type: 'angle_arc', targets: [{ shapeId: shapeId, pointIndices: [prev, vertexIndex, next] }] };
          const id = generateId();
          const marker: Shape = { id, type: ShapeType.MARKER, points: [], fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0, markerConfig: mConfig };
          const updated = recalculateMarker(marker, shapes);
          if (updated) setShapes(prev => [...prev, updated]);
          return;
      }
      const s = shapes.find(shape => shape.id === shapeId);
      if (!s) return;
      let corners: Point[] = [];
      if (s.type === ShapeType.TRIANGLE) corners = bakeRotation(s).points;
      else if ([ShapeType.RECTANGLE, ShapeType.SQUARE].includes(s.type)) corners = getRotatedCorners(s);
      else return;
      const curr = corners[vertexIndex];
      const prev = corners[(vertexIndex - 1 + corners.length) % corners.length];
      const next = corners[(vertexIndex + 1) % corners.length];
      const newShape: Shape = {
          id: generateId(), type: ShapeType.PATH, points: [curr], pathData: getAngleCurve(curr, prev, next, 25),
          fill: 'none', stroke: currentStyle.stroke || '#000000', strokeWidth: 2, rotation: 0
      };
      setShapes(prevShapes => [...prevShapes, newShape]);
  };

  const handleSaveProject = () => {
      if (isElectron()) saveProject(shapes, 'project'); 
      else {
          const filename = prompt("Enter project name:", "my-geodraw-project");
          if (filename) saveProject(shapes, filename);
      }
  };

  const handleOpenProjectClick = async () => {
      if (shapes.length > 0 && !confirm("Opening a new project will clear current unsaved changes. Continue?")) return;
      if (isElectron()) {
          try {
             const loadedShapes = await loadProject(); 
             if (loadedShapes) {
                 setShapes(loadedShapes); setHistory([]); setSelectedIds(new Set<string>()); setTool(ToolType.SELECT);
             }
          } catch(e) { console.error(e); }
      } else {
          fileInputRef.current?.click();
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const loadedShapes = await loadProject(file);
          setShapes(loadedShapes); setHistory([]); setSelectedIds(new Set<string>()); setTool(ToolType.SELECT); e.target.value = '';
      } catch (err) { alert("Failed to load project: " + err); }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEditing) return;
    let pos = getMousePos(e, true);

    // COMPASS TOOL LOGIC
    if (tool === ToolType.COMPASS) {
        if (!compassState.center) {
            // Step 1: Set Center
            setCompassState({ ...compassState, center: pos });
        } else if (!compassState.radiusPoint) {
            // Step 2: Set Radius (Click to lock radius and start drawing)
            setCompassState({ ...compassState, radiusPoint: pos, startAngle: getAngleDegrees(compassState.center, pos) });
            // Don't save history yet, wait until arc is drawn
        } else {
            // Step 3: Already drawing? Handled in Mouse Move/Up mostly.
            // If user clicks again while drawing, maybe finalize?
            // Actually, we use drag to draw. So this click might be starting a new arc from same center?
            // Let's reset radius for new arc
            setCompassState({ ...compassState, radiusPoint: null, startAngle: null });
        }
        return;
    }

    // RULER TOOL LOGIC (NEW: Create persistent Ruler Shape)
    if (tool === ToolType.RULER) {
        e.preventDefault();
        saveHistory();
        const id = generateId();
        // Create a horizontal ruler centered at mouse pos
        const width = 400;
        const height = 50;
        const p1 = { x: pos.x - width/2, y: pos.y - height/2 };
        const p2 = { x: pos.x + width/2, y: pos.y + height/2 };
        
        const newShape: Shape = {
            id, 
            type: ShapeType.RULER,
            points: [p1, p2],
            fill: 'transparent',
            stroke: '#94a3b8',
            strokeWidth: 1,
            rotation: 0
        };
        
        setShapes(prev => [...prev, newShape]);
        setSelectedIds(new Set<string>([id]));
        setPivotIndex(99); // Maybe define a special pivot if needed, or default center
        setTool(ToolType.SELECT); // Switch to Select so user can move it immediately
        return;
    }

    if (pickingMirrorMode) { 
        const line = shapes.find(s => (s.type === ShapeType.LINE || s.type === ShapeType.FREEHAND) && distance(pos, getClosestPointOnShape(pos, s)) < 10);
        if (line) { handleFold(line.id); }
        return; 
    }
    
    if (tool === ToolType.FUNCTION) {
        saveHistory();
        const id = generateId();
        const params = { a: 1, b: 0, c: 0, h: 0, k: 0 }; 
        const pathData = generateQuadraticPath(params, 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit);
        const newShape: Shape = {
            id, type: ShapeType.FUNCTION_GRAPH, points: [], 
            formulaParams: params, functionForm: 'standard',
            pathData, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedIds(new Set<string>([id]));
        setTool(ToolType.SELECT); 
        return;
    }

    // SELECT MODE LOGIC
    if (tool === ToolType.SELECT) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
             setSelectedIds(new Set<string>()); setPivotIndex('center'); 
        }
        const rawPos = getMousePos(e, false);
        setSelectionBox({ start: rawPos, current: rawPos });
        setIsDragging(true);
        // Important: Return here so we don't fall through to shape creation logic
        return;
    }

    saveHistory(); 

    if (tool === ToolType.PROTRACTOR) {
        e.preventDefault();
        const id = generateId();
        const p1 = { x: pos.x - 150, y: pos.y - 150 };
        const p2 = { x: pos.x + 150, y: pos.y };
        const newShape: Shape = { id, type: ShapeType.PROTRACTOR, points: [p1, p2], fill: 'transparent', stroke: currentStyle.stroke, strokeWidth: 1, rotation: 0 };
        setShapes(prev => [...prev, newShape]);
        setSelectedIds(new Set<string>([id]));
        setPivotIndex(99); 
        setTool(ToolType.SELECT);
        return;
    }

    if (tool === ToolType.TEXT) {
        e.preventDefault(); 
        const id = generateId();
        const newShape: Shape = { id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
        setShapes(prev => [...prev, newShape]);
        setTextEditing({ id, x: pos.x, y: pos.y, text: '' });
        setSelectedIds(new Set<string>([id]));
        setTool(ToolType.SELECT);
        return;
    }

    if (tool === ToolType.LINE && !activeShapeId) {
        if (!pendingLineStart) {
            setPendingLineStart(pos);
            setDragStartPos(pos);
            setIsDragging(true);
            const id = generateId();
            let labels = autoLabelMode ? ['A', 'B'] : undefined;
            const newShape: Shape = { id, type: ShapeType.LINE, points: [pos, pos], labels, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
            setShapes(prev => [...prev, newShape]);
            setActiveShapeId(id);
            // DO NOT SELECT YET (Hides pivots/blue point while drawing)
            // setSelectedIds(new Set<string>([id])); 
            return;
        } else {
            const id = generateId();
            let labels = autoLabelMode ? ['A', 'B'] : undefined;
            const newShape: Shape = { id, type: ShapeType.LINE, points: [pendingLineStart, pos], labels, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
            setShapes(prev => [...prev, newShape]);
            setPendingLineStart(null);
            // Select after finishing
            setSelectedIds(new Set<string>([id]));
            return;
        }
    }

    setDragStartPos(pos);
    setIsDragging(true);

    const id = generateId();
    let points: Point[] = [];
    let labels: string[] | undefined = undefined;
    
    let constraint: Constraint | undefined;
    if (tool === ToolType.POINT) {
        if (hoveredConstraint) {
            constraint = hoveredConstraint;
            setSnapIndicator(null);
        } else if (hoveredShapeId) {
            const parent = shapes.find(s => s.id === hoveredShapeId);
            if (parent) {
                if (parent.type === ShapeType.FUNCTION_GRAPH) {
                     const mp = screenToMath(pos, canvasSize.width, canvasSize.height, pixelsPerUnit);
                     const my = evaluateQuadratic(mp.x, parent.formulaParams!, parent.functionForm);
                     pos = mathToScreen({ x: mp.x, y: my }, canvasSize.width, canvasSize.height, pixelsPerUnit);
                     constraint = { type: 'on_path', parentId: hoveredShapeId, paramX: mp.x };
                } else {
                    pos = getClosestPointOnShape(pos, parent);
                    constraint = { type: 'on_path', parentId: hoveredShapeId };
                }
                setSnapIndicator(null);
            }
        }
    }

    switch (tool) {
      case ToolType.POINT: points = [pos]; if(autoLabelMode) labels = ['A']; break;
      case ToolType.RECTANGLE:
      case ToolType.SQUARE: points = [pos, pos]; if(autoLabelMode) labels = ['A', 'B', 'C', 'D']; break;
      case ToolType.CIRCLE:
      case ToolType.ELLIPSE: points = [pos, pos]; break;
      case ToolType.TRIANGLE: points = [pos, pos, pos]; if(autoLabelMode) labels = ['A', 'B', 'C']; break;
      case ToolType.FREEHAND: points = [pos]; break;
      default: points = [pos, pos];
    }

    const newShape: Shape = {
      id, type: tool as unknown as ShapeType, points, labels, fill: currentStyle.fill, stroke: currentStyle.stroke,
      strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0, constraint
    };

    setShapes((prev) => [...prev, newShape]);
    setActiveShapeId(id);
    // DO NOT SELECT YET (Hides blue point pivot while drawing)
    // setSelectedIds(new Set<string>([id])); 
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (pickingMirrorMode) return;
    const rawPos = getMousePos(e, false);
    let currentPos = getMousePos(e, !isRotating && tool !== ToolType.SELECT); 
    setCursorPos(currentPos);

    // COMPASS DRAGGING VISUALIZATION
    if (tool === ToolType.COMPASS) {
        // Just update cursor pos for the Overlay to re-render
        return;
    }
    
    // HOVER DETECTION FOR BINDING
    if (tool === ToolType.POINT && !isDragging) {
         const bindableShapes = shapes.filter(s => [ShapeType.LINE, ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.PROTRACTOR, ShapeType.FUNCTION_GRAPH, ShapeType.RULER].includes(s.type));
         let foundId: string | null = null;
         for (const s of bindableShapes) {
             const dist = distance(rawPos, getClosestPointOnShape(rawPos, s));
             if (s.type === ShapeType.FUNCTION_GRAPH) {
                  const mp = screenToMath(rawPos, canvasSize.width, canvasSize.height, pixelsPerUnit);
                  const my = evaluateQuadratic(mp.x, s.formulaParams!, s.functionForm);
                  const sp = mathToScreen({ x: mp.x, y: my }, canvasSize.width, canvasSize.height, pixelsPerUnit);
                  if (Math.abs(sp.y - rawPos.y) < 20) { foundId = s.id; break; }
             } else {
                 if (dist < 15) { foundId = s.id; break; }
             }
         }
         setHoveredShapeId(foundId);
    } else {
        if (!isDragging) setHoveredShapeId(null);
    }

    if (selectionBox) {
        setSelectionBox(prev => prev ? ({ ...prev, current: currentPos }) : null);
        return;
    }

    if (tool === ToolType.LINE && pendingLineStart && !isDragging) { 
        getMousePos(e, true); 
        return; 
    }
    if (!isDragging) { if(tool !== ToolType.SELECT) getMousePos(e, true); return; }
    if (!dragStartPos) return;

    // --- RESIZING & PARENT MODIFICATION LINKAGE ---
    if (tool === ToolType.SELECT && dragHandleIndex !== null && selectedIds.size === 1) {
        const id = (Array.from(selectedIds) as string[])[0];
        const oldParent = shapes.find(s => s.id === id);
        if (oldParent) {
            updateShapes(new Set<string>([id]), (s) => {
                // SPECIAL LOGIC FOR 2-POINT SHAPES (RECT, SQUARE, CIRCLE, ELLIPSE)
                // These shapes are defined by 2 points (p0, p1), but have 4 resize handles (0,1,2,3).
                if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(s.type)) {
                    // Logic: Identify the anchor point (opposite corner) and set new points based on anchor + currentPos.
                    // Handle 0 (TL) -> Anchor is BR (which is derived from p0, p1)
                    // But p0, p1 are just arbitrary corners (often TL, BR, but not guaranteed).
                    // We need to work with bounding box logic.
                    
                    const xs = s.points.map(p => p.x);
                    const ys = s.points.map(p => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);
                    
                    // Determine which corner is being dragged and where the anchor is.
                    // Handles: 0:TL, 1:TR, 2:BR, 3:BL
                    let anchorX, anchorY;
                    
                    if (dragHandleIndex === 0) { // Dragging TL, Anchor is BR
                        anchorX = maxX; anchorY = maxY;
                    } else if (dragHandleIndex === 1) { // Dragging TR, Anchor is BL
                        anchorX = minX; anchorY = maxY;
                    } else if (dragHandleIndex === 2) { // Dragging BR, Anchor is TL
                        anchorX = minX; anchorY = minY;
                    } else { // Dragging BL (3), Anchor is TR
                        anchorX = maxX; anchorY = minY;
                    }
                    
                    // New Rect is from (anchorX, anchorY) to (currentPos.x, currentPos.y)
                    // We simply set points to these two new diagonal corners.
                    // This robustly handles all flipping cases.
                    return { ...s, points: [{ x: anchorX, y: anchorY }, currentPos] };
                }

                // Default logic for shapes with 1-to-1 handle-to-point mapping (Line, Triangle, etc.)
                const newPoints = [...s.points]; 
                if (dragHandleIndex < newPoints.length) {
                    newPoints[dragHandleIndex] = currentPos; 
                }
                return { ...s, points: newPoints };
            });

            if (resizeContext) {
                const { constrainedChildren, connectedLines } = resizeContext;
                const newParentPoints = [...oldParent.points]; newParentPoints[dragHandleIndex] = currentPos;
                
                // Collect IDs into a new Set via iteration to strictly satisfy types
                const childrenToUpdate = new Set<string>();
                constrainedChildren.forEach(c => childrenToUpdate.add(c.childId));

                updateShapes(childrenToUpdate, (child) => {
                    const ctx = constrainedChildren.find(c => c.childId === child.id); if (!ctx) return child;
                    let pA = newParentPoints[0]; let pB = newParentPoints[1];
                    if (oldParent.type !== ShapeType.LINE && oldParent.points.length > 1) { pA = newParentPoints[0]; pB = newParentPoints[1]; }
                    const newChildPos = lerp(pA, pB, ctx.t); return { ...child, points: [newChildPos] };
                });
                
                const linesToUpdate = new Set<string>();
                connectedLines.forEach(c => linesToUpdate.add(c.lineId));
                
                updateShapes(linesToUpdate, (line) => {
                    const ctx = connectedLines.find(c => c.lineId === line.id); if (!ctx) return line;
                    const newLinePoints = [...line.points]; newLinePoints[ctx.pointIndex] = currentPos; return { ...line, points: newLinePoints };
                });
            }
        }
        return;
    }

    // --- MOVING ---
    if (tool === ToolType.SELECT && dragHandleIndex === null) {
         if (selectedIds.size === 1) {
             const id = (Array.from(selectedIds) as string[])[0];
             const shape = shapes.find(s => s.id === id);
             if (shape && shape.constraint?.type === 'on_path') {
                 const parent = shapes.find(p => p.id === shape.constraint!.parentId);
                 if (parent) {
                     if (parent.type === ShapeType.FUNCTION_GRAPH) {
                         const mp = screenToMath(rawPos, canvasSize.width, canvasSize.height, pixelsPerUnit);
                         const my = evaluateQuadratic(mp.x, parent.formulaParams!, parent.functionForm);
                         currentPos = mathToScreen({ x: mp.x, y: my }, canvasSize.width, canvasSize.height, pixelsPerUnit);
                         const updateSet = new Set<string>();
                         updateSet.add(id);
                         updateShapes(updateSet, s => ({ ...s, points: [currentPos], constraint: { ...s.constraint!, paramX: mp.x } }));
                         return;
                     } else { currentPos = getClosestPointOnShape(rawPos, parent); }
                 }
             }
             if (shape && shape.constraint?.type === 'intersection') return; 
         }
         const dx = currentPos.x - dragStartPos.x;
         const dy = currentPos.y - dragStartPos.y;
         if (textEditing) return;
         let context = dragContext;
         if (!context) { 
             // Ensure type safety when creating context
             const safeSelectedIds = selectedIds as Set<string>;
             context = calculateDragContext(safeSelectedIds); 
             setDragContext(context); 
         }
         if (context) {
             const { movingShapeIds, connectedPoints } = context;
             let nextShapes = shapes.map(s => {
                 if (s.type === ShapeType.FUNCTION_GRAPH) return s;
                 if (movingShapeIds.has(s.id) && s.constraint && s.constraint.type === 'on_path') { return { ...s, points: [currentPos] }; }
                 if (movingShapeIds.has(s.id)) {
                     if (s.constraint?.type === 'intersection') return s;
                     return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                 }
                 const connections = connectedPoints.filter(cp => cp.shapeId === s.id);
                 if (connections.length > 0) {
                     const newPoints = [...s.points];
                     connections.forEach(conn => {
                         if (selectedIds.size === 1) {
                             const leader = shapes.find(l => l.id === Array.from(selectedIds)[0]);
                             if (leader?.constraint && leader.constraint.type === 'on_path') { newPoints[conn.pointIndex] = currentPos; return; }
                         }
                         newPoints[conn.pointIndex] = { x: newPoints[conn.pointIndex].x + dx, y: newPoints[conn.pointIndex].y + dy };
                     });
                     return { ...s, points: newPoints };
                 }
                 return s;
             });
             nextShapes = resolveConstraints(nextShapes, canvasSize.width, canvasSize.height, pixelsPerUnit);
             const newTraceBuffer = [...traceBuffer];
             nextShapes.forEach(s => {
                 if (s.isTracing) {
                     const oldS = shapes.find(old => old.id === s.id);
                     if (oldS && s.points.length > 0 && distance(oldS.points[0], s.points[0]) > 2) {
                         const existingEntry = newTraceBuffer.find(tb => tb.id === s.id);
                         if (existingEntry) { existingEntry.points.push(s.points[0]); } else { newTraceBuffer.push({ id: s.id, points: [oldS.points[0], s.points[0]] }); }
                     }
                 }
             });
             if (newTraceBuffer.length !== traceBuffer.length || newTraceBuffer.some((tb, i) => tb.points.length !== traceBuffer[i]?.points.length)) { setTraceBuffer(newTraceBuffer); }
             setShapes(nextShapes);
         }
         setDragStartPos(currentPos);
         return;
    }

    // Drawing (New Shapes)
    if (activeShapeId) {
        setShapes((prev) => prev.map((s) => {
            if (s.id !== activeShapeId) return s;
            const start = s.points[0];
            let newPoints = [...s.points];
            
            if (s.type === ShapeType.POINT) { } 
            else if (s.type === ShapeType.FREEHAND) {
                const lastPoint = s.points[s.points.length - 1];
                if (distance(lastPoint, currentPos) > 2) { newPoints = [...s.points, currentPos]; }
            } else if (s.type === ShapeType.LINE) { newPoints[1] = currentPos; } 
            else if (s.type === ShapeType.TRIANGLE) {
                const w = currentPos.x - start.x; newPoints[1] = { x: start.x - w, y: currentPos.y }; newPoints[2] = currentPos;
            } else {
                newPoints[1] = currentPos;
                if (tool === ToolType.SQUARE || tool === ToolType.CIRCLE) {
                    const w = currentPos.x - start.x; const h = currentPos.y - start.y; const dim = Math.max(Math.abs(w), Math.abs(h));
                    newPoints[1] = { x: start.x + (w < 0 ? -dim : dim), y: start.y + (h < 0 ? -dim : dim) };
                }
            }
            return { ...s, points: newPoints };
        }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // COMPASS FINISH DRAWING
    if (tool === ToolType.COMPASS && compassState.center && compassState.radiusPoint && compassState.startAngle !== null) {
        // User released mouse after dragging/swinging compass
        // Create the arc shape
        const radius = distance(compassState.center, compassState.radiusPoint);
        const currentPos = getMousePos(e, false);
        const endAngle = getAngleDegrees(compassState.center, currentPos);
        const arcPath = getAngleArcPath(compassState.center, 
             { x: compassState.center.x + radius * Math.cos(compassState.startAngle * Math.PI/180), y: compassState.center.y + radius * Math.sin(compassState.startAngle * Math.PI/180) },
             { x: compassState.center.x + radius * Math.cos(endAngle * Math.PI/180), y: compassState.center.y + radius * Math.sin(endAngle * Math.PI/180) },
             radius
        );
        
        const newShape: Shape = {
            id: generateId(),
            type: ShapeType.PATH,
            points: [compassState.center], // Store center for reference
            pathData: arcPath, // This needs to be a proper arc command
            fill: 'none',
            stroke: '#94a3b8', // Gray construction line
            strokeWidth: 2,
            strokeType: 'solid',
            rotation: 0,
            isConstruction: true
        };
        saveHistory();
        setShapes(prev => [...prev, newShape]);
        
        setCompassState(prev => ({ ...prev, startAngle: null }));
        return;
    }

    if (traceBuffer.length > 0) {
        const newPaths: Shape[] = [];
        traceBuffer.forEach(trace => {
            if (trace.points.length > 5) {
                const smoothPath = getSmoothSvgPath(trace.points);
                newPaths.push({
                    id: generateId(), type: ShapeType.PATH, points: trace.points, pathData: smoothPath, fill: 'none', stroke: '#9ca3af', strokeWidth: 2, strokeType: 'dashed', rotation: 0
                });
            }
        });
        if (newPaths.length > 0) { setShapes(prev => [...prev, ...newPaths]); }
        setTraceBuffer([]);
    }

    setDragContext(null); setResizeContext(null); setIsRotating(false); setRotationCenter(null);

    if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) {
        const freehandShape = shapes.find(s => s.id === activeShapeId);
        if (freehandShape && freehandShape.points.length > 10) {
            const recognized = recognizeFreehandShape(freehandShape.points);
            if (recognized) {
                let labels: string[] | undefined;
                if (autoLabelMode) {
                    if (recognized.type === ShapeType.TRIANGLE) labels = ['A', 'B', 'C'];
                    else if (recognized.type === ShapeType.RECTANGLE || recognized.type === ShapeType.SQUARE) labels = ['A', 'B', 'C', 'D'];
                    else labels = ['A', 'B']; // Line or Circle?
                }
                setShapes(prev => prev.map(s => s.id === activeShapeId ? { ...s, type: recognized.type, points: recognized.points, labels } : s));
            }
        }
    }

    // SANITIZATION: Fix corrupted triangles that somehow have > 3 points
    setShapes(prev => prev.map(s => {
        if (s.type === ShapeType.TRIANGLE && s.points.length > 3) {
            return { ...s, points: s.points.slice(0, 3) };
        }
        return s;
    }));

    if (selectionBox) {
        const r = { start: selectionBox.start, end: selectionBox.current };
        const hits = shapes.filter(s => isShapeInRect(s, r)).map(s => s.id) as string[];
        setSelectedIds((prev: Set<string>) => {
             if (e.ctrlKey || e.metaKey || e.shiftKey) { 
                 const next = new Set<string>(prev); 
                 hits.forEach(id => next.add(id)); 
                 return next; 
             }
             if (hits.length === 0) setPivotIndex('center'); 
             return new Set<string>(hits);
        });
        setSelectionBox(null); setIsDragging(false); return;
    }

    // Finalize drawing logic
    if (activeShapeId) {
        if (tool === ToolType.LINE && pendingLineStart) {
             const dist = distance(pendingLineStart, getMousePos(e, false));
             if (dist > 5) {
                 setPendingLineStart(null);
                 // Select the new shape now that we are done
                 setSelectedIds(new Set([activeShapeId]));
                 setActiveShapeId(null);
             }
        } else {
             // Select the new shape now that we are done
             setSelectedIds(new Set([activeShapeId]));
             setActiveShapeId(null);
        }
    }

    setIsDragging(false); setDragStartPos(null); setDragHandleIndex(null); 
  };

  const handleResizeStart = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setDragHandleIndex(index);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);

      if (selectedIds.size === 1) {
          const parentId = (Array.from(selectedIds) as string[])[0];
          const parent = shapes.find(s => s.id === parentId);
          if (parent) {
              // 1. Calculate relative positions (t) for constrained children (points on path)
              const constrainedChildren = shapes
                  .filter(s => s.constraint?.parentId === parentId && s.constraint.type === 'on_path')
                  .map(child => {
                      let t = 0;
                      // Simple projection for Line segments. 
                      // For other shapes, this "t" might need more complex logic or isn't fully supported by the simple lerp in mouseMove.
                      if (parent.points.length >= 2) {
                          t = getProjectionParameter(child.points[0], parent.points[0], parent.points[1]);
                      }
                      return { childId: child.id, t, segmentIndex: 0 };
                  });

              // 2. Find lines that are attached to the vertex being moved (for shapes where handles map to vertices)
              const connectedLines: { lineId: string; pointIndex: number }[] = [];
              
              // Only apply connection logic if the shape type has direct vertex mapping (Line, Triangle, Polygon)
              // Rectangles/Circles have indirect handles, so direct point comparison might be tricky or we need to map handle index to corner.
              // For simplicity, we handle direct vertex connections here.
              if ([ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.POLYGON, ShapeType.FREEHAND].includes(parent.type)) {
                   const movingVertex = parent.points[index];
                   if (movingVertex) {
                       shapes.forEach(s => {
                           if (s.id === parentId) return;
                           // Only connecting other Lines/Triangles for now
                           if ([ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.POLYGON].includes(s.type)) {
                               s.points.forEach((pt, i) => {
                                   if (distance(pt, movingVertex) < 5) {
                                       connectedLines.push({ lineId: s.id, pointIndex: i });
                                   }
                               });
                           }
                       });
                   }
              }

              setResizeContext({ constrainedChildren, connectedLines });
          }
      }
  };

  const handleShapeMouseDown = (e: React.MouseEvent, id: string) => {
      // Allow clicking existing shapes to use as snap points for Compass
      if (tool === ToolType.COMPASS) {
          // Pass through to main handleMouseDown logic which handles snapping
          // We don't want to select the shape, we want to use its point
          return;
      }

      if (pickingMirrorMode) {
          e.stopPropagation();
          const target = shapes.find(s => s.id === id);
          if (target && (target.type === ShapeType.LINE || target.type === ShapeType.FREEHAND)) { handleFold(target.id); } else { alert("Please select a LINE shape to act as the fold axis."); }
          return;
      }
      if (tool !== ToolType.SELECT) return;
      e.stopPropagation();
      
      if (e.altKey) {
          saveHistory();
          // Use Array.from or spread for strict typing if needed
          let idsToCopy: Set<string>;
          if (selectedIds.has(id)) {
              // Ensure strictly typed string array for constructor
              idsToCopy = new Set<string>(Array.from(selectedIds) as string[]);
          } else {
              idsToCopy = new Set<string>();
              idsToCopy.add(id);
          }
          const newShapes: Shape[] = [];
          const newSelectedIds = new Set<string>();
          idsToCopy.forEach(sourceId => {
              const sourceShape = shapes.find(s => s.id === sourceId);
              if (sourceShape) {
                  const newId = generateId();
                  const { constraint, ...rest } = sourceShape; 
                  newShapes.push({ ...rest, id: newId });
                  newSelectedIds.add(newId);
              }
          });
          setShapes([...shapes, ...newShapes]);
          setSelectedIds(newSelectedIds);
          setDragStartPos(getMousePos(e, true));
          setIsDragging(true);
          setDragContext({ movingShapeIds: newSelectedIds, connectedPoints: [] });
          return;
      }
      
      let newSelection: Set<string> = new Set<string>(selectedIds as Set<string>);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (newSelection.has(id)) newSelection.delete(id); else newSelection.add(id);
      } else {
          if (!newSelection.has(id)) {
              newSelection = new Set<string>();
              newSelection.add(id);
              const target = shapes.find(s=>s.id === id);
              // Only reset pivot if not holding Alt (Alt used for pivot selection)
              if (!e.altKey) {
                  setPivotIndex(target?.type === ShapeType.PROTRACTOR ? 99 : 'center'); 
              }
          }
      }
      saveHistory();
      setSelectedIds(newSelection);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);
      setDragContext(calculateDragContext(newSelection));
  };

  const handleMouseMoveWithRotation = (e: React.MouseEvent) => {
    if (isRotating && rotationCenter && selectedIds.size === 1) {
        const mousePos = getMousePos(e, false);
        const currentAngle = (Math.atan2(mousePos.y - rotationCenter.y, mousePos.x - rotationCenter.x) * 180) / Math.PI;
        
        // Calculate frame delta
        const angleDelta = currentAngle - lastRotationMouseAngle.current;
        // Update tracker for next frame
        lastRotationMouseAngle.current = currentAngle;

        // Apply Snap logic to the delta if Shift is NOT pressed (snap to 15 deg increments relative to world)
        // Note: Snapping deltas is tricky. It's better to snap the final absolute rotation.
        // But for free rotation, delta is fine.
        let effectiveDelta = angleDelta;
        
        // If Shift is held, we want to snap the ABSOLUTE rotation to 15 degs.
        // This requires knowing the accumulated rotation.
        // For simplicity in this fix, we stick to smooth rotation unless we rewrite the whole state to be absolute.
        // Standard behavior: Shift snaps delta? No, usually absolute.
        // Let's keep smooth rotation for now to ensure the pivot logic is robust first.

        const id = (Array.from(selectedIds) as string[])[0];
        const updateSet = new Set<string>();
        updateSet.add(id);

        updateShapes(updateSet, (s) => {
            const newRotation = (s.rotation || 0) + effectiveDelta;
            
            // If rotating around center, simple update
            if (pivotIndex === 'center') {
                return { ...s, rotation: newRotation };
            }

            // If rotating around an offset pivot, we must rotate the Shape's Center (position) around that pivot
            // to maintain the illusion that the pivot is fixed.
            // 1. Get current geometric center of the shape
            const currentCenter = getShapeCenter(s.points);
            
            // 2. Rotate this center point around the Pivot (rotationCenter) by the delta
            const newCenter = rotatePoint(currentCenter, rotationCenter, effectiveDelta);
            
            // 3. Calculate translation vector required to move center from current to new
            const dx = newCenter.x - currentCenter.x;
            const dy = newCenter.y - currentCenter.y;
            
            // 4. Apply translation to all points + update rotation
            const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            
            return { ...s, points: newPoints, rotation: newRotation };
        });
        return;
    }
    handleMouseMove(e);
  };

  const handleRotateStart = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (selectedIds.size !== 1) return;
      const id = (Array.from(selectedIds) as string[])[0];
      const shape = shapes.find(s => s.id === id);
      if (!shape) return;

      let center = getShapeCenter(shape.points);
      
      // Pivot Logic correction
      if (pivotIndex === 'center') {
          center = getShapeCenter(shape.points);
      } else if (typeof pivotIndex === 'number') {
          // If shape is rectangle/square/circle/ellipse, we use corners logic
          if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(shape.type)) {
               const corners = getRotatedCorners(shape); // These are corners 0,1,2,3
               if (corners[pivotIndex]) center = corners[pivotIndex];
          } else {
               const corners = getRotatedCorners(shape); // For Poly/Line, corners are vertices
               if (corners[pivotIndex]) center = corners[pivotIndex];
          }
      }

      setRotationCenter(center);
      // We don't need initialShapeRotation anymore for delta logic, but keeping it logic clean
      // setInitialShapeRotation(shape.rotation || 0); 

      const mousePos = getMousePos(e, false);
      const startAngle = (Math.atan2(mousePos.y - center.y, mousePos.x - center.x) * 180) / Math.PI;
      
      // Store start angle for frame-delta calculation
      lastRotationMouseAngle.current = startAngle;
      
      setIsRotating(true);
      setIsDragging(false);
  };
  
  const handleShapeDoubleClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const s = shapes.find(shape => shape.id === id);
      if (s && s.type === ShapeType.TEXT) {
          setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
      }
  };

  const handleTriangleAngleChange = (index: number, newVal: string) => {
      console.log('Angle change requested', index, newVal);
  };

  const updateSelectedStyle = (key: string, value: any) => {
      setCurrentStyle(prev => ({ ...prev, [key]: value }));
      if (selectedIds.size > 0) {
          saveHistory();
          updateShapes(selectedIds as Set<string>, { [key]: value });
      }
  };

  const getCommonFontSize = () => {
      if (selectedIds.size === 0) return 16;
      const t = shapes.find(s => selectedIds.has(s.id) && s.type === ShapeType.TEXT);
      return t?.fontSize || 16;
  };

  const handleExport = (format: 'png' | 'jpeg') => {
      if (svgRef.current) {
          exportCanvas(svgRef.current, format, 'design');
      }
  };

  const generateAppIcon = () => {
      if (svgRef.current) {
          exportCanvas(svgRef.current, 'png', 'icon');
      }
  };
  
  const selectedFunction = React.useMemo(() => {
    if (selectedIds.size !== 1) return null;
    return shapes.find(s => s.id === (Array.from(selectedIds) as string[])[0] && s.type === ShapeType.FUNCTION_GRAPH);
  }, [selectedIds, shapes]);

  const showSmoothButton = React.useMemo(() => {
      return (Array.from(selectedIds) as string[]).some(id => shapes.find(s => s.id === id)?.type === ShapeType.FREEHAND);
  }, [selectedIds, shapes]);
  
  const showTraceButton = selectedIds.size > 0;
  
  const showSymbolPanel = !!textEditing || (selectedIds.size === 1 && shapes.find(s => s.id === (Array.from(selectedIds) as string[])[0])?.type === ShapeType.TEXT);

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50 text-slate-800 font-sans">
      <input type="file" accept=".geo,.json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-2"><div className="bg-brand-600 p-1.5 rounded-lg text-white"><Settings2 size={20} /></div><h1 className="font-bold text-lg text-slate-700">GeoDraw Pro</h1></div>
        <div className="flex items-center gap-3">
             <button onClick={handleOpenProjectClick} className="btn-secondary text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2"><FolderOpen size={16} /> Open</button>
             <button onClick={handleSaveProject} className="btn-secondary text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2"><Save size={16} /> Save</button>
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={undo} className="btn-secondary text-slate-600 hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2" disabled={history.length === 0}><Undo size={16} /> Undo</button>
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={deleteSelected} disabled={selectedIds.size === 0} className="btn-secondary text-slate-600 disabled:opacity-50 hover:bg-red-50 hover:text-red-600 flex items-center justify-center gap-2"><Trash2 size={16} /> Delete</button>
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={clearCanvas} disabled={shapes.length === 0} className="btn-secondary text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2"><Eraser size={16} /> Clear All</button>
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={() => handleExport('png')} className="btn-primary bg-brand-600 text-white hover:bg-brand-700 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md"><Download size={16} /> Export</button>
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={generateAppIcon} className="btn-secondary text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-2"><ImageIcon size={16} /> Icon</button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-1 z-10 shadow-sm shrink-0 overflow-y-auto">
            {TOOL_CONFIG.map((t) => (
                <button key={t.id} onClick={() => handleToolChange(t.id)} className={`p-2 rounded-lg transition-all ${tool === t.id ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-500' : 'text-gray-500 hover:bg-gray-100'}`}><t.icon size={20} /></button>
            ))}
            <div className="w-10 h-px bg-gray-200 my-1"></div>
             <button onClick={() => setAutoLabelMode(!autoLabelMode)} className={`p-2 rounded-lg transition-all ${autoLabelMode ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-500' : 'text-gray-400 hover:bg-gray-100'}`}><CaseUpper size={20} /></button>
             <button onClick={() => setSmartSketchMode(!smartSketchMode)} className={`p-2 rounded-lg transition-all ${smartSketchMode ? 'bg-amber-50 text-amber-600 ring-2 ring-amber-500' : 'text-gray-400 hover:bg-gray-100'}`}><Sparkles size={20} /></button>
        </aside>
        <main className={`flex-1 relative bg-gray-100 overflow-hidden ${pickingMirrorMode ? 'cursor-crosshair' : ''} ${markingAnglesMode ? 'cursor-copy' : ''} ${tool === ToolType.FREEHAND ? 'cursor-none' : ''}`}>
            <svg ref={svgRef} width="100%" height="100%" className={`block touch-none ${tool === ToolType.FREEHAND ? 'cursor-none' : ''}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMoveWithRotation} onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp({} as any); setCursorPos(null); }}>
                <rect width="100%" height="100%" fill="white" />
                <AxisLayer config={axisConfig} width={canvasSize.width} height={canvasSize.height} />
                {/* Shapes */}
                {shapes.map((shape) => {
                    const isHoveredForBinding = hoveredShapeId === shape.id;
                    const isIntersectionHover = hoveredConstraint?.type === 'intersection' && hoveredConstraint.parents?.includes(shape.id);
                    
                    return (
                        <g key={shape.id} onMouseDown={(e) => handleShapeMouseDown(e, shape.id)} onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)} opacity={pickingMirrorMode && shape.type !== ShapeType.LINE ? 0.3 : 1} style={{ cursor: pickingMirrorMode ? (shape.type === ShapeType.LINE ? 'pointer' : 'not-allowed') : (selectedIds.has(shape.id) ? 'move' : (tool === ToolType.FREEHAND ? 'none' : 'pointer')) }}>
                            {/* Halo for binding hover */}
                            {(isHoveredForBinding || isIntersectionHover) && <g style={{ opacity: 0.5, pointerEvents: 'none' }}><ShapeRenderer shape={{...shape, strokeWidth: shape.strokeWidth + 6, stroke: isIntersectionHover ? '#a855f7' : '#fbbf24', fill: 'none'}} isSelected={false} /></g>}
                            <ShapeRenderer shape={shape} isSelected={selectedIds.has(shape.id)} />
                            {shape.isTracing && <circle cx={shape.points[0].x} cy={shape.points[0].y} r={4} fill="#ef4444" stroke="white" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                        </g>
                    );
                })}
                {/* Live Trace Buffer */}
                {traceBuffer.map((trace, i) => (
                    <polyline key={`trace-${i}`} points={trace.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4" opacity="0.6" />
                ))}
                
                {/* Compass Overlay */}
                {tool === ToolType.COMPASS && cursorPos && (
                    <CompassOverlay 
                        center={compassState.center} 
                        cursor={cursorPos} 
                        radiusPoint={compassState.radiusPoint} 
                        isDrawing={compassState.startAngle !== null}
                    />
                )}
                {/* Ruler Overlay removed - now using ShapeType.RULER */}

                {/* Selection Overlays */}
                {Array.from(selectedIds as Set<string>).map(id => {
                    const s = shapes.find(sh => sh.id === id);
                    if (!s || (s.type === ShapeType.TEXT && tool !== ToolType.SELECT)) return null; 
                    if (pickingMirrorMode || s.type === ShapeType.MARKER) return null; 
                    if (s.constraint?.type === 'intersection') return null;
                    if (s.type === ShapeType.FUNCTION_GRAPH) return null;
                    return <SelectionOverlay key={id} shape={s} isSelected={true} pivotIndex={pivotIndex} isAltPressed={isAltPressed} isMarkingAngles={markingAnglesMode} onResizeStart={handleResizeStart} onAngleChange={handleTriangleAngleChange} onRotateStart={handleRotateStart} onSetPivot={setPivotIndex} onMarkAngle={(idx) => handleCornerClick(s.id, idx)} />;
                })}
                
                {/* Drag Selection Box */}
                {selectionBox && <rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeDasharray="4" />}
                
                {/* Line Preview */}
                {tool === ToolType.LINE && pendingLineStart && !isDragging && snapIndicator && <line x1={pendingLineStart.x} y1={pendingLineStart.y} x2={snapIndicator.x} y2={snapIndicator.y} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4" />}
                
                {/* Snap Indicator */}
                {snapIndicator && <circle cx={snapIndicator.x} cy={snapIndicator.y} r={6} fill="none" stroke={hoveredConstraint?.type === 'intersection' ? '#a855f7' : '#ef4444'} strokeWidth={2} className="pointer-events-none" />}
                
                {/* Freehand Cursor */}
                {tool === ToolType.FREEHAND && cursorPos && <circle cx={cursorPos.x} cy={cursorPos.y} r={1.5} fill={currentStyle.stroke} className="pointer-events-none" />}
            </svg>
            
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-500 pointer-events-none select-none flex items-center gap-2">
                 <Magnet size={12} className={snapIndicator ? (hoveredConstraint?.type==='intersection' ? "text-purple-500" : "text-red-500") : "text-gray-400"} />
                 {tool === ToolType.COMPASS ? (
                     compassState.center 
                        ? (compassState.radiusPoint ? "Drag to swing arc." : "Click to set Radius.") 
                        : "Click to set Needle."
                 ) : tool === ToolType.RULER ? (
                     "Click to place Ruler object."
                 ) : (
                     tool === ToolType.SELECT ? (isAltPressed ? 'Alt held: Drag to copy.' : 'Click to select. Drag to move.') : (tool === ToolType.FREEHAND ? 'Drag to sketch.' : (tool === ToolType.FUNCTION ? 'Click to place Parabola.' : (hoveredShapeId ? (hoveredConstraint?.type === 'intersection' ? 'Click to Bind Intersection' : 'Click to Bind Point') : 'Drag to draw. Snapping active. Hold Shift to disable snap.')))
                 )}
                 {hoveredShapeId && <span className={`flex items-center font-bold animate-pulse ml-2 ${hoveredConstraint?.type === 'intersection' ? 'text-purple-600' : 'text-green-600'}`}><Link2 size={12} className="mr-1"/> {hoveredConstraint?.type === 'intersection' ? 'Intersect' : 'Link'}</span>}
            </div>
        </main>
        {/* ... Sidebar ... */}
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col z-10 shadow-sm overflow-y-auto shrink-0">
             <div className="p-5 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Grid3X3 size={16} /> Coordinate System</h3>
                <div className="space-y-3"><div className="flex items-center justify-between text-sm"><span>Show Axes</span><input type="checkbox" checked={axisConfig.visible} onChange={() => setAxisConfig(p => ({...p, visible: !p.visible}))} className="accent-brand-600" /></div><div className="flex items-center gap-2 text-sm"><span>Ticks: {axisConfig.ticks}</span><input type="range" min="1" max="20" value={axisConfig.ticks} onChange={(e) => setAxisConfig(p => ({...p, ticks: Number(e.target.value)}))} className="flex-1 accent-brand-600 h-1" /></div></div>
             </div>
             
             {/* New Function Controls Panel with Dual Forms */}
             {selectedFunction && selectedFunction.formulaParams && (
                <div className="p-5 border-b border-gray-100 bg-blue-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2"><FunctionSquare size={16} /> Quadratic</h3>
                        <select 
                            value={selectedFunction.functionForm || 'standard'} 
                            onChange={(e) => toggleFunctionForm(e.target.value as any)}
                            className="text-xs bg-white border border-blue-200 rounded px-1 py-0.5 outline-none text-blue-700"
                        >
                            <option value="standard">Standard Form</option>
                            <option value="vertex">Vertex Form</option>
                        </select>
                    </div>
                    
                    <div className="space-y-4">
                        {/* A parameter is shared */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-blue-700"><span>a (curvature)</span><span>{selectedFunction.formulaParams.a.toFixed(1)}</span></div>
                            <input type="range" min="-5" max="5" step="0.1" value={selectedFunction.formulaParams.a} onChange={(e) => handleFormulaParamChange('a', parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg accent-blue-600" />
                        </div>

                        {selectedFunction.functionForm === 'vertex' ? (
                            <>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-semibold text-blue-700"><span>h (horiz shift)</span><span>{selectedFunction.formulaParams.h?.toFixed(1)}</span></div>
                                    <input type="range" min="-10" max="10" step="0.5" value={selectedFunction.formulaParams.h || 0} onChange={(e) => handleFormulaParamChange('h', parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg accent-blue-600" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-semibold text-blue-700"><span>k (vert shift)</span><span>{selectedFunction.formulaParams.k?.toFixed(1)}</span></div>
                                    <input type="range" min="-10" max="10" step="0.5" value={selectedFunction.formulaParams.k || 0} onChange={(e) => handleFormulaParamChange('k', parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg accent-blue-600" />
                                </div>
                                <div className="text-xs text-center font-mono bg-white p-2 rounded border border-blue-200 text-blue-800">
                                     y = {selectedFunction.formulaParams.a}(x - {selectedFunction.formulaParams.h || 0})² + {selectedFunction.formulaParams.k || 0}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-semibold text-blue-700"><span>b (linear)</span><span>{selectedFunction.formulaParams.b.toFixed(1)}</span></div>
                                    <input type="range" min="-10" max="10" step="0.5" value={selectedFunction.formulaParams.b} onChange={(e) => handleFormulaParamChange('b', parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg accent-blue-600" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-semibold text-blue-700"><span>c (constant)</span><span>{selectedFunction.formulaParams.c.toFixed(1)}</span></div>
                                    <input type="range" min="-10" max="10" step="0.5" value={selectedFunction.formulaParams.c} onChange={(e) => handleFormulaParamChange('c', parseFloat(e.target.value))} className="w-full h-1 bg-blue-200 rounded-lg accent-blue-600" />
                                </div>
                                <div className="text-xs text-center font-mono bg-white p-2 rounded border border-blue-200 text-blue-800">
                                     y = {selectedFunction.formulaParams.a}x² + {selectedFunction.formulaParams.b}x + {selectedFunction.formulaParams.c}
                                </div>
                            </>
                        )}
                    </div>
                </div>
             )}

             {!pickingMirrorMode && <div className={`p-5 border-b border-gray-100 bg-slate-50 transition-all ${selectedIds.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Spline size={16} /> Operations</h3>
                    <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => setPickingMirrorMode(true)} className={`btn-op col-span-2 ${pickingMirrorMode ? 'bg-brand-50 ring-2 ring-brand-500' : ''}`}><div className="flex items-center gap-1"><FoldHorizontal size={20}/><span className="text-xs font-bold">Fold / Flip</span></div></button>
                        <button onClick={toggleMarkAnglesMode} className={`btn-op col-span-2 ${markingAnglesMode ? 'bg-brand-100 border-brand-500' : ''}`}><Radius size={20} className="mb-1" /><span className="text-[10px]">Angles</span></button>
                        {showSmoothButton && <button onClick={handleSmoothCurve} className="btn-op col-span-4 mt-2 bg-brand-50 border-brand-200"><div className="flex items-center gap-2"><Wand2 size={16} /><span className="text-xs font-semibold">Smooth Arc</span></div></button>}
                        
                        {showTraceButton && (
                            <button onClick={toggleTraceMode} className={`btn-op col-span-4 mt-2 ${Array.from(selectedIds).some(id => shapes.find(s=>s.id===id)?.isTracing) ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-50 border-slate-200'}`}>
                                <div className="flex items-center gap-2">
                                    <Footprints size={16} className={Array.from(selectedIds as Set<string>).some(id => shapes.find(s=>s.id===id)?.isTracing) ? "animate-pulse" : ""} />
                                    <span className="text-xs font-semibold">Trace Locus</span>
                                </div>
                            </button>
                        )}

                        <div className="col-span-4 mt-2 pt-2 border-t border-gray-200"><h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Smart Marks</h4><div className="grid grid-cols-3 gap-2">
                                 <button onClick={() => handleAddMarker('perpendicular')} className="btn-op"><CornerRightUp size={16} /><span className="text-[9px] mt-0.5">90°</span></button>
                                 <button onClick={() => handleAddMarker('parallel_arrow')} className="btn-op"><ArrowRight size={16} /><span className="text-[9px] mt-0.5">Arrow</span></button>
                                 <button onClick={() => handleAddMarker('equal_tick')} className="btn-op"><Hash size={16} className="rotate-90" /><span className="text-[9px] mt-0.5">Tick</span></button>
                        </div></div>
                    </div>
             </div>}
             <div className="p-5 space-y-5">
                {showSymbolPanel && <div className="bg-slate-50 p-3 rounded-lg border border-slate-200"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-2"><Calculator size={12}/> Math Symbols</label><div className="grid grid-cols-6 gap-2">{MATH_SYMBOLS.map(sym => (<button key={sym} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSymbolClick(sym)} className="h-8 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 transition-colors font-serif">{sym}</button>))}</div></div>}
                <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Stroke Color</label><div className="flex flex-wrap gap-2">{COLORS.map(c => (<button key={c} onClick={() => updateSelectedStyle('stroke', c)} className={`w-6 h-6 rounded-full border border-gray-200 shadow-sm ${currentStyle.stroke === c ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`} style={{ backgroundColor: c === 'transparent' ? 'white' : c }} />))}</div></div>
                <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Stroke Width</label><div className="flex items-center gap-3"><Minus size={16} onClick={() => updateSelectedStyle('strokeWidth', Math.max(1, currentStyle.strokeWidth - 1))} /><input type="range" min="1" max="20" value={currentStyle.strokeWidth} onChange={(e) => updateSelectedStyle('strokeWidth', Number(e.target.value))} className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600" /><Plus size={16} onClick={() => updateSelectedStyle('strokeWidth', currentStyle.strokeWidth + 1)} /><span className="text-sm w-6 text-center">{currentStyle.strokeWidth}</span></div></div>
                {selectedIds.size > 0 && shapes.find(s => selectedIds.has(s.id) && s.type === ShapeType.TEXT) && <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Font Size</label><div className="flex items-center gap-3"><Minus size={16} onClick={() => updateSelectedStyle('fontSize', Math.max(8, getCommonFontSize() - 2))} /><input type="range" min="8" max="72" step="2" value={getCommonFontSize()} onChange={(e) => updateSelectedStyle('fontSize', Number(e.target.value))} className="flex-1 h-1 bg-gray-200 rounded-lg accent-brand-600" /><Plus size={16} onClick={() => updateSelectedStyle('fontSize', getCommonFontSize() + 2)} /></div></div>}
                <div><label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Line Style</label><div className="flex gap-2 bg-gray-100 p-1 rounded-lg">{['solid', 'dashed', 'dotted'].map((t) => (<button key={t} onClick={() => updateSelectedStyle('strokeType', t)} className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize ${currentStyle.strokeType === t ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}>{t}</button>))}</div></div>
             </div>
        </aside>
        <style>{`.btn-op { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.5rem; background-color: white; border: 1px solid #e5e7eb; border-radius: 0.25rem; color: #4b5563; transition: all 0.2s; } .btn-op:hover { background-color: #f0f9ff; border-color: #0ea5e9; color: #0284c7; }`}</style>
      </div>
    </div>
  );
}
