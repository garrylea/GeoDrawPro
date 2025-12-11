
import React, { useState, useRef, useEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, MarkerType, MarkerConfig } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { exportCanvas, saveProject, loadProject, isElectron } from './utils/exportUtils';
import { getSnapPoint, calculateTriangleAngles, parseAngle, solveTriangleASA, getShapeSize, distance, isShapeInRect, getDetailedSnapPoints, getShapeCenter, getRotatedCorners, rotatePoint, bakeRotation, reflectPointAcrossLine, getAngleDegrees, getAngleCurve, simplifyToQuadratic, recognizeFreehandShape, recalculateMarker, getClosestPointOnShape, getProjectionParameter, lerp } from './utils/mathUtils';
import { Download, Trash2, Settings2, Grid3X3, Minus, Plus, Magnet, RotateCw, FlipHorizontal, FlipVertical, Spline, Undo, Eraser, MoreHorizontal, Image as ImageIcon, Copy, Radius, Type, Wand2, Calculator, Save, FolderOpen, CaseUpper, Sparkles, CornerRightUp, ArrowRight, Hash, MoveHorizontal, Link2 } from 'lucide-react';

export default function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  // History Stack for Undo
  const [history, setHistory] = useState<Shape[][]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    ticks: 5,
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
  
  // Store initial ratios for constrained points during resizing
  // This allows "Child" points to slide proportionally when "Parent" is resized
  const [resizeContext, setResizeContext] = useState<{
      constrainedChildren: { childId: string; t: number; segmentIndex: number }[];
      connectedLines: { lineId: string; pointIndex: number }[];
  } | null>(null);

  // Rotation State
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [initialShapeRotation, setInitialShapeRotation] = useState(0);
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [currentRotationDisplay, setCurrentRotationDisplay] = useState<number | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Operations State
  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(false);
  const [smartSketchMode, setSmartSketchMode] = useState(false);

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
  const [lastEditedVertexIdx, setLastEditedVertexIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

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
      setSelectedIds(new Set()); 
      setPendingLineStart(null); 
      setActiveShapeId(null);
  };

  // --- Deletion Logic ---
  const deleteSelected = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      const idsToDelete = new Set(selectedIds);
      
      setShapes(prev => prev.map(s => {
          if (s.constraint && idsToDelete.has(s.constraint.parentId)) {
              // Unbind child if parent deleted (make it free)
              const { constraint, ...rest } = s;
              return rest;
          }
          return s;
      }).filter(s => !idsToDelete.has(s.id) && 
                !(s.type === ShapeType.MARKER && s.markerConfig?.targets.some(t => idsToDelete.has(t.shapeId)))
      ));

      setSelectedIds(new Set());
  };

  const clearCanvas = () => {
    if (shapes.length === 0) return;
    if (confirm('Clear all drawings? This cannot be undone.')) {
        saveHistory(); 
        setShapes([]);
        setSelectedIds(new Set());
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);

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
              if (selectedIds.size > 0) { setSelectedIds(new Set()); setPivotIndex('center'); return; }
              if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
              setSnapIndicator(null);
          }

          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
              e.preventDefault();
              deleteSelected();
          }

          if (e.key === 'Enter' && selectedIds.size === 1) {
              const id = Array.from(selectedIds)[0];
              const s = shapes.find(sh => sh.id === id);
              if (s && s.type === ShapeType.TEXT) {
                  e.preventDefault();
                  setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
              }
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(false);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [selectedIds, textEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, pendingLineStart, tool]); 

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

    if (snap) {
        // Exclude hovered parent from snapping to avoid "snapping to center" while trying to project to edge
        const exclude = hoveredShapeId ? [hoveredShapeId] : [];
        const { point, snapped } = getSnapPoint(raw, shapes, [...Array.from(selectedIds), ...exclude]);
        setSnapIndicator(snapped ? point : null);
        return point;
    }
    setSnapIndicator(null);
    return raw;
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleToolChange = (newTool: ToolType) => {
    setTool(newTool);
    setSelectedIds(new Set());
    setSnapIndicator(null);
    setCursorPos(null);
    setSelectionBox(null);
    setPendingLineStart(null);
    setTextEditing(null);
    setPivotIndex('center'); 
    setPickingMirrorMode(false);
    setMarkingAnglesMode(false);
    setHoveredShapeId(null);
  };

  const updateShapes = (ids: Set<string>, updates: Partial<Shape> | ((s: Shape) => Shape)) => {
    let updatedShapes: Shape[] = [];
    setShapes(prev => {
        updatedShapes = prev.map(s => {
            if (!ids.has(s.id)) return s;
            if (typeof updates === 'function') return updates(s);
            return { ...s, ...updates };
        });
        // Recalculate dependent markers
        return updatedShapes.map(s => {
            if (s.type === ShapeType.MARKER) {
                const depends = s.markerConfig?.targets.some(t => ids.has(t.shapeId));
                if (depends) {
                    const recalculated = recalculateMarker(s, updatedShapes);
                    return recalculated || s;
                }
            }
            return s;
        });
    });
  };

  // --- Operations (Symmetry / Reflection) ---
  const handleReflection = (axis: 'x' | 'y' | 'line', lineId?: string) => {
      if (selectedIds.size === 0) return;
      saveHistory(); 
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      let mirrorLine: { p1: Point, p2: Point } | null = null;
      let axisAngle = 0;

      if (axis === 'x') {
          mirrorLine = { p1: {x: 0, y: centerY}, p2: {x: canvasSize.width, y: centerY} };
          axisAngle = 0;
      } else if (axis === 'y') {
           mirrorLine = { p1: {x: centerX, y: 0}, p2: {x: centerX, y: canvasSize.height} };
           axisAngle = 90;
      } else if (axis === 'line' && lineId) {
          const lineShape = shapes.find(s => s.id === lineId);
          if (lineShape && (lineShape.type === ShapeType.LINE || lineShape.points.length >= 2)) {
              const corners = getRotatedCorners(lineShape);
              mirrorLine = { p1: corners[0], p2: corners[1] };
              axisAngle = getAngleDegrees(corners[0], corners[1]);
          } else { return; }
      }

      if (!mirrorLine) return;

      setShapes(prev => prev.map(s => {
          if (!selectedIds.has(s.id)) return s;
          const isRigid = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TEXT, ShapeType.PROTRACTOR].includes(s.type);
          if (isRigid) {
              const currentCenter = getShapeCenter(s.points);
              const newCenter = reflectPointAcrossLine(currentCenter, mirrorLine!.p1, mirrorLine!.p2);
              const shift = { x: newCenter.x - currentCenter.x, y: newCenter.y - currentCenter.y };
              const newPoints = s.points.map(p => ({ x: p.x + shift.x, y: p.y + shift.y }));
              const oldRot = s.rotation || 0;
              let newRot = 2 * axisAngle - oldRot;
              newRot = newRot % 360; 
              if (newRot < 0) newRot += 360;
              return { ...s, points: newPoints, rotation: newRot };
          } else {
              const baked = bakeRotation(s);
              const newPoints = baked.points.map(p => {
                  return reflectPointAcrossLine(p, mirrorLine!.p1, mirrorLine!.p2);
              });
              return { ...baked, points: newPoints, rotation: 0 };
          }
      }));
      setPickingMirrorMode(false);
  };

  const calculateDragContext = (initialSelection: Set<string>, currentShapes: Shape[] = shapes) => {
      const movingIds = new Set(initialSelection);
      const queue = Array.from(initialSelection);
      const visited = new Set(initialSelection);

      while(queue.length > 0) {
          const currentId = queue.shift()!;
          const leader = currentShapes.find(s => s.id === currentId);
          if (!leader) continue;
          
          const leaderSize = getShapeSize(leader);
          const leaderSnapPoints = getDetailedSnapPoints(leader);

          currentShapes.forEach(follower => {
              if (visited.has(follower.id)) return;
              
              // NEW: Constraint Linkage
              // If follower is constrained to leader (e.g. Point on Line), it must move with leader
              if (follower.constraint && follower.constraint.parentId === currentId) {
                  movingIds.add(follower.id);
                  visited.add(follower.id);
                  queue.push(follower.id);
                  return;
              }

              // Existing Snapping Attachment Logic
              const isAttached = follower.points.some(fp => 
                  leaderSnapPoints.some(lp => distance(fp, lp) < 10)
              );

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

  const handleSmoothCurve = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      const idsToUpdate = new Set(selectedIds);
      setShapes(prev => prev.map(s => {
          if (idsToUpdate.has(s.id) && s.type === ShapeType.FREEHAND) {
              const simplifiedPoints = simplifyToQuadratic(s.points);
              return { ...s, points: simplifiedPoints };
          }
          return s;
      }));
  };

  // --- SMART MARKERS ---
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
             createMarker({
                 type: 'perpendicular',
                 targets: [ { shapeId: selectedShapes[0].id, pointIndices: [0, 1] }, { shapeId: selectedShapes[1].id, pointIndices: [0, 1] } ]
             });
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
                      const prev = (idx90 - 1 + 3) % 3;
                      const next = (idx90 + 1) % 3;
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
                  const maxUsed = Math.max(...usedEdgeIndices);
                  nextEdge = (maxUsed + 1) % numEdges;
              }
              const idx1 = nextEdge;
              const idx2 = (nextEdge + 1) % numEdges;
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
          const id = Array.from(selectedIds)[0];
          const shape = shapes.find(s => s.id === id);
          if (shape && shape.type === ShapeType.TEXT) {
              saveHistory();
              updateShapes(new Set([id]), { text: (shape.text || '') + symbol });
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
          const marker: Shape = {
              id, type: ShapeType.MARKER, points: [], fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0, markerConfig: mConfig
          };
          const updated = recalculateMarker(marker, shapes);
          if (updated) setShapes(prev => [...prev, updated]);
          return;
      }
      // Old arc
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
                 setShapes(loadedShapes); setHistory([]); setSelectedIds(new Set()); setTool(ToolType.SELECT);
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
          setShapes(loadedShapes); setHistory([]); setSelectedIds(new Set()); setTool(ToolType.SELECT); e.target.value = '';
      } catch (err) { alert("Failed to load project: " + err); }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEditing) return;
    if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
    
    let pos = getMousePos(e, true);
    
    if (tool === ToolType.SELECT) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
             setSelectedIds(new Set()); setPivotIndex('center'); 
        }
        const rawPos = getMousePos(e, false);
        setSelectionBox({ start: rawPos, current: rawPos });
        setIsDragging(true);
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
        setSelectedIds(new Set([id]));
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
        setSelectedIds(new Set([id]));
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
            setSelectedIds(new Set([id]));
            return;
        } else {
            const id = generateId();
            let labels = autoLabelMode ? ['A', 'B'] : undefined;
            const newShape: Shape = { id, type: ShapeType.LINE, points: [pendingLineStart, pos], labels, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
            setShapes(prev => [...prev, newShape]);
            setPendingLineStart(null);
            return;
        }
    }

    setDragStartPos(pos);
    setIsDragging(true);

    const id = generateId();
    let points: Point[] = [];
    let labels: string[] | undefined = undefined;
    
    // CONSTRAINT BINDING FOR POINTS (The Logic that makes "Linkage" happen)
    let constraint: { type: 'on_path', parentId: string } | undefined;
    if (tool === ToolType.POINT && hoveredShapeId) {
        const parent = shapes.find(s => s.id === hoveredShapeId);
        if (parent) {
            // Force point to be exactly on the shape line
            pos = getClosestPointOnShape(pos, parent);
            constraint = { type: 'on_path', parentId: hoveredShapeId };
            setSnapIndicator(null);
        }
    }

    switch (tool) {
      case ToolType.POINT: 
        points = [pos]; if(autoLabelMode) labels = ['A']; break;
      case ToolType.RECTANGLE:
      case ToolType.SQUARE:
        points = [pos, pos]; if(autoLabelMode) labels = ['A', 'B', 'C', 'D']; break;
      case ToolType.CIRCLE:
      case ToolType.ELLIPSE: points = [pos, pos]; break;
      case ToolType.TRIANGLE: 
        points = [pos, pos, pos]; if(autoLabelMode) labels = ['A', 'B', 'C']; break;
      case ToolType.FREEHAND: points = [pos]; break;
      default: points = [pos, pos];
    }

    const newShape: Shape = {
      id, type: tool as unknown as ShapeType, points, labels, fill: currentStyle.fill, stroke: currentStyle.stroke,
      strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0, constraint
    };

    setShapes((prev) => [...prev, newShape]);
    setActiveShapeId(id);
    setSelectedIds(new Set([id]));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (pickingMirrorMode) return;
    
    const rawPos = getMousePos(e, false);
    let currentPos = getMousePos(e, !isRotating && tool !== ToolType.SELECT); 
    setCursorPos(currentPos);

    // HOVER DETECTION FOR BINDING
    if (tool === ToolType.POINT && !isDragging) {
         // Raycast for shapes under cursor
         const bindableShapes = shapes.filter(s => [ShapeType.LINE, ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.PROTRACTOR].includes(s.type));
         let foundId: string | null = null;
         for (const s of bindableShapes) {
             const dist = distance(rawPos, getClosestPointOnShape(rawPos, s));
             if (dist < 15) { foundId = s.id; break; }
         }
         setHoveredShapeId(foundId);
    } else {
        if (!isDragging) setHoveredShapeId(null);
    }

    if (selectionBox) {
        setSelectionBox(prev => prev ? ({ ...prev, current: currentPos }) : null);
        return;
    }

    if (tool === ToolType.LINE && pendingLineStart && !isDragging) { getMousePos(e, true); return; }
    if (!isDragging) { if(tool !== ToolType.SELECT) getMousePos(e, true); return; }
    if (!dragStartPos) return;

    // --- RESIZING & PARENT MODIFICATION LINKAGE ---
    if (tool === ToolType.SELECT && dragHandleIndex !== null && selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0];
        const oldParent = shapes.find(s => s.id === id);
        
        if (oldParent) {
            updateShapes(new Set([id]), (s) => {
                const newPoints = [...s.points];
                newPoints[dragHandleIndex] = currentPos;
                return { ...s, points: newPoints };
            });

            // UPDATE DEPENDENT CHILDREN
            if (resizeContext) {
                const { constrainedChildren, connectedLines } = resizeContext;
                const newParentPoints = [...oldParent.points];
                newParentPoints[dragHandleIndex] = currentPos;
                
                // Update Constrained Points (Geometric Ratio)
                const childrenToUpdate = new Set(constrainedChildren.map(c => c.childId));
                updateShapes(childrenToUpdate, (child) => {
                    const ctx = constrainedChildren.find(c => c.childId === child.id);
                    if (!ctx) return child;
                    
                    // Simple segment logic for now (assuming Line parent)
                    let pA = newParentPoints[0]; 
                    let pB = newParentPoints[1];
                    
                    if (oldParent.type !== ShapeType.LINE && oldParent.points.length > 1) {
                        // For polygon, fallback to first segment or improved logic later
                        pA = newParentPoints[0]; pB = newParentPoints[1];
                    }

                    // Slide the child point to the new location based on 't'
                    const newChildPos = lerp(pA, pB, ctx.t);
                    return { ...child, points: [newChildPos] };
                });

                // Update Connected Lines (Topology)
                const linesToUpdate = new Set(connectedLines.map(c => c.lineId));
                updateShapes(linesToUpdate, (line) => {
                    const ctx = connectedLines.find(c => c.lineId === line.id);
                    if (!ctx) return line;
                    const newLinePoints = [...line.points];
                    newLinePoints[ctx.pointIndex] = currentPos;
                    return { ...line, points: newLinePoints };
                });
            }
        }
        return;
    }

    // --- MOVING ---
    if (tool === ToolType.SELECT && dragHandleIndex === null) {
         // 1. Constrained Dragging: If dragging a constrained point, project mouse onto parent path
         if (selectedIds.size === 1) {
             const id = Array.from(selectedIds)[0];
             const shape = shapes.find(s => s.id === id);
             if (shape && shape.constraint?.type === 'on_path') {
                 const parent = shapes.find(p => p.id === shape.constraint!.parentId);
                 if (parent) {
                     currentPos = getClosestPointOnShape(rawPos, parent);
                 }
             }
         }

         const dx = currentPos.x - dragStartPos.x;
         const dy = currentPos.y - dragStartPos.y;
         
         if (textEditing) return;

         let context = dragContext;
         if (!context) {
             context = calculateDragContext(selectedIds);
             setDragContext(context);
         }

         if (context) {
             const { movingShapeIds, connectedPoints } = context;
             
             updateShapes(new Set([...movingShapeIds, ...connectedPoints.map(c=>c.shapeId)]), (s) => {
                 // Case 1: Constrained Point (Leader) -> Set absolute position from projection
                 if (movingShapeIds.has(s.id) && s.constraint) {
                     return { ...s, points: [currentPos] }; 
                 }

                 // Case 2: Normal Shape -> Translate
                 if (movingShapeIds.has(s.id)) {
                     return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                 }

                 // Case 3: Connected Line -> Snap vertex to leader
                 const connections = connectedPoints.filter(cp => cp.shapeId === s.id);
                 if (connections.length > 0) {
                     const newPoints = [...s.points];
                     connections.forEach(conn => {
                         // If connected to a constrained leader, snap directly to currentPos
                         if (selectedIds.size === 1) {
                             const leader = shapes.find(l => l.id === Array.from(selectedIds)[0]);
                             if (leader?.constraint) {
                                 newPoints[conn.pointIndex] = currentPos;
                                 return;
                             }
                         }
                         // Default translation
                         newPoints[conn.pointIndex] = {
                             x: newPoints[conn.pointIndex].x + dx,
                             y: newPoints[conn.pointIndex].y + dy
                         };
                     });
                     return { ...s, points: newPoints };
                 }
                 return s;
             });
         }
         
         setDragStartPos(currentPos);
         return;
    }

    // Drawing
    if (activeShapeId) {
        setShapes((prev) => prev.map((s) => {
            if (s.id !== activeShapeId) return s;
            const start = s.points[0];
            let newPoints = [...s.points];

            if (s.type === ShapeType.POINT) {
            } else if (s.type === ShapeType.FREEHAND) {
                const lastPoint = s.points[s.points.length - 1];
                if (distance(lastPoint, currentPos) > 2) {
                    newPoints = [...s.points, currentPos];
                }
            } else if (s.type === ShapeType.LINE) {
                newPoints[1] = currentPos;
            } else if (s.type === ShapeType.TRIANGLE) {
                const w = currentPos.x - start.x;
                newPoints[1] = { x: start.x - w, y: currentPos.y };
                newPoints[2] = currentPos;
            } else {
                newPoints[1] = currentPos;
                if (tool === ToolType.SQUARE || tool === ToolType.CIRCLE) {
                    const w = currentPos.x - start.x;
                    const h = currentPos.y - start.y;
                    const dim = Math.max(Math.abs(w), Math.abs(h));
                    newPoints[1] = {
                        x: start.x + (w < 0 ? -dim : dim),
                        y: start.y + (h < 0 ? -dim : dim)
                    };
                }
            }
            return { ...s, points: newPoints };
        }));
    }
  };

  const handleResizeStart = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      saveHistory(); 
      setDragHandleIndex(index);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);

      // PRE-CALCULATE DEPENDENCIES FOR RESIZING
      if (selectedIds.size === 1) {
          const parentId = Array.from(selectedIds)[0];
          const parent = shapes.find(s => s.id === parentId);
          if (parent) {
              const constrainedChildren: any[] = [];
              const connectedLines: any[] = [];
              
              // Find attached points (children)
              shapes.forEach(child => {
                  if (child.constraint && child.constraint.parentId === parentId) {
                      // Calculate current ratio 't'
                      let t = 0;
                      if (parent.type === ShapeType.LINE && parent.points.length >= 2) {
                          t = getProjectionParameter(child.points[0], parent.points[0], parent.points[1]);
                      } else {
                          // Simplification: assume on first segment for now
                           if (parent.points.length >= 2) {
                               t = getProjectionParameter(child.points[0], parent.points[0], parent.points[1]);
                           }
                      }
                      constrainedChildren.push({ childId: child.id, t, segmentIndex: 0 });
                  }
              });

              // Find connected lines (topology) that share the vertex being dragged
              const draggedVertex = parent.points[index];
              shapes.forEach(s => {
                  if (s.id === parentId) return;
                  s.points.forEach((pt, i) => {
                      if (distance(pt, draggedVertex) < 5) {
                          connectedLines.push({ lineId: s.id, pointIndex: i });
                      }
                  });
              });

              setResizeContext({ constrainedChildren, connectedLines });
          }
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setDragContext(null);
    setResizeContext(null);
    setIsRotating(false);
    setRotationCenter(null);
    setCurrentRotationDisplay(null);

    // Smart Sketch
    if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) {
        const freehandShape = shapes.find(s => s.id === activeShapeId);
        if (freehandShape && freehandShape.points.length > 10) {
            const recognized = recognizeFreehandShape(freehandShape.points);
            if (recognized) {
                let labels = autoLabelMode ? (recognized.type === ShapeType.TRIANGLE ? ['A','B','C'] : ['A','B']) : undefined;
                setShapes(prev => prev.map(s => s.id === activeShapeId ? { ...s, type: recognized.type, points: recognized.points, labels } : s));
            }
        }
    }

    if (selectionBox) {
        const r = { start: selectionBox.start, end: selectionBox.current };
        const hits = shapes.filter(s => isShapeInRect(s, r)).map(s => s.id);
        setSelectedIds(prev => {
             if (e.ctrlKey || e.metaKey || e.shiftKey) {
                 const next = new Set(prev); hits.forEach(id => next.add(id)); return next;
             }
             if (hits.length === 0) setPivotIndex('center'); 
             return new Set(hits);
        });
        setSelectionBox(null); setIsDragging(false); return;
    }

    if (tool === ToolType.LINE && activeShapeId) {
        const shape = shapes.find(s => s.id === activeShapeId);
        if (shape) {
             const dist = distance(shape.points[0], shape.points[1]);
             if (dist < 5) {
                 setShapes(prev => prev.filter(s => s.id !== activeShapeId));
                 setActiveShapeId(null); setIsDragging(false); return;
             } else { setPendingLineStart(null); }
        }
    }

    setIsDragging(false); setDragStartPos(null); setDragHandleIndex(null); setActiveShapeId(null);
  };

  const handleShapeMouseDown = (e: React.MouseEvent, id: string) => {
      if (pickingMirrorMode) {
          e.stopPropagation();
          const target = shapes.find(s => s.id === id);
          if (target && target.type === ShapeType.LINE) handleReflection('line', id);
          else alert("Please select a LINE shape to act as the mirror axis.");
          return;
      }
      if (tool !== ToolType.SELECT) return;
      e.stopPropagation();
      
      if (e.altKey) {
          saveHistory();
          const idsToCopy = selectedIds.has(id) ? new Set(selectedIds) : new Set([id]);
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
      
      let newSelection = new Set(selectedIds);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (newSelection.has(id)) newSelection.delete(id); else newSelection.add(id);
      } else {
          if (!newSelection.has(id)) {
              newSelection = new Set([id]);
              const target = shapes.find(s=>s.id === id);
              setPivotIndex(target?.type === ShapeType.PROTRACTOR ? 99 : 'center'); 
          }
      }
      saveHistory();
      setSelectedIds(newSelection);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);
      setDragContext(calculateDragContext(newSelection));
  };

  const handleMouseMoveWithRotation = (e: React.MouseEvent) => {
      const currentPos = getMousePos(e, !isRotating && !pickingMirrorMode); 
      setCursorPos(currentPos);
      if (isRotating && rotationCenter && selectedIds.size === 1) {
          const dx = currentPos.x - rotationCenter.x;
          const dy = currentPos.y - rotationCenter.y;
          const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const delta = currentAngle - lastRotationMouseAngle.current;
          lastRotationMouseAngle.current = currentAngle; 
          const id = Array.from(selectedIds)[0];
          updateShapes(new Set([id]), (s) => {
               const isVertexShape = [ShapeType.TRIANGLE, ShapeType.LINE, ShapeType.FREEHAND, ShapeType.POINT].includes(s.type);
               if (isVertexShape) {
                   const newPoints = s.points.map(p => rotatePoint(p, rotationCenter, delta));
                   return { ...s, points: newPoints, rotation: 0 };
               } else {
                   let newRotation = (s.rotation + delta) % 360;
                   let newPoints = s.points;
                   if (pivotIndex !== 'center') {
                       const oldCenter = getShapeCenter(s.points);
                       const newCenter = rotatePoint(oldCenter, rotationCenter!, delta);
                       const shiftX = newCenter.x - oldCenter.x;
                       const shiftY = newCenter.y - oldCenter.y;
                       newPoints = s.points.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));
                   }
                   setCurrentRotationDisplay(Math.round(newRotation));
                   return { ...s, rotation: newRotation, points: newPoints };
               }
          });
          return;
      }
      handleMouseMove(e);
  };
  const lastRotationMouseAngle = useRef<number>(0);
  const handleRotateStart = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (selectedIds.size !== 1) return;
      saveHistory(); 
      const id = Array.from(selectedIds)[0];
      const shape = shapes.find(s => s.id === id);
      if (!shape) return;
      const isVertexShape = [ShapeType.TRIANGLE, ShapeType.LINE, ShapeType.FREEHAND, ShapeType.POINT].includes(shape.type);
      let workShape = shape;
      if (isVertexShape && shape.rotation !== 0) {
          const baked = bakeRotation(shape); updateShapes(selectedIds, baked); workShape = baked; setInitialShapeRotation(0);
      } else { setInitialShapeRotation(shape.rotation || 0); }
      let center: Point;
      if (pivotIndex === 'center') center = getShapeCenter(workShape.points);
      else if (typeof pivotIndex === 'number') {
          if (isVertexShape) center = workShape.points[pivotIndex];
          else center = getRotatedCorners(workShape)[pivotIndex] || getShapeCenter(workShape.points);
      } else center = getShapeCenter(workShape.points);
      setRotationCenter(center);
      const mousePos = getMousePos(e, false);
      const startAngle = (Math.atan2(mousePos.y - center.y, mousePos.x - center.x) * 180) / Math.PI;
      setRotationStartAngle(startAngle); lastRotationMouseAngle.current = startAngle; 
      setIsRotating(true); setIsDragging(false);
  };
  const handleShapeDoubleClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); if (tool === ToolType.SELECT) {
          const s = shapes.find(sh => sh.id === id); if (s && s.type === ShapeType.TEXT) setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
      }
  };
  const handleTriangleAngleChange = (angleIndex: number, valStr: string) => {
      const id = Array.from(selectedIds)[0]; const shape = shapes.find(s => s.id === id); if (!shape || shape.type !== ShapeType.TRIANGLE) return;
      const targetAngle = parseAngle(valStr); if (isNaN(targetAngle)) return;
      saveHistory(); 
      let workingPoints = shape.rotation ? bakeRotation(shape).points : shape.points;
      let fixedVertexIdx = (lastEditedVertexIdx !== null && lastEditedVertexIdx !== angleIndex) ? lastEditedVertexIdx : (angleIndex + 1) % 3;
      const idxA = angleIndex; const idxB = fixedVertexIdx; const idxC = [0,1,2].find(i => i !== idxA && i !== idxB)!;
      const newPointC = solveTriangleASA(workingPoints[idxA], workingPoints[idxB], targetAngle, Object.values(calculateTriangleAngles(workingPoints))[idxB], workingPoints[idxC]);
      const newPoints = [...workingPoints]; newPoints[idxC] = newPointC;
      updateShapes(selectedIds, { points: newPoints, rotation: 0 }); setLastEditedVertexIdx(angleIndex);
  };
  const commitText = () => {
      if (!textEditing) return;
      saveHistory(); 
      if (textEditing.text.trim() === '') setShapes(prev => prev.filter(s => s.id !== textEditing.id));
      else updateShapes(new Set([textEditing.id]), { text: textEditing.text });
      setTextEditing(null);
  };
  const updateSelectedStyle = (key: any, value: any) => {
    if (key === 'fontSize') { if (selectedIds.size > 0) { saveHistory(); updateShapes(selectedIds, { fontSize: value }); } return; }
    setCurrentStyle(prev => ({ ...prev, [key]: value })); if (selectedIds.size > 0) { saveHistory(); updateShapes(selectedIds, { [key]: value }); }
  };
  const getCommonFontSize = () => {
      if (selectedIds.size === 0) return 16;
      return shapes.find(x => x.id === Array.from(selectedIds)[0])?.fontSize || 16;
  };
  const showSmoothButton = selectedIds.size > 0 && Array.from(selectedIds).every(id => shapes.find(s => s.id === id)?.type === ShapeType.FREEHAND);
  const showSymbolPanel = textEditing !== null || (selectedIds.size === 1 && shapes.find(s => s.id === Array.from(selectedIds)[0])?.type === ShapeType.TEXT);
  const generateAppIcon = () => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => { ctx.clearRect(0,0,1024,1024); ctx.drawImage(img, 0, 0, 1024, 1024); const url = canvas.toDataURL('image/png'); const link = document.createElement('a'); link.download = 'icon.png'; link.href = url; link.click(); }; img.src = '/icon.svg';
  };

  const handleExport = (format: 'png' | 'jpeg') => {
      if (svgRef.current) {
          exportCanvas(svgRef.current, format, 'geodraw-export');
      }
  };

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
                {shapes.map((shape) => {
                    const isHoveredForBinding = hoveredShapeId === shape.id;
                    return (
                        <g key={shape.id} onMouseDown={(e) => handleShapeMouseDown(e, shape.id)} onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)} opacity={pickingMirrorMode && shape.type !== ShapeType.LINE ? 0.3 : 1} style={{ cursor: pickingMirrorMode ? (shape.type === ShapeType.LINE ? 'pointer' : 'not-allowed') : (selectedIds.has(shape.id) ? 'move' : (tool === ToolType.FREEHAND ? 'none' : 'pointer')) }}>
                            {isHoveredForBinding && <g style={{ opacity: 0.5, pointerEvents: 'none' }}><ShapeRenderer shape={{...shape, strokeWidth: shape.strokeWidth + 6, stroke: '#fbbf24', fill: 'none'}} isSelected={false} /></g>}
                            <ShapeRenderer shape={shape} isSelected={selectedIds.has(shape.id)} />
                        </g>
                    );
                })}
                {Array.from(selectedIds).map(id => {
                    const s = shapes.find(sh => sh.id === id);
                    if (!s || (s.type === ShapeType.TEXT && tool !== ToolType.SELECT)) return null; 
                    if (pickingMirrorMode || s.type === ShapeType.MARKER) return null; 
                    return <SelectionOverlay key={id} shape={s} isSelected={true} pivotIndex={pivotIndex} isAltPressed={isAltPressed} isMarkingAngles={markingAnglesMode} onResizeStart={handleResizeStart} onAngleChange={handleTriangleAngleChange} onRotateStart={handleRotateStart} onSetPivot={setPivotIndex} onMarkAngle={(idx) => handleCornerClick(s.id, idx)} />;
                })}
                {selectionBox && <rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeDasharray="4" />}
                {tool === ToolType.LINE && pendingLineStart && !isDragging && snapIndicator && <line x1={pendingLineStart.x} y1={pendingLineStart.y} x2={snapIndicator.x} y2={snapIndicator.y} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4" />}
                {snapIndicator && <circle cx={snapIndicator.x} cy={snapIndicator.y} r={6} fill="none" stroke="#ef4444" strokeWidth={2} className="pointer-events-none" />}
                {tool === ToolType.FREEHAND && cursorPos && <circle cx={cursorPos.x} cy={cursorPos.y} r={1.5} fill={currentStyle.stroke} className="pointer-events-none" />}
            </svg>
            {pickingMirrorMode && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse font-medium">Select a LINE on the canvas to mirror across</div>}
            {markingAnglesMode && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse font-medium">Click a corner to mark the angle</div>}
            {isRotating && currentRotationDisplay !== null && rotationCenter && <div style={{ position: 'absolute', left: `${rotationCenter.x}px`, top: `${rotationCenter.y - 60}px`, transform: 'translateX(-50%)' }} className="z-50 pointer-events-none bg-black/75 text-white px-2 py-1 rounded text-xs font-mono">{currentRotationDisplay}°</div>}
            {textEditing && <div style={{ position: 'absolute', left: `${textEditing.x}px`, top: `${textEditing.y}px`, transform: 'translate(0, -50%)' }} className="z-50 pointer-events-auto"><input ref={inputRef} value={textEditing.text} onChange={(e) => setTextEditing(prev => prev ? ({ ...prev, text: e.target.value }) : null)} onBlur={commitText} onKeyDown={(e) => { if(e.key === 'Enter') commitText(); }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="bg-transparent border border-brand-500 rounded px-1 py-0.5 font-sans text-brand-900 outline-none shadow-lg min-w-[50px] shadow-sm bg-white/50 backdrop-blur-sm" style={{ color: shapes.find(s=>s.id === textEditing.id)?.stroke || 'black', fontSize: `${shapes.find(s=>s.id === textEditing.id)?.fontSize || 16}px` }} /></div>}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-500 pointer-events-none select-none flex items-center gap-2">
                 <Magnet size={12} className={snapIndicator ? "text-red-500" : "text-gray-400"} />
                 {tool === ToolType.SELECT ? (isAltPressed ? 'Alt held: Drag to copy.' : 'Click to select. Drag to move.') : (tool === ToolType.FREEHAND ? 'Drag to sketch.' : (hoveredShapeId ? 'Click to Bind Point' : 'Drag to draw. Snapping active.'))}
                 {hoveredShapeId && <span className="flex items-center text-green-600 font-bold animate-pulse ml-2"><Link2 size={12} className="mr-1"/> Link</span>}
            </div>
        </main>
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col z-10 shadow-sm overflow-y-auto shrink-0">
             <div className="p-5 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Grid3X3 size={16} /> Coordinate System</h3>
                <div className="space-y-3"><div className="flex items-center justify-between text-sm"><span>Show Axes</span><input type="checkbox" checked={axisConfig.visible} onChange={() => setAxisConfig(p => ({...p, visible: !p.visible}))} className="accent-brand-600" /></div><div className="flex items-center gap-2 text-sm"><span>Ticks: {axisConfig.ticks}</span><input type="range" min="1" max="20" value={axisConfig.ticks} onChange={(e) => setAxisConfig(p => ({...p, ticks: Number(e.target.value)}))} className="flex-1 accent-brand-600 h-1" /></div></div>
             </div>
             {!pickingMirrorMode && <div className={`p-5 border-b border-gray-100 bg-slate-50 transition-all ${selectedIds.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Spline size={16} /> Operations</h3>
                    <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => handleReflection('y')} className="btn-op"><FlipVertical size={20} className="mb-1" /><span className="text-[10px]">Flip V</span></button>
                        <button onClick={() => handleReflection('x')} className="btn-op"><FlipHorizontal size={20} className="mb-1" /><span className="text-[10px]">Flip H</span></button>
                        <button onClick={() => setPickingMirrorMode(true)} className="btn-op"><div className="relative"><FlipHorizontal size={20} className="mb-1" /><div className="absolute -right-1 -bottom-1 text-[10px] bg-brand-100 px-0.5 rounded border border-brand-200">/</div></div><span className="text-[10px]">Mirror /</span></button>
                        <button onClick={toggleMarkAnglesMode} className={`btn-op ${markingAnglesMode ? 'bg-brand-100 border-brand-500' : ''}`}><Radius size={20} className="mb-1" /><span className="text-[10px]">Angles</span></button>
                        {showSmoothButton && <button onClick={handleSmoothCurve} className="btn-op col-span-4 mt-2 bg-brand-50 border-brand-200"><div className="flex items-center gap-2"><Wand2 size={16} /><span className="text-xs font-semibold">Smooth Arc</span></div></button>}
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
