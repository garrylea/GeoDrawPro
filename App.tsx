import React, { useState, useRef, useEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { exportCanvas } from './utils/exportUtils';
import { getSnapPoint, calculateTriangleAngles, parseAngle, solveTriangleASA, getShapeSize, distance, isShapeInRect, getDetailedSnapPoints, getShapeCenter, getRotatedCorners, rotatePoint, bakeRotation, reflectPointAcrossLine, getAngleDegrees } from './utils/mathUtils';
import { Download, Trash2, Settings2, Grid3X3, Minus, Plus, Magnet, RotateCw, FlipHorizontal, FlipVertical, Spline, Undo, Eraser, MoreHorizontal, Image as ImageIcon } from 'lucide-react';

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
  
  // Rotation State
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [initialShapeRotation, setInitialShapeRotation] = useState(0);
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [currentRotationDisplay, setCurrentRotationDisplay] = useState<number | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Reflection/Operation State
  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);

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
      setShapes(prev => prev.filter(s => !selectedIds.has(s.id)));
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

          // Undo Shortcut (Ctrl+Z or Cmd+Z)
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              undo();
              return;
          }

          if (e.key === 'Escape') {
              // 1. Cancel Mirror Mode
              if (pickingMirrorMode) {
                  setPickingMirrorMode(false);
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
  }, [selectedIds, textEditing, shapes, history, activeShapeId, pickingMirrorMode, pendingLineStart, tool]); 

  const getMousePos = (e: React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const raw = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    
    // Freehand doesn't snap while drawing usually
    if (tool === ToolType.FREEHAND && isDragging) {
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
    setSelectionBox(null);
    setPendingLineStart(null);
    setTextEditing(null);
    setPivotIndex('center'); // Reset pivot logic on tool change
    setPickingMirrorMode(false);
  };

  const updateShapes = (ids: Set<string>, updates: Partial<Shape> | ((s: Shape) => Shape)) => {
    setShapes(prev => prev.map(s => {
        if (!ids.has(s.id)) return s;
        if (typeof updates === 'function') return updates(s);
        return { ...s, ...updates };
    }));
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
          // Horizontal axis at centerY.
          mirrorLine = { p1: {x: 0, y: centerY}, p2: {x: canvasSize.width, y: centerY} };
          axisAngle = 0;
      } else if (axis === 'y') {
           // Vertical axis at centerX.
           mirrorLine = { p1: {x: centerX, y: 0}, p2: {x: centerX, y: canvasSize.height} };
           axisAngle = 90;
      } else if (axis === 'line' && lineId) {
          const lineShape = shapes.find(s => s.id === lineId);
          if (lineShape && (lineShape.type === ShapeType.LINE || lineShape.points.length >= 2)) {
              const corners = getRotatedCorners(lineShape);
              // Use rotated corners to define the line
              mirrorLine = { p1: corners[0], p2: corners[1] };
              axisAngle = getAngleDegrees(corners[0], corners[1]);
          } else {
              return;
          }
      }

      if (!mirrorLine) return;

      setShapes(prev => prev.map(s => {
          if (!selectedIds.has(s.id)) return s;

          // Box-like shapes (Rect, Square, Circle, Ellipse) and Text are treated as "Rigid Bodies" for reflection
          // This preserves their "Shape Definition" (e.g. axis aligned box + rotation).
          // If we baked rotation, they would turn into Polygons, which breaks the ShapeRenderer logic for these types.
          const isRigid = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TEXT].includes(s.type);

          if (isRigid) {
              // 1. Reflect Center
              const currentCenter = getShapeCenter(s.points);
              const newCenter = reflectPointAcrossLine(currentCenter, mirrorLine!.p1, mirrorLine!.p2);
              const shift = { x: newCenter.x - currentCenter.x, y: newCenter.y - currentCenter.y };

              // 2. Move Points (translate the unrotated box points)
              const newPoints = s.points.map(p => ({ x: p.x + shift.x, y: p.y + shift.y }));

              // 3. Update Rotation
              // theta' = 2*phi - theta
              const oldRot = s.rotation || 0;
              let newRot = 2 * axisAngle - oldRot;
              
              // Normalize to 0-360
              newRot = newRot % 360; 
              if (newRot < 0) newRot += 360;

              return { ...s, points: newPoints, rotation: newRot };

          } else {
              // Vertex Reflection (Triangle, Line, Point)
              // These shapes are drawn by connecting vertices, so we can bake rotation and reflect vertices directly.
              // This allows Triangles to "flip" (change winding order), which is physically correct.
              
              // 1. Bake current rotation into absolute points
              const baked = bakeRotation(s);
              
              // 2. Reflect all points
              const newPoints = baked.points.map(p => {
                  return reflectPointAcrossLine(p, mirrorLine!.p1, mirrorLine!.p2);
              });

              // 3. Reset rotation to 0 (since rotation is now baked into the reflected points)
              return { ...baked, points: newPoints, rotation: 0 };
          }
      }));

      setPickingMirrorMode(false);
  };

  const calculateDragContext = (initialSelection: Set<string>) => {
      const movingIds = new Set(initialSelection);
      const queue = Array.from(initialSelection);
      const visited = new Set(initialSelection);

      while(queue.length > 0) {
          const currentId = queue.shift()!;
          const leader = shapes.find(s => s.id === currentId);
          if (!leader) continue;
          
          const leaderSize = getShapeSize(leader);
          const leaderSnapPoints = getDetailedSnapPoints(leader);

          shapes.forEach(follower => {
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
      const allMovingShapes = shapes.filter(s => movingIds.has(s.id));
      const groupSnapPoints = allMovingShapes.flatMap(s => getDetailedSnapPoints(s));

      shapes.forEach(shape => {
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
        }
        const rawPos = getMousePos(e, false);
        setSelectionBox({ start: rawPos, current: rawPos });
        setIsDragging(true);
        return;
    }

    // Capture State BEFORE drawing starts
    saveHistory(); 

    // Text Tool Logic
    if (tool === ToolType.TEXT) {
        e.preventDefault(); 
        const id = generateId();
        const newShape: Shape = {
            id, type: ShapeType.TEXT, points: [pos], text: '', 
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
            const newShape: Shape = {
                id, type: ShapeType.LINE, points: [pos, pos],
                fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0
            };
            setShapes(prev => [...prev, newShape]);
            setActiveShapeId(id);
            setSelectedIds(new Set([id]));
            return;
        } else {
            const id = generateId();
            const newShape: Shape = {
                id, type: ShapeType.LINE, points: [pendingLineStart, pos],
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
    switch (tool) {
      case ToolType.POINT: points = [pos]; break;
      case ToolType.RECTANGLE:
      case ToolType.SQUARE:
      case ToolType.CIRCLE:
      case ToolType.ELLIPSE: points = [pos, pos]; break;
      case ToolType.TRIANGLE: points = [pos, pos, pos]; break;
      case ToolType.FREEHAND: points = [pos]; break;
      default: points = [pos, pos];
    }

    const newShape: Shape = {
      id,
      type: tool as unknown as ShapeType,
      points,
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

    if (selectionBox) {
        setSelectionBox(prev => prev ? ({ ...prev, current: currentPos }) : null);
        return;
    }

    if (tool === ToolType.LINE && pendingLineStart && !isDragging) {
        getMousePos(e, true); 
        return;
    }

    // --- ROTATING ---
    if (isRotating && rotationCenter && selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0];
        
        // Calculate angle from Pivot
        const dx = currentPos.x - rotationCenter.x;
        const dy = currentPos.y - rotationCenter.y;
        
        // New Absolute Angle of Mouse
        let currentMouseAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        
        let angleDelta = currentMouseAngle - rotationStartAngle;
        let newRotation = (initialShapeRotation + angleDelta) % 360;
        
        if (e.shiftKey) {
            newRotation = Math.round(newRotation / 15) * 15;
            angleDelta = newRotation - initialShapeRotation;
        }

        setCurrentRotationDisplay(Math.round(newRotation));

        updateShapes(new Set([id]), (s) => {
            if (pivotIndex === 'center') {
                return { ...s, rotation: newRotation };
            }
            return s; // Fallback handled by handleMouseMoveWithRotation
        });
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
             setShapes(prev => prev.map(s => {
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
             }));
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
      
      if (isRotating && rotationCenter && selectedIds.size === 1) {
          const dx = currentPos.x - rotationCenter.x;
          const dy = currentPos.y - rotationCenter.y;
          const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
          
          const delta = currentAngle - lastRotationMouseAngle.current;
          lastRotationMouseAngle.current = currentAngle; 
          
          const id = Array.from(selectedIds)[0];
          
          updateShapes(new Set([id]), (s) => {
               let newRotation = (s.rotation + delta) % 360;
               let newPoints = s.points;
               if (pivotIndex !== 'center') {
                   const oldCenter = getShapeCenter(s.points);
                   const newCenter = rotatePoint(oldCenter, rotationCenter, delta);
                   const shiftX = newCenter.x - oldCenter.x;
                   const shiftY = newCenter.y - oldCenter.y;
                   newPoints = s.points.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));
               }
               setCurrentRotationDisplay(Math.round(newRotation));
               return { ...s, rotation: newRotation, points: newPoints };
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
      
      let newSelection = new Set(selectedIds);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (newSelection.has(id)) newSelection.delete(id);
          else newSelection.add(id);
      } else {
          if (!newSelection.has(id)) {
              newSelection = new Set([id]);
              setPivotIndex('center'); 
          }
      }
      
      // Save history if we are about to start dragging/moving an existing selection
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

      saveHistory(); // Save before rotation starts
      
      const id = Array.from(selectedIds)[0];
      const shape = shapes.find(s => s.id === id);
      if (!shape) return;

      let center: Point;
      if (pivotIndex === 'center') {
          center = getShapeCenter(shape.points);
      } else if (typeof pivotIndex === 'number') {
          // Fix: For vertex-based shapes (Triangle, Line), the pivot index maps to the point index
          if (shape.type === ShapeType.TRIANGLE || shape.type === ShapeType.LINE) {
              const shapeCenter = getShapeCenter(shape.points);
              const vertex = shape.points[pivotIndex];
              // Use current shape rotation to transform the vertex to world space
              center = rotatePoint(vertex, shapeCenter, shape.rotation || 0);
          } else {
              // For box-based shapes, map pivot index to bounding box corners
              const corners = getRotatedCorners(shape);
              if (pivotIndex < corners.length) {
                  center = corners[pivotIndex];
              } else {
                  center = getShapeCenter(shape.points);
              }
          }
      } else {
          center = getShapeCenter(shape.points);
      }
      
      setRotationCenter(center);
      setInitialShapeRotation(shape.rotation || 0);
      
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

      saveHistory(); // Save before angle change

      let fixedVertexIdx = -1;
      if (lastEditedVertexIdx !== null && lastEditedVertexIdx !== angleIndex) {
          fixedVertexIdx = lastEditedVertexIdx;
      } else {
          fixedVertexIdx = (angleIndex + 1) % 3;
      }
      
      const idxA = angleIndex; 
      const idxB = fixedVertexIdx; 
      const idxC = [0,1,2].find(i => i !== idxA && i !== idxB)!;
      const pA = shape.points[idxA];
      const pB = shape.points[idxB];
      const pC = shape.points[idxC]; 
      
      const currentAngles = calculateTriangleAngles(shape.points);
      const angleB = Object.values(currentAngles)[idxB];
      
      const newPointC = solveTriangleASA(pA, pB, targetAngle, angleB, pC);

      const newPoints = [...shape.points];
      newPoints[idxC] = newPointC;
      updateShapes(selectedIds, { points: newPoints });
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
          setTimeout(() => {
            if(svgRef.current) exportCanvas(svgRef.current, format, 'geodraw-export');
            setSelectedIds(prevSelection);
          }, 50);
      }
  };
  
  // Developer Utility: Generate High Res Icon from SVG
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

  const updateSelectedStyle = (key: keyof typeof currentStyle, value: any) => {
    // 1. Update global current style
    setCurrentStyle(prev => ({ ...prev, [key]: value }));

    // 2. If items selected, apply style immediately
    if (selectedIds.size > 0) {
        saveHistory();
        updateShapes(selectedIds, { [key]: value });
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50 text-slate-800 font-sans">
      
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
           <div className="bg-brand-600 p-1.5 rounded-lg text-white"><Settings2 size={20} /></div>
           <h1 className="font-bold text-lg text-slate-700">GeoDraw Pro</h1>
        </div>
        <div className="flex items-center gap-3">
             <button onClick={undo} className="btn-secondary text-slate-600 hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2" disabled={history.length === 0} title="Undo (Ctrl+Z)">
               <Undo size={16} /> Undo
             </button>
             
             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             
             {/* Delete Selected Button */}
             <button 
                onClick={deleteSelected} 
                disabled={selectedIds.size === 0}
                className="btn-secondary text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-50 hover:text-red-600 flex items-center justify-center gap-2"
                title="Delete Selected (Delete/Backspace)"
             >
                <Trash2 size={16} /> Delete
             </button>

             <div className="h-6 w-px bg-gray-300 mx-1"></div>
             
             {/* Clear All Button */}
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
             {/* Developer Icon Generation Button */}
             <button onClick={generateAppIcon} className="btn-secondary text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-2" title="Generate High-Res Icon PNG">
                <ImageIcon size={16} /> Icon
             </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-3 z-10 shadow-sm shrink-0">
            {TOOL_CONFIG.map((t) => (
                <button
                    key={t.id}
                    title={t.label}
                    onClick={() => handleToolChange(t.id)}
                    className={`p-3 rounded-xl transition-all ${tool === t.id ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-500' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    <t.icon size={24} />
                </button>
            ))}
        </aside>

        <main 
            className={`flex-1 relative bg-gray-100 overflow-hidden ${pickingMirrorMode ? 'cursor-crosshair' : 'cursor-default'}`}
        >
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                className="block touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMoveWithRotation}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <rect width="100%" height="100%" fill="white" />
                {/* 
                  AxisLayer now receives the width/height of the SVG container (main area), 
                  not the window width. This centers the axes in the visible white space. 
                */}
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
                                : (selectedIds.has(shape.id) ? 'move' : 'pointer')
                        }}
                    >
                        <ShapeRenderer shape={shape} isSelected={selectedIds.has(shape.id)} />
                    </g>
                ))}

                {Array.from(selectedIds).map(id => {
                    const s = shapes.find(sh => sh.id === id);
                    if (!s || s.type === ShapeType.TEXT) return null; 
                    // Hide overlay if we are picking a mirror line
                    if (pickingMirrorMode) return null;

                    return (
                        <SelectionOverlay 
                            key={id} 
                            shape={s} 
                            isSelected={true}
                            pivotIndex={pivotIndex}
                            isAltPressed={isAltPressed}
                            onResizeStart={handleResizeStart} 
                            onAngleChange={handleTriangleAngleChange}
                            onRotateStart={handleRotateStart}
                            onSetPivot={setPivotIndex}
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

                {snapIndicator && (
                    <circle cx={snapIndicator.x} cy={snapIndicator.y} r={6} fill="none" stroke="#ef4444" strokeWidth={2} className="pointer-events-none" />
                )}
            </svg>

            {/* Picking Mirror Mode Banner */}
            {pickingMirrorMode && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse font-medium">
                    Select a LINE on the canvas to mirror across
                </div>
            )}

            {/* Rotation Angle Display */}
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

            {/* Text Input Overlay */}
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
                        className="bg-transparent border border-brand-500 rounded px-1 py-0.5 text-xl font-sans text-brand-900 outline-none shadow-lg min-w-[50px] shadow-sm bg-white/50 backdrop-blur-sm"
                        style={{ color: shapes.find(s=>s.id === textEditing.id)?.stroke || 'black' }}
                    />
                </div>
            )}

            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-500 pointer-events-none select-none flex items-center gap-2">
                 <Magnet size={12} className={snapIndicator ? "text-red-500" : "text-gray-400"} />
                 {tool === ToolType.SELECT 
                    ? (isAltPressed ? 'Alt held: Click orange points to set Rotation Pivot.' : 'Click to select. Drag corner to resize. Hold Alt to change Rotation Pivot.')
                    : 'Drag to draw. Snapping active.'}
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
             
             {/* Operations / Symmetry Section */}
             {selectedIds.size > 0 && !pickingMirrorMode && (
                 <div className="p-5 border-b border-gray-100 bg-slate-50">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4"><Spline size={16} /> Operations</h3>
                    <div className="grid grid-cols-3 gap-2">
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
                    </div>
                 </div>
             )}

             {/* Style Properties */}
             <div className="p-5 space-y-5">
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