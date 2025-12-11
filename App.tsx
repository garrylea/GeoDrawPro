
import React, { useState, useRef, useEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, MarkerType, MarkerConfig } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { exportCanvas, saveProject, loadProject, isElectron } from './utils/exportUtils';
import { getSnapPoint, calculateTriangleAngles, parseAngle, solveTriangleASA, getShapeSize, distance, isShapeInRect, getDetailedSnapPoints, getShapeCenter, getRotatedCorners, rotatePoint, bakeRotation, reflectPointAcrossLine, getAngleDegrees, getAngleCurve, simplifyToQuadratic, recognizeFreehandShape, recalculateMarker } from './utils/mathUtils';
import { Download, Trash2, Settings2, Grid3X3, Minus, Plus, Magnet, RotateCw, FlipHorizontal, FlipVertical, Spline, Undo, Eraser, MoreHorizontal, Image as ImageIcon, Copy, Radius, Type, Wand2, Calculator, Save, FolderOpen, CaseUpper, Sparkles, CornerRightUp, ArrowRight, Hash, MoveHorizontal } from 'lucide-react';

export default function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  // History Stack for Undo
  const [history, setHistory] = useState<Shape[][]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);
  
  // Extended style state with strokeType
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
  const [cursorPos, setCursorPos] = useState<Point | null>(null); // Track raw mouse pos for custom cursor
  
  // Rotation State
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [initialShapeRotation, setInitialShapeRotation] = useState(0);
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [currentRotationDisplay, setCurrentRotationDisplay] = useState<number | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Reflection/Operation State
  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  
  // Angle Marking State
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  
  // Auto Labeling State
  const [autoLabelMode, setAutoLabelMode] = useState(false);
  
  // Smart Sketch State
  const [smartSketchMode, setSmartSketchMode] = useState(false);

  // Drag Context for complex movement (Groups + Connections)
  const [dragContext, setDragContext] = useState<{
      movingShapeIds: Set<string>;
      connectedPoints: { shapeId: string; pointIndex: number }[];
  } | null>(null);

  // Line Construction State
  const [pendingLineStart, setPendingLineStart] = useState<Point | null>(null);

  // Text Editing State
  const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // File Input Ref for Loading Projects
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection Box State
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  const [lastEditedVertexIdx, setLastEditedVertexIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // Initialize with window size, but update immediately via ResizeObserver to fit the actual container
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Handle Canvas Resize (Responsive to Sidebar/Window changes)
  useEffect(() => {
    const updateCanvasSize = () => {
        if (svgRef.current) {
            const { clientWidth, clientHeight } = svgRef.current;
            setCanvasSize({ width: clientWidth, height: clientHeight });
        }
    };

    // Initial sizing
    updateCanvasSize();

    // Use ResizeObserver to detect changes to the SVG container (flexbox adjustments)
    const observer = new ResizeObserver(() => {
        updateCanvasSize();
    });

    if (svgRef.current) {
        observer.observe(svgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Ensure input gets focus
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
      setHistory(prev => prev.slice(0, -1)); // Remove last
      setShapes(previousState);
      setSelectedIds(new Set()); // Clear selection to avoid edge cases
      setPendingLineStart(null); // Reset tool states
      setActiveShapeId(null);
  };

  // --- Deletion Logic ---
  const deleteSelected = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      // Remove selected shapes AND any markers that depend on them
      const idsToDelete = new Set(selectedIds);
      
      // Find dependent markers
      shapes.forEach(s => {
          if (s.type === ShapeType.MARKER && s.markerConfig) {
              const deps = s.markerConfig.targets.map(t => t.shapeId);
              if (deps.some(d => idsToDelete.has(d))) {
                  idsToDelete.add(s.id);
              }
          }
      });

      setShapes(prev => prev.filter(s => !idsToDelete.has(s.id)));
      setSelectedIds(new Set());
  };

  const clearCanvas = () => {
    if (shapes.length === 0) return;
    if (confirm('Clear all drawings? This cannot be undone.')) {
        saveHistory(); // Save before clear
        setShapes([]);
        setSelectedIds(new Set());
    }
  };

  // Keyboard Shortcuts & Modifiers
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);

          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
          if (textEditing) return;

          // Save Shortcut (Ctrl+S or Cmd+S)
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              handleSaveProject();
              return;
          }

          // Open Shortcut (Ctrl+O or Cmd+O)
          if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
              e.preventDefault();
              handleOpenProjectClick();
              return;
          }

          // Undo Shortcut (Ctrl+Z or Cmd+Z)
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              undo();
              return;
          }

          if (e.key === 'Escape') {
              // 1. Cancel Mirror/Angle Mode
              if (pickingMirrorMode) {
                  setPickingMirrorMode(false);
                  return;
              }
              if (markingAnglesMode) {
                  setMarkingAnglesMode(false);
                  return;
              }

              // 2. Cancel Line Drawing (Point-to-Point)
              if (pendingLineStart) {
                  setPendingLineStart(null);
                  setTool(ToolType.SELECT); // Also reset to select
                  return; 
              }

              // 3. Cancel Shape Creation (Dragging to create)
              if (activeShapeId) {
                  // We must reference the current ID to remove it
                  const idToRemove = activeShapeId;
                  setShapes(prev => prev.filter(s => s.id !== idToRemove));
                  setActiveShapeId(null);
                  setIsDragging(false);
                  setTool(ToolType.SELECT);
                  return;
              }

              // 4. Deselect if items are selected
              if (selectedIds.size > 0) {
                  setSelectedIds(new Set());
                  setPivotIndex('center');
                  return;
              }

              // 5. Reset Tool to Select (if nothing else happened)
              if (tool !== ToolType.SELECT) {
                  setTool(ToolType.SELECT);
                  return;
              }
              
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
    
    // DISABLE SNAPPING FOR FREEHAND COMPLETELY
    if (tool === ToolType.FREEHAND) {
        setSnapIndicator(null);
        return raw;
    }

    if (snap) {
        const { point, snapped } = getSnapPoint(raw, shapes, Array.from(selectedIds));
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
    setPivotIndex('center'); // Reset pivot logic on tool change
    setPickingMirrorMode(false);
    setMarkingAnglesMode(false);
  };

  /**
   * Helper to update shapes AND recalculate any dependent markers.
   */
  const updateShapes = (ids: Set<string>, updates: Partial<Shape> | ((s: Shape) => Shape)) => {
    let updatedShapes: Shape[] = [];
    
    setShapes(prev => {
        updatedShapes = prev.map(s => {
            if (!ids.has(s.id)) return s;
            if (typeof updates === 'function') return updates(s);
            return { ...s, ...updates };
        });

        // RECALCULATE MARKERS
        // We iterate through all shapes, finding markers.
        // If a marker depends on one of the `ids` that changed, we recalc it.
        // Optimization: recalc all markers is cheap enough for now (hundreds of shapes).
        // A better optimization would be to find dependent markers first.
        
        return updatedShapes.map(s => {
            if (s.type === ShapeType.MARKER) {
                // Check if marker depends on updated shapes
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

      saveHistory(); // Save before reflection

      // Center based on actual canvas size, not window size
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
          } else {
              return;
          }
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

  // Convert a jagged freehand line into a smooth quadratic curve (3 points)
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

      // HELPER: Add new marker
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
          // Logic 1: Two Intersecting Lines
          if (selectedShapes.length === 2) {
             createMarker({
                 type: 'perpendicular',
                 targets: [
                     { shapeId: selectedShapes[0].id, pointIndices: [0, 1] }, 
                     { shapeId: selectedShapes[1].id, pointIndices: [0, 1] }
                 ]
             });
          }
          // Logic 2: Single Shape (Triangle or Rect)
          else if (selectedShapes.length === 1) {
              const s = selectedShapes[0];
              // Get Corners
              const corners = getRotatedCorners(s);
              
              if ([ShapeType.RECTANGLE, ShapeType.SQUARE].includes(s.type)) {
                  // Mark Bottom-Left Corner (index 3) using points [2, 3, 0]
                  // Rect corners: 0(TL), 1(TR), 2(BR), 3(BL)
                  createMarker({
                      type: 'perpendicular',
                      targets: [{ shapeId: s.id, pointIndices: [2, 3, 0] }]
                  });
              } 
              else if (s.type === ShapeType.TRIANGLE && s.points.length === 3) {
                  // Find Right Angle
                  const angles = calculateTriangleAngles(getRotatedCorners(s));
                  // Find index closest to 90
                  const angleArr = [angles.A, angles.B, angles.C];
                  const idx90 = angleArr.findIndex(a => Math.abs(a - 90) < 5); // 5 degree tolerance
                  
                  if (idx90 !== -1) {
                      // Indices for corners: 
                      // 0 (A): [2,0,1]
                      // 1 (B): [0,1,2]
                      // 2 (C): [1,2,0]
                      const prev = (idx90 - 1 + 3) % 3;
                      const next = (idx90 + 1) % 3;
                      createMarker({
                          type: 'perpendicular',
                          targets: [{ shapeId: s.id, pointIndices: [prev, idx90, next] }]
                      });
                  } else {
                      // Fallback: Just mark corner 0 if no clear 90 degree angle? 
                      // Or tell user? Let's just default to corner B (usually bottom left in drawing order)
                      createMarker({
                          type: 'perpendicular',
                          targets: [{ shapeId: s.id, pointIndices: [0, 1, 2] }]
                      });
                  }
              }
          }
      } 
      else if (type === 'parallel_arrow' || type === 'equal_tick') {
          // CYCLE LOGIC:
          // Check if selected shape already has this marker type on edge X.
          // If so, add to edge X+1.
          
          selectedShapes.forEach(s => {
              // Determine number of edges
              let numEdges = 0;
              if (s.type === ShapeType.LINE) numEdges = 1;
              else if (s.type === ShapeType.TRIANGLE) numEdges = 3;
              else if (s.type === ShapeType.RECTANGLE || s.type === ShapeType.SQUARE) numEdges = 4;
              
              if (numEdges === 0) return;

              // Find existing markers of this type attached to this shape
              const existing = shapes.filter(m => 
                  m.type === ShapeType.MARKER && 
                  m.markerConfig?.type === type &&
                  m.markerConfig.targets[0].shapeId === s.id
              );
              
              // Find used edges (by checking first point index of target)
              const usedEdgeIndices = existing.map(m => m.markerConfig!.targets[0].pointIndices[0]);
              
              // Find next available edge
              // Logic: Find Max used index. Next is (max + 1) % edges.
              // If none used, start at 0.
              
              let nextEdge = 0;
              if (usedEdgeIndices.length > 0) {
                  // Actually, let's just cycle. If 0 is used, try 1. If 1 used, try 2.
                  // If all used, add double marker? No, just overlap or ignore.
                  // Simple cycle: look at the *last created* marker's edge and increment?
                  // Easier: Just find the first edge index 0..N that is NOT in usedEdgeIndices?
                  // No, user might want to add Arrow to ALL sides.
                  // So we strictly cycle: Last added was 0 -> Add 1. Last was 1 -> Add 2.
                  
                  // Sort used indices
                  const maxUsed = Math.max(...usedEdgeIndices);
                  nextEdge = (maxUsed + 1) % numEdges;
              }
              
              // Define indices for the edge.
              // For Poly (N points): Edge i connects i and (i+1)%N.
              const idx1 = nextEdge;
              const idx2 = (nextEdge + 1) % numEdges; // Implicitly works for Rect (4 pts) and Tri (3 pts)
              
              // Special case for Line: It only has 1 edge (indices 0,1).
              if (s.type === ShapeType.LINE) {
                  if (usedEdgeIndices.length > 0) {
                      // Already marked. Maybe remove it? Or Add double arrow?
                      // For now, let's just do nothing or replace?
                      // Let's allow adding another marker (maybe user wants 2 arrows)
                      // But effectively it overlaps. 
                      // Let's just create it.
                  }
                  createMarker({
                      type: type,
                      targets: [{ shapeId: s.id, pointIndices: [0, 1] }]
                  });
              } else {
                  createMarker({
                      type: type,
                      targets: [{ shapeId: s.id, pointIndices: [idx1, idx2] }]
                  });
              }
          });
      }
      
      setShapes(prev => [...prev, ...newMarkers]);
  };

  // Insert Math Symbol
  const handleSymbolClick = (symbol: string) => {
      // Case 1: Active Text Editing
      if (textEditing) {
          setTextEditing(prev => {
              if (!prev) return null;
              return { ...prev, text: prev.text + symbol };
          });
          // Focus input again after click
          if(inputRef.current) setTimeout(() => inputRef.current?.focus(), 10);
          return;
      }
      
      // Case 2: Text Shape Selected
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
      
      // If marking angles mode, create a Smart Marker (Angle Arc) instead of static path
      if (markingAnglesMode) {
          const s = shapes.find(shape => shape.id === shapeId);
          if (!s) return;
          
          let indices = [0,0,0];
          // Determine 3 indices forming the corner: [prev, curr, next]
          const len = s.type === ShapeType.TRIANGLE ? 3 : (s.type === ShapeType.RECTANGLE || s.type === ShapeType.SQUARE ? 4 : 0);
          if (len === 0) return;
          
          const prev = (vertexIndex - 1 + len) % len;
          const next = (vertexIndex + 1) % len;
          indices = [prev, vertexIndex, next];
          
          const mConfig: MarkerConfig = {
              type: 'angle_arc',
              targets: [{ shapeId: shapeId, pointIndices: indices }]
          };
          
          const id = generateId();
          const marker: Shape = {
              id, type: ShapeType.MARKER, points: [],
              fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0,
              markerConfig: mConfig
          };
          const updated = recalculateMarker(marker, shapes);
          if (updated) setShapes(prev => [...prev, updated]);
          
          return;
      }

      // Legacy fallback (Static Path)
      const s = shapes.find(shape => shape.id === shapeId);
      if (!s) return;
      let corners: Point[] = [];
      if (s.type === ShapeType.TRIANGLE) {
          corners = bakeRotation(s).points;
      } else if ([ShapeType.RECTANGLE, ShapeType.SQUARE].includes(s.type)) {
          corners = getRotatedCorners(s);
      } else {
          return;
      }
      if (vertexIndex >= corners.length) return;
      const curr = corners[vertexIndex];
      const prev = corners[(vertexIndex - 1 + corners.length) % corners.length];
      const next = corners[(vertexIndex + 1) % corners.length];
      const radius = 25; 
      const pathData = getAngleCurve(curr, prev, next, radius);

      const newShape: Shape = {
          id: generateId(),
          type: ShapeType.PATH,
          points: [curr], 
          pathData: pathData,
          fill: 'none',
          stroke: currentStyle.stroke || '#000000',
          strokeWidth: 2,
          rotation: 0
      };
      setShapes(prevShapes => [...prevShapes, newShape]);
  };

  // --- Project IO ---
  const handleSaveProject = () => {
      if (isElectron()) {
          // In Electron, we skip the prompt because the native Save Dialog 
          // allows the user to name the file.
          saveProject(shapes, 'project'); 
      } else {
          const filename = prompt("Enter project name:", "my-geodraw-project");
          if (filename) {
              saveProject(shapes, filename);
          }
      }
  };

  const handleOpenProjectClick = async () => {
      if (shapes.length > 0) {
          if (!confirm("Opening a new project will clear current unsaved changes. Continue?")) return;
      }
      
      if (isElectron()) {
          try {
             // In Electron, calling loadProject without args triggers the native Open Dialog
             const loadedShapes = await loadProject(); 
             if (loadedShapes) {
                 setShapes(loadedShapes);
                 setHistory([]);
                 setSelectedIds(new Set());
                 setTool(ToolType.SELECT);
             }
          } catch(e) {
              console.error(e);
          }
      } else {
          // Web Fallback: Click the hidden file input
          fileInputRef.current?.click();
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const loadedShapes = await loadProject(file);
          setShapes(loadedShapes);
          setHistory([]); // Reset undo history for new project
          setSelectedIds(new Set());
          setTool(ToolType.SELECT);
          // Clear input so same file can be selected again if needed
          e.target.value = '';
      } catch (err) {
          alert("Failed to load project: " + err);
      }
  };


  // --- Mouse Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEditing) return;
    
    // If Picking Mirror Line, cancel if clicked on empty space
    if (pickingMirrorMode) {
        setPickingMirrorMode(false);
        return;
    }
    
    const pos = getMousePos(e, true);
    
    // Select Tool Logic
    if (tool === ToolType.SELECT) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
             setSelectedIds(new Set());
             setPivotIndex('center'); // Reset pivot
             // Note: We do NOT turn off markingAnglesMode here, allowing user to select another shape to mark
        }
        const rawPos = getMousePos(e, false);
        setSelectionBox({ start: rawPos, current: rawPos });
        setIsDragging(true);
        return;
    }

    // Capture State BEFORE drawing starts
    saveHistory(); 

    // Protractor Tool Logic (Single Click to Spawn)
    if (tool === ToolType.PROTRACTOR) {
        e.preventDefault();
        const id = generateId();
        const width = 300;
        const height = 150;
        // Spawn centered on click
        const p1 = { x: pos.x - width/2, y: pos.y - height };
        const p2 = { x: pos.x + width/2, y: pos.y };
        
        const newShape: Shape = {
            id, 
            type: ShapeType.PROTRACTOR, 
            points: [p1, p2], 
            fill: 'transparent', 
            stroke: currentStyle.stroke, 
            strokeWidth: 1, 
            rotation: 0
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedIds(new Set([id]));
        setPivotIndex(99); // Auto-select the "Vertex" pivot for immediate rotation
        setTool(ToolType.SELECT);
        return;
    }

    // Text Tool Logic
    if (tool === ToolType.TEXT) {
        e.preventDefault(); 
        const id = generateId();
        // Updated: Default font size 16
        const newShape: Shape = {
            id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16,
            fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0
        };
        setShapes(prev => [...prev, newShape]);
        setTextEditing({ id, x: pos.x, y: pos.y, text: '' });
        setSelectedIds(new Set([id]));
        setTool(ToolType.SELECT);
        return;
    }

    // Point-to-Point Line
    if (tool === ToolType.LINE && !activeShapeId) {
        if (!pendingLineStart) {
            setPendingLineStart(pos);
            setDragStartPos(pos);
            setIsDragging(true);
            const id = generateId();
            
            // Auto Label Logic
            let labels: string[] | undefined;
            if (autoLabelMode) labels = ['A', 'B'];

            const newShape: Shape = {
                id, type: ShapeType.LINE, points: [pos, pos],
                labels: labels,
                fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0
            };
            setShapes(prev => [...prev, newShape]);
            setActiveShapeId(id);
            setSelectedIds(new Set([id]));
            return;
        } else {
            const id = generateId();
             // Auto Label Logic
            let labels: string[] | undefined;
            if (autoLabelMode) labels = ['A', 'B'];

            const newShape: Shape = {
                id, type: ShapeType.LINE, points: [pendingLineStart, pos],
                labels: labels,
                fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0
            };
            setShapes(prev => [...prev, newShape]);
            setPendingLineStart(null);
            return;
        }
    }

    // Standard Drawing
    setDragStartPos(pos);
    setIsDragging(true);

    const id = generateId();
    let points: Point[] = [];
    let labels: string[] | undefined = undefined;

    switch (tool) {
      case ToolType.POINT: 
        points = [pos]; 
        if(autoLabelMode) labels = ['A'];
        break;
      case ToolType.RECTANGLE:
      case ToolType.SQUARE:
        points = [pos, pos]; 
        if(autoLabelMode) labels = ['A', 'B', 'C', 'D'];
        break;
      case ToolType.CIRCLE:
      case ToolType.ELLIPSE: points = [pos, pos]; break;
      case ToolType.TRIANGLE: 
        points = [pos, pos, pos]; 
        if(autoLabelMode) labels = ['A', 'B', 'C'];
        break;
      case ToolType.FREEHAND: points = [pos]; break;
      default: points = [pos, pos];
    }

    const newShape: Shape = {
      id,
      type: tool as unknown as ShapeType,
      points,
      labels,
      fill: currentStyle.fill,
      stroke: currentStyle.stroke,
      strokeWidth: currentStyle.strokeWidth,
      strokeType: currentStyle.strokeType,
      rotation: 0
    };

    setShapes((prev) => [...prev, newShape]);
    setActiveShapeId(id);
    setSelectedIds(new Set([id]));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // If Picking Mirror, just update cursor (handled by CSS generally, but we can do highlight logic later)
    if (pickingMirrorMode) return;

    const currentPos = getMousePos(e, !isRotating && tool !== ToolType.SELECT); 
    setCursorPos(currentPos); // Track position for custom tool cursors

    if (selectionBox) {
        setSelectionBox(prev => prev ? ({ ...prev, current: currentPos }) : null);
        return;
    }

    if (tool === ToolType.LINE && pendingLineStart && !isDragging) {
        getMousePos(e, true); 
        return;
    }

    if (!isDragging) {
        if(tool !== ToolType.SELECT) getMousePos(e, true); 
        return;
    }

    if (!dragStartPos) return;

    // Resizing
    if (tool === ToolType.SELECT && dragHandleIndex !== null && selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0];
        updateShapes(new Set([id]), (s) => {
            const newPoints = [...s.points];
            newPoints[dragHandleIndex] = currentPos;
            // FIX: If dragging a handle on a "baked rotation" shape (Triangle), we just update the point.
            // If dragging handle on "Rigid" shape (Rect), the logic here might look weird if rotated,
            // but for Vertex shapes (Triangle) it is now perfect because rotation is 0.
            return { ...s, points: newPoints };
        });
        return;
    }

    // Moving
    if (tool === ToolType.SELECT && dragHandleIndex === null) {
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
             // IMPORTANT: Use updateShapes to ensure markers follow
             updateShapes(new Set([...movingShapeIds, ...connectedPoints.map(c=>c.shapeId)]), (s) => {
                 if (movingShapeIds.has(s.id)) {
                     return { 
                         ...s, 
                         points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) 
                     };
                 }
                 const connections = connectedPoints.filter(cp => cp.shapeId === s.id);
                 if (connections.length > 0) {
                     const newPoints = [...s.points];
                     connections.forEach(conn => {
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
                // Throttle points: only add if distance > 2px to reduce density
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

  const lastRotationMouseAngle = useRef<number>(0);

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
               // Vertex Shapes: Bake rotation into points
               const isVertexShape = [ShapeType.TRIANGLE, ShapeType.LINE, ShapeType.FREEHAND, ShapeType.POINT].includes(s.type);
               
               if (isVertexShape) {
                   const newPoints = s.points.map(p => rotatePoint(p, rotationCenter, delta));
                   // For vertex shapes, we don't change 'rotation' property, we move points.
                   // If pivot was not center, rotationCenter handles it.
                   // If shape had initial rotation, we bake it in handleRotateStart, so s.rotation is 0 here.
                   return { ...s, points: newPoints, rotation: 0 };
               } 
               else {
                   // Rigid Shapes (Rect, Text, etc): Update rotation property
                   let newRotation = (s.rotation + delta) % 360;
                   let newPoints = s.points;
                   
                   // If rotating around a pivot that is NOT center, we also translate the center
                   if (pivotIndex !== 'center') {
                       // Special case for Protractor Pivot (bottom-center)
                       // If pivotIndex is 99 (Protractor Vertex), we need to ensure we calculate the correct center point
                       let pivotPt = rotationCenter; 

                       const oldCenter = getShapeCenter(s.points);
                       const newCenter = rotatePoint(oldCenter, pivotPt, delta);
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


  const handleMouseUp = (e: React.MouseEvent) => {
    setDragContext(null);
    setIsRotating(false);
    setRotationCenter(null);
    setCurrentRotationDisplay(null);

    // --- SMART SKETCH RECOGNITION ---
    if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) {
        const freehandShape = shapes.find(s => s.id === activeShapeId);
        if (freehandShape && freehandShape.points.length > 10) {
            const recognized = recognizeFreehandShape(freehandShape.points);
            
            if (recognized) {
                // Determine labels if Auto Label Mode is ON
                let labels: string[] | undefined;
                if (autoLabelMode) {
                     if (recognized.type === ShapeType.TRIANGLE) labels = ['A', 'B', 'C'];
                     else if (recognized.type === ShapeType.RECTANGLE || recognized.type === ShapeType.SQUARE) labels = ['A', 'B', 'C', 'D'];
                     else if (recognized.type === ShapeType.LINE) labels = ['A', 'B'];
                }

                // Replace the Freehand shape with the recognized geometric shape
                setShapes(prev => prev.map(s => {
                    if (s.id === activeShapeId) {
                        return {
                            ...s,
                            type: recognized.type,
                            points: recognized.points,
                            labels: labels
                        };
                    }
                    return s;
                }));
            }
        }
    }
    // --------------------------------

    if (selectionBox) {
        const r = { start: selectionBox.start, end: selectionBox.current };
        const hits = shapes.filter(s => isShapeInRect(s, r)).map(s => s.id);
        
        setSelectedIds(prev => {
             if (e.ctrlKey || e.metaKey || e.shiftKey) {
                 const next = new Set(prev);
                 hits.forEach(id => next.add(id));
                 return next;
             }
             if (hits.length === 0) setPivotIndex('center'); 
             return new Set(hits);
        });
        setSelectionBox(null);
        setIsDragging(false);
        return;
    }

    if (tool === ToolType.LINE && activeShapeId) {
        const shape = shapes.find(s => s.id === activeShapeId);
        if (shape) {
             const dist = distance(shape.points[0], shape.points[1]);
             if (dist < 5) {
                 setShapes(prev => prev.filter(s => s.id !== activeShapeId));
                 setActiveShapeId(null);
                 setIsDragging(false);
                 return;
             } else {
                 setPendingLineStart(null); 
             }
        }
    }

    setIsDragging(false);
    setDragStartPos(null);
    setDragHandleIndex(null);
    setActiveShapeId(null);
  };

  const handleShapeMouseDown = (e: React.MouseEvent, id: string) => {
      // HANDLE MIRROR PICKING
      if (pickingMirrorMode) {
          e.stopPropagation();
          const target = shapes.find(s => s.id === id);
          if (target && target.type === ShapeType.LINE) {
              handleReflection('line', id);
          } else {
              alert("Please select a LINE shape to act as the mirror axis.");
          }
          return;
      }

      if (tool !== ToolType.SELECT) return;
      e.stopPropagation();
      
      // ALT KEY DUPLICATION
      if (e.altKey) {
          saveHistory();
          let idsToCopy = new Set(selectedIds);
          if (!idsToCopy.has(id)) {
              idsToCopy = new Set([id]);
          }

          const newShapes: Shape[] = [];
          const newSelectedIds = new Set<string>();

          idsToCopy.forEach(sourceId => {
              const sourceShape = shapes.find(s => s.id === sourceId);
              if (sourceShape) {
                  const newId = generateId();
                  newShapes.push({ ...sourceShape, id: newId });
                  newSelectedIds.add(newId);
              }
          });

          const allShapes = [...shapes, ...newShapes];
          setShapes(allShapes);
          setSelectedIds(newSelectedIds);
          
          setDragStartPos(getMousePos(e, true));
          setIsDragging(true);
          
          setDragContext({
              movingShapeIds: newSelectedIds,
              connectedPoints: [] 
          });
          return;
      }
      
      // Normal Selection Logic
      let newSelection = new Set(selectedIds);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (newSelection.has(id)) newSelection.delete(id);
          else newSelection.add(id);
      } else {
          if (!newSelection.has(id)) {
              newSelection = new Set([id]);
              // Reset pivot to center unless it was already set for a specific reason? 
              // Actually, if selecting a Protractor, auto-selecting Vertex Pivot is nice UX.
              const target = shapes.find(s=>s.id === id);
              if (target?.type === ShapeType.PROTRACTOR) {
                  setPivotIndex(99); 
              } else {
                  setPivotIndex('center'); 
              }
          }
      }
      
      saveHistory();

      setSelectedIds(newSelection);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);
      
      const context = calculateDragContext(newSelection);
      setDragContext(context);
  };

  const handleRotateStart = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (selectedIds.size !== 1) return;

      saveHistory(); 
      
      const id = Array.from(selectedIds)[0];
      const shape = shapes.find(s => s.id === id);
      if (!shape) return;

      // BAKING ROTATION PREPARATION
      // For vertex shapes, we want to start rotating 'fresh'.
      // If the shape has existing rotation property, we bake it into points NOW,
      // so that during drag we can rotate purely by point transformation.
      const isVertexShape = [ShapeType.TRIANGLE, ShapeType.LINE, ShapeType.FREEHAND, ShapeType.POINT].includes(shape.type);
      
      let workShape = shape;
      if (isVertexShape && shape.rotation !== 0) {
          const baked = bakeRotation(shape);
          updateShapes(selectedIds, baked);
          workShape = baked;
          setInitialShapeRotation(0);
      } else {
          setInitialShapeRotation(shape.rotation || 0);
      }

      // Calculate Center
      let center: Point;
      if (pivotIndex === 'center') {
          center = getShapeCenter(workShape.points);
      } else if (typeof pivotIndex === 'number') {
          if (isVertexShape) {
              // Points are already baked (world coords), so just pick the point
              center = workShape.points[pivotIndex];
          } else {
              // Rigid Shapes (Rect, Square, Protractor)
              // We need to find where the pivot is in world space.
              if (workShape.type === ShapeType.PROTRACTOR && pivotIndex === 99) {
                  // Special case: Protractor Vertex
                  // The protractor is defined by 2 points (bounding box p1, p2)
                  // The vertex is at the bottom-center of this box, ROTATED by shape.rotation around the box center.
                  
                  // 1. Unrotated Box Coords
                  const xs = workShape.points.map(p=>p.x);
                  const ys = workShape.points.map(p=>p.y);
                  const minX = Math.min(...xs);
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys); // Bottom
                  const midX = (minX + maxX) / 2;
                  
                  const unrotatedVertex = { x: midX, y: maxY };
                  
                  // 2. Apply current rotation
                  const boxCenter = getShapeCenter(workShape.points);
                  center = rotatePoint(unrotatedVertex, boxCenter, workShape.rotation || 0);

              } else {
                  // Standard corners
                  const corners = getRotatedCorners(workShape);
                  if (pivotIndex < corners.length) {
                      center = corners[pivotIndex];
                  } else {
                      center = getShapeCenter(workShape.points);
                  }
              }
          }
      } else {
          center = getShapeCenter(workShape.points);
      }
      
      setRotationCenter(center);
      
      const mousePos = getMousePos(e, false);
      const dx = mousePos.x - center.x;
      const dy = mousePos.y - center.y;
      const startAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      
      setRotationStartAngle(startAngle);
      lastRotationMouseAngle.current = startAngle; 

      setIsRotating(true);
      setIsDragging(false);
  };

  const handleShapeDoubleClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (tool === ToolType.SELECT) {
          const s = shapes.find(sh => sh.id === id);
          if (s && s.type === ShapeType.TEXT) {
              setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
          }
      }
  };

  const handleResizeStart = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      saveHistory(); // Save before resizing
      setDragHandleIndex(index);
      setDragStartPos(getMousePos(e, true));
      setIsDragging(true);
  };

  const handleTriangleAngleChange = (angleIndex: number, valStr: string) => {
      const id = Array.from(selectedIds)[0];
      const shape = shapes.find(s => s.id === id);
      if (!shape || shape.type !== ShapeType.TRIANGLE) return;

      const targetAngle = parseAngle(valStr);
      if (isNaN(targetAngle)) return;

      saveHistory(); 

      // If rotation is baked, we can use points directly.
      // If rotation is NOT baked (from old save), we should bake it first to be safe,
      // but solveTriangleASA returns a new point. We'd need to inverse rotate if we supported prop rotation.
      // Since we are moving to Baked Rotation for triangles, let's bake it now.
      let workingPoints = shape.points;
      if (shape.rotation) {
          const baked = bakeRotation(shape);
          workingPoints = baked.points;
      }

      let fixedVertexIdx = -1;
      if (lastEditedVertexIdx !== null && lastEditedVertexIdx !== angleIndex) {
          fixedVertexIdx = lastEditedVertexIdx;
      } else {
          fixedVertexIdx = (angleIndex + 1) % 3;
      }
      
      const idxA = angleIndex; 
      const idxB = fixedVertexIdx; 
      const idxC = [0,1,2].find(i => i !== idxA && i !== idxB)!;
      const pA = workingPoints[idxA];
      const pB = workingPoints[idxB];
      const pC = workingPoints[idxC]; 
      
      const currentAngles = calculateTriangleAngles(workingPoints);
      const angleB = Object.values(currentAngles)[idxB];
      
      const newPointC = solveTriangleASA(pA, pB, targetAngle, angleB, pC);

      const newPoints = [...workingPoints];
      newPoints[idxC] = newPointC;
      updateShapes(selectedIds, { points: newPoints, rotation: 0 }); // Reset rotation to 0 as it is baked
      setLastEditedVertexIdx(angleIndex);
  };

  const commitText = () => {
      if (!textEditing) return;
      saveHistory(); // Save before text commit
      if (textEditing.text.trim() === '') {
          setShapes(prev => prev.filter(s => s.id !== textEditing.id));
      } else {
          updateShapes(new Set([textEditing.id]), { text: textEditing.text });
      }
      setTextEditing(null);
  };

  const handleExport = (format: 'png' | 'jpeg') => {
      if (svgRef.current) {
          const prevSelection = new Set(selectedIds);
          setSelectedIds(new Set());
          setSnapIndicator(null);
          setPendingLineStart(null);
          setCursorPos(null);
          setTimeout(() => {
            if(svgRef.current) exportCanvas(svgRef.current, format, 'geodraw-export');
            setSelectedIds(prevSelection);
          }, 50);
      }
  };
  
  const generateAppIcon = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        ctx.clearRect(0,0,1024,1024);
        ctx.drawImage(img, 0, 0, 1024, 1024);
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'icon.png';
        link.href = url;
        link.click();
    };
    img.src = '/icon.svg';
  };

  const updateSelectedStyle = (key: keyof typeof currentStyle | 'fontSize', value: any) => {
      // If it's fontSize, we don't store it in currentStyle global preference, only on shape
    if (key === 'fontSize') {
         if (selectedIds.size > 0) {
            saveHistory();
            updateShapes(selectedIds, { fontSize: value });
         }
         return;
    }
    
    setCurrentStyle(prev => ({ ...prev, [key]: value }));
    if (selectedIds.size > 0) {
        saveHistory();
        updateShapes(selectedIds, { [key]: value });
    }
  };

  const getCommonFontSize = () => {
      if (selectedIds.size === 0) return 16;
      const s = shapes.find(x => x.id === Array.from(selectedIds)[0]);
      return s?.fontSize || 16;
  };

  const showSmoothButton = selectedIds.size > 0 && Array.from(selectedIds).every(id => shapes.find(s => s.id === id)?.type === ShapeType.FREEHAND);
  const showSymbolPanel = textEditing !== null || (selectedIds.size === 1 && shapes.find(s => s.id === Array.from(selectedIds)[0])?.type === ShapeType.TEXT);

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50 text-slate-800 font-sans">
      <input 
        type="file" 
        accept=".geo,.json" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
           <div className="bg-brand-600 p-1.5 rounded-lg text-white"><Settings2 size={20} /></div>
           <h1 className="font-bold text-lg text-slate-700">GeoDraw Pro</h1>
        </div>
        <div className="flex items-center gap-3">
             <button onClick={handleOpenProjectClick} className="btn-secondary text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" title="Open Project (Ctrl+O)">
               <FolderOpen size={16} /> Open
             </button>

             <button onClick={handleSaveProject} className="btn-secondary text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2" title="Save Project (Ctrl+S)">
               <Save size={16} /> Save
             </button>

             <div className="h-6 w-px bg-gray-300 mx-1"></div>

             <button onClick={undo} className="btn-secondary text-slate-600 hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2" disabled={history.length === 0} title="Undo (Ctrl+Z)">
               <Undo size={16} /> Undo
             </button>
             
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             
             <button 
                onClick={deleteSelected} 
                disabled={selectedIds.size === 0}
                className="btn-secondary text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-50 hover:text-red-600 flex items-center justify-center gap-2"
                title="Delete Selected (Delete/Backspace)"
             >
                <Trash2 size={16} /> Delete
             </button>

             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             
             <button 
                onClick={clearCanvas} 
                disabled={shapes.length === 0}
                className="btn-secondary text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:bg-transparent disabled:text-gray-400 flex items-center justify-center gap-2"
                title="Clear All Canvas"
             >
               <Eraser size={16} /> Clear All
             </button>
             
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={() => handleExport('png')} className="btn-primary bg-brand-600 text-white hover:bg-brand-700 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md">
                <Download size={16} /> Export
             </button>
             
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             <button onClick={generateAppIcon} className="btn-secondary text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-2" title="Generate High-Res Icon PNG">
                <ImageIcon size={16} /> Icon
             </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-1 z-10 shadow-sm shrink-0 overflow-y-auto">
            {TOOL_CONFIG.map((t) => (
                <button
                    key={t.id}
                    title={t.label}
                    onClick={() => handleToolChange(t.id)}
                    className={`p-2 rounded-lg transition-all ${tool === t.id ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-500' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    <t.icon size={20} />
                </button>
            ))}
            
            <div className="w-10 h-px bg-gray-200 my-1"></div>
            
             <button
                title={`Smart Labeling: ${autoLabelMode ? 'ON' : 'OFF'}`}
                onClick={() => setAutoLabelMode(!autoLabelMode)}
                className={`p-2 rounded-lg transition-all ${autoLabelMode ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-500' : 'text-gray-400 hover:bg-gray-100'}`}
            >
                <CaseUpper size={20} />
            </button>
             <button
                title={`Smart Sketching: ${smartSketchMode ? 'ON' : 'OFF'} (Draw Freehand to auto-convert)`}
                onClick={() => setSmartSketchMode(!smartSketchMode)}
                className={`p-2 rounded-lg transition-all ${smartSketchMode ? 'bg-amber-50 text-amber-600 ring-2 ring-amber-500' : 'text-gray-400 hover:bg-gray-100'}`}
            >
                <Sparkles size={20} />
            </button>
        </aside>

        <main 
            className={`flex-1 relative bg-gray-100 overflow-hidden ${pickingMirrorMode ? 'cursor-crosshair' : ''} ${markingAnglesMode ? 'cursor-copy' : ''} ${tool === ToolType.FREEHAND ? 'cursor-none' : ''}`}
        >
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                className={`block touch-none ${tool === ToolType.FREEHAND ? 'cursor-none' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMoveWithRotation}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp({} as any); setCursorPos(null); }}
            >
                <rect width="100%" height="100%" fill="white" />
                <AxisLayer config={axisConfig} width={canvasSize.width} height={canvasSize.height} />

                {shapes.map((shape) => (
                    <g 
                        key={shape.id} 
                        onMouseDown={(e) => handleShapeMouseDown(e, shape.id)}
                        onDoubleClick={(e) => handleShapeDoubleClick(e, shape.id)}
                        opacity={pickingMirrorMode && shape.type !== ShapeType.LINE ? 0.3 : 1}
                        style={{ 
                            cursor: pickingMirrorMode 
                                ? (shape.type === ShapeType.LINE ? 'pointer' : 'not-allowed')
                                : (selectedIds.has(shape.id) ? 'move' : (tool === ToolType.FREEHAND ? 'none' : 'pointer'))
                        }}
                    >
                        <ShapeRenderer shape={shape} isSelected={selectedIds.has(shape.id)} />
                    </g>
                ))}

                {Array.from(selectedIds).map(id => {
                    const s = shapes.find(sh => sh.id === id);
                    if (!s || (s.type === ShapeType.TEXT && tool !== ToolType.SELECT)) return null; 
                    if (pickingMirrorMode) return null;
                    // Do not show resize handles for Markers
                    if (s.type === ShapeType.MARKER) return null; 

                    return (
                        <SelectionOverlay 
                            key={id} 
                            shape={s} 
                            isSelected={true}
                            pivotIndex={pivotIndex}
                            isAltPressed={isAltPressed}
                            isMarkingAngles={markingAnglesMode}
                            onResizeStart={handleResizeStart} 
                            onAngleChange={handleTriangleAngleChange}
                            onRotateStart={handleRotateStart}
                            onSetPivot={setPivotIndex}
                            onMarkAngle={(idx) => handleCornerClick(s.id, idx)}
                        />
                    );
                })}

                {selectionBox && (
                    <rect 
                        x={Math.min(selectionBox.start.x, selectionBox.current.x)}
                        y={Math.min(selectionBox.start.y, selectionBox.current.y)}
                        width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
                        height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
                        fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeDasharray="4"
                    />
                )}

                {tool === ToolType.LINE && pendingLineStart && !isDragging && snapIndicator && (
                    <line 
                        x1={pendingLineStart.x} y1={pendingLineStart.y}
                        x2={snapIndicator.x} y2={snapIndicator.y}
                        stroke="#94a3b8" strokeWidth={1} strokeDasharray="4"
                    />
                )}

                {/* Snapping Indicator (Red Circle) - Disabled for Freehand now */}
                {snapIndicator && (
                    <circle cx={snapIndicator.x} cy={snapIndicator.y} r={6} fill="none" stroke="#ef4444" strokeWidth={2} className="pointer-events-none" />
                )}

                {/* Custom Brush Cursor for Freehand */}
                {tool === ToolType.FREEHAND && cursorPos && (
                    <circle 
                        cx={cursorPos.x} 
                        cy={cursorPos.y} 
                        r={1.5} 
                        fill={currentStyle.stroke}
                        className="pointer-events-none"
                    />
                )}
            </svg>

            {pickingMirrorMode && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse font-medium">
                    Select a LINE on the canvas to mirror across
                </div>
            )}
            
            {markingAnglesMode && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse font-medium">
                    Click a corner to mark the angle
                </div>
            )}

            {isRotating && currentRotationDisplay !== null && rotationCenter && (
                 <div 
                    style={{ 
                        position: 'absolute', 
                        left: `${rotationCenter.x}px`, 
                        top: `${rotationCenter.y - 60}px`,
                        transform: 'translateX(-50%)'
                    }}
                    className="z-50 pointer-events-none bg-black/75 text-white px-2 py-1 rounded text-xs font-mono"
                 >
                    {currentRotationDisplay}°
                 </div>
            )}

            {textEditing && (
                <div 
                    style={{ 
                        position: 'absolute', 
                        left: `${textEditing.x}px`, 
                        top: `${textEditing.y}px`, 
                        transform: 'translate(0, -50%)' 
                    }}
                    className="z-50 pointer-events-auto"
                >
                    <input
                        ref={inputRef}
                        value={textEditing.text}
                        onChange={(e) => setTextEditing(prev => prev ? ({ ...prev, text: e.target.value }) : null)}
                        onBlur={commitText}
                        onKeyDown={(e) => { if(e.key === 'Enter') commitText(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border border-brand-500 rounded px-1 py-0.5 font-sans text-brand-900 outline-none shadow-lg min-w-[50px] shadow-sm bg-white/50 backdrop-blur-sm"
                        style={{ 
                            color: shapes.find(s=>s.id === textEditing.id)?.stroke || 'black',
                            fontSize: `${shapes.find(s=>s.id === textEditing.id)?.fontSize || 16}px`
                        }}
                    />
                </div>
            )}

            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-500 pointer-events-none select-none flex items-center gap-2">
                 <Magnet size={12} className={snapIndicator ? "text-red-500" : "text-gray-400"} />
                 {tool === ToolType.SELECT 
                    ? (isAltPressed ? 'Alt held: Drag to copy. Click orange points for Pivot.' : 'Click to select. Drag to move. Alt+Drag to copy.')
                    : (tool === ToolType.FREEHAND ? 'Drag to sketch. Snapping disabled.' : 'Drag to draw. Snapping active.')}
                 
                 <div className="w-px h-3 bg-gray-300 mx-1"></div>
                 
                 <CaseUpper size={12} className={autoLabelMode ? "text-indigo-500" : "text-gray-400"} />
                 {autoLabelMode ? "Auto Label ON" : "Auto Label OFF"}
                 
                 <div className="w-px h-3 bg-gray-300 mx-1"></div>
                 
                 <Sparkles size={12} className={smartSketchMode ? "text-amber-500" : "text-gray-400"} />
                 {smartSketchMode ? "Smart Sketch ON" : "Smart Sketch OFF"}
            </div>
        </main>

        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col z-10 shadow-sm overflow-y-auto shrink-0">
             <div className="p-5 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Grid3X3 size={16} /> Coordinate System</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span>Show Axes</span>
                        <input type="checkbox" checked={axisConfig.visible} onChange={() => setAxisConfig(p => ({...p, visible: !p.visible}))} className="accent-brand-600" />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                         <span>Ticks: {axisConfig.ticks}</span>
                         <input type="range" min="1" max="20" value={axisConfig.ticks} onChange={(e) => setAxisConfig(p => ({...p, ticks: Number(e.target.value)}))} className="flex-1 accent-brand-600 h-1" />
                    </div>
                </div>
             </div>
             
             {/* Operations / Symmetry Section - Always Visible */}
             {!pickingMirrorMode && (
                 <div className={`p-5 border-b border-gray-100 bg-slate-50 transition-all ${selectedIds.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Spline size={16} /> Operations</h3>
                    <div className="grid grid-cols-4 gap-2">
                        <button 
                            onClick={() => handleReflection('y')}
                            className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-500 text-gray-600 hover:text-brand-600 transition-colors"
                            title="Flip Vertical (Mirror across Y-axis)"
                        >
                            <FlipVertical size={20} className="mb-1" />
                            <span className="text-[10px]">Flip V</span>
                        </button>
                        <button 
                            onClick={() => handleReflection('x')}
                            className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-500 text-gray-600 hover:text-brand-600 transition-colors"
                            title="Flip Horizontal (Mirror across X-axis)"
                        >
                            <FlipHorizontal size={20} className="mb-1" />
                            <span className="text-[10px]">Flip H</span>
                        </button>
                        <button 
                            onClick={() => setPickingMirrorMode(true)}
                            className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-500 text-gray-600 hover:text-brand-600 transition-colors"
                            title="Mirror across a Line you select on canvas"
                        >
                            <div className="relative">
                                <FlipHorizontal size={20} className="mb-1" />
                                <div className="absolute -right-1 -bottom-1 text-[10px] bg-brand-100 px-0.5 rounded border border-brand-200">/</div>
                            </div>
                            <span className="text-[10px]">Mirror /</span>
                        </button>

                         {/* Mark Angles Toggle */}
                         <button 
                            onClick={toggleMarkAnglesMode}
                            className={`flex flex-col items-center justify-center p-2 border rounded transition-colors ${markingAnglesMode ? 'bg-brand-100 border-brand-500 text-brand-700' : 'bg-white border-gray-200 hover:bg-brand-50 hover:border-brand-500 text-gray-600 hover:text-brand-600'}`}
                            title="Mark Angles (Click corners to add arcs)"
                        >
                            <Radius size={20} className="mb-1" />
                            <span className="text-[10px]">Angles</span>
                        </button>

                        {/* SMOOTH ARC BUTTON (For Freehand Shapes) */}
                        {showSmoothButton && (
                            <button 
                                onClick={handleSmoothCurve}
                                className="flex flex-col col-span-4 items-center justify-center p-2 mt-2 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100 hover:border-brand-400 text-brand-700 transition-colors"
                                title="Convert rough sketch to smooth arc"
                            >
                                <div className="flex items-center gap-2">
                                    <Wand2 size={16} />
                                    <span className="text-xs font-semibold">Smooth Arc</span>
                                </div>
                            </button>
                        )}
                        
                        {/* SMART MARKERS TOOLBAR */}
                        <div className="col-span-4 mt-2 pt-2 border-t border-gray-200">
                             <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Smart Marks</h4>
                             <div className="grid grid-cols-3 gap-2">
                                 <button 
                                    onClick={() => handleAddMarker('perpendicular')}
                                    className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-red-50 hover:border-red-400 text-gray-600 hover:text-red-600 transition-colors"
                                    title="Mark 90° Angle (Select corner or lines)"
                                 >
                                    <CornerRightUp size={16} />
                                    <span className="text-[9px] mt-0.5">90°</span>
                                 </button>
                                 <button 
                                    onClick={() => handleAddMarker('parallel_arrow')}
                                    className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-red-50 hover:border-red-400 text-gray-600 hover:text-red-600 transition-colors"
                                    title="Parallel Arrow (Click repeatedly to cycle edges)"
                                 >
                                    <ArrowRight size={16} />
                                    <span className="text-[9px] mt-0.5">Arrow</span>
                                 </button>
                                 <button 
                                    onClick={() => handleAddMarker('equal_tick')}
                                    className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded hover:bg-red-50 hover:border-red-400 text-gray-600 hover:text-red-600 transition-colors"
                                    title="Equal Length Tick (Click repeatedly to cycle edges)"
                                 >
                                    <Hash size={16} className="rotate-90" />
                                    <span className="text-[9px] mt-0.5">Tick</span>
                                 </button>
                             </div>
                        </div>

                    </div>
                 </div>
             )}

             {/* Style Properties */}
             <div className="p-5 space-y-5">
                 
                {/* Math Symbols Panel */}
                {showSymbolPanel && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
                            <Calculator size={12}/> Math Symbols
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                            {MATH_SYMBOLS.map(sym => (
                                <button
                                    key={sym}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSymbolClick(sym)}
                                    className="h-8 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 transition-colors font-serif"
                                >
                                    {sym}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Stroke Color</label>
                    <div className="flex flex-wrap gap-2">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => updateSelectedStyle('stroke', c)}
                                className={`w-6 h-6 rounded-full border border-gray-200 shadow-sm ${currentStyle.stroke === c ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
                                style={{ backgroundColor: c === 'transparent' ? 'white' : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none', backgroundSize: '4px 4px' }}
                                title={c}
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Fill Color</label>
                    <div className="flex flex-wrap gap-2">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => updateSelectedStyle('fill', c)}
                                className={`w-6 h-6 rounded-full border border-gray-200 shadow-sm ${currentStyle.fill === c ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
                                style={{ backgroundColor: c === 'transparent' ? 'white' : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none', backgroundSize: '4px 4px' }}
                                title={c}
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Stroke Width</label>
                    <div className="flex items-center gap-3">
                        <Minus size={16} className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => updateSelectedStyle('strokeWidth', Math.max(1, currentStyle.strokeWidth - 1))} />
                        <input 
                            type="range" 
                            min="1" max="20" 
                            value={currentStyle.strokeWidth} 
                            onChange={(e) => updateSelectedStyle('strokeWidth', Number(e.target.value))}
                            className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <Plus size={16} className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => updateSelectedStyle('strokeWidth', currentStyle.strokeWidth + 1)} />
                        <span className="text-sm w-6 text-center">{currentStyle.strokeWidth}</span>
                    </div>
                </div>

                {/* Font Size Slider - Show only for Text items or if multiple items selected containing text? Let's show if Text is selected */}
                {selectedIds.size > 0 && shapes.find(s => selectedIds.has(s.id) && s.type === ShapeType.TEXT) && (
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
                            <Type size={12}/> Font Size
                        </label>
                        <div className="flex items-center gap-3">
                            <Minus size={16} className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => updateSelectedStyle('fontSize', Math.max(8, getCommonFontSize() - 2))} />
                            <input 
                                type="range" 
                                min="8" max="72" step="2"
                                value={getCommonFontSize()} 
                                onChange={(e) => updateSelectedStyle('fontSize', Number(e.target.value))}
                                className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                            />
                            <Plus size={16} className="text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => updateSelectedStyle('fontSize', getCommonFontSize() + 2)} />
                            <span className="text-sm w-6 text-center">{getCommonFontSize()}</span>
                        </div>
                    </div>
                )}

                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Line Style</label>
                    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                        {(['solid', 'dashed', 'dotted'] as const).map((t) => (
                             <button
                                key={t}
                                onClick={() => updateSelectedStyle('strokeType', t)}
                                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${currentStyle.strokeType === t ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:bg-gray-200'}`}
                             >
                                 {t}
                             </button>
                        ))}
                    </div>
                </div>
                
                {selectedIds.size === 1 && (
                     <div>
                         <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Info</label>
                         <div className="text-xs text-gray-500 space-y-1">
                             <div className="flex justify-between">
                                 <span>Rotation:</span>
                                 <span>{Math.round(shapes.find(s => s.id === Array.from(selectedIds)[0])?.rotation || 0)}°</span>
                             </div>
                             <div className="flex justify-between">
                                 <span>ID:</span>
                                 <span className="font-mono">{Array.from(selectedIds)[0].substr(0,6)}...</span>
                             </div>
                         </div>
                     </div>
                )}
             </div>
        </aside>
      </div>
    </div>
  );
}
