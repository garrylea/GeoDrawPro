
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, MarkerType, MarkerConfig, Constraint } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { CompassOverlay, RulerOverlay } from './components/ConstructionTools';
import { exportCanvas, saveProject, loadProject, isElectron } from './utils/exportUtils';
import { getSnapPoint, calculateTriangleAngles, parseAngle, solveTriangleASA, getShapeSize, distance, isShapeInRect, getDetailedSnapPoints, getShapeCenter, getRotatedCorners, rotatePoint, bakeRotation, reflectPointAcrossLine, getAngleDegrees, getAngleCurve, getAngleArcPath, simplifyToQuadratic, recognizeFreehandShape, recalculateMarker, getClosestPointOnShape, getProjectionParameter, lerp, getShapeIntersection, resolveConstraints, getSmoothSvgPath, getProjectedPointOnLine, getPixelsPerUnit, evaluateQuadratic, mathToScreen, screenToMath, generateQuadraticPath, isPointInShape, getPolygonAngles, getLineIntersection } from './utils/mathUtils';
import { Download, Trash2, Settings2, Grid3X3, Minus, Plus, Magnet, Spline, Undo, Eraser, Image as ImageIcon, Radius, Wand2, Calculator, Save, FolderOpen, CaseUpper, Sparkles, CornerRightUp, ArrowRight, Hash, Link2, Footprints, FoldHorizontal, FunctionSquare } from 'lucide-react';
import { SnippetOverlay } from './components/SnippetOverlay';

// MAIN ENTRY COMPONENT (Wrapper)
export default function App() {
  // Determine mode synchronously from URL to avoid Hook rule violations
  const isSnippetMode = new URLSearchParams(window.location.search).get('mode') === 'snippet';

  // Apply window transparency styles based on mode
  useLayoutEffect(() => {
    if (isSnippetMode) {
        // CRITICAL: Force body and html to be transparent for Electron window transparency
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
    } else {
        // Ensure main app has a background color
        document.body.style.backgroundColor = '#f8fafc'; // slate-50
    }
  }, [isSnippetMode]);

  if (isSnippetMode) {
      return <SnippetOverlay />;
  }

  return <Editor />;
}

// ORIGINAL APP LOGIC (Renamed to Editor)
function Editor() {
  // This component now contains only the Editor logic.
  // Snippet logic is handled in the parent App component.

  const [shapes, setShapes] = useState<Shape[]>([]);
  // ... rest of the App component (no changes) ...
  const [history, setHistory] = useState<Shape[][]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);
  
  // Default Styles
  const [currentStyle, setCurrentStyle] = useState<{
      fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted'
  }>({ ...DEFAULT_SHAPE_PROPS, strokeType: 'solid' });

  const [axisConfig, setAxisConfig] = useState<AxisConfig>({
    visible: true, ticks: 5, color: '#94a3b8', showGrid: true,
  });

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null); 
  const [dragHandleIndex, setDragHandleIndex] = useState<number | null>(null); 
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null); 
  const cursorPosRef = useRef<Point | null>(null); // Ref for synchronous access in event listeners
  
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [hoveredConstraint, setHoveredConstraint] = useState<Constraint | null>(null);
  
  // Rotation State
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Features State
  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(true); 
  const [smartSketchMode, setSmartSketchMode] = useState(true);

  // Compass State
  const [compassState, setCompassState] = useState<{
      center: Point | null; radiusPoint: Point | null; startAngle: number | null;
  }>({ center: null, radiusPoint: null, startAngle: null });
  const [compassPreviewPath, setCompassPreviewPath] = useState<string | null>(null);

  const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
  const [angleEditing, setAngleEditing] = useState<{ id: string; index: number; x: number; y: number; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const angleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [selectionBox, setSelectionBox] = useState<{start: Point, current: Point} | null>(null);
  
  const lastRotationMouseAngle = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const pixelsPerUnit = getPixelsPerUnit(canvasSize.width, canvasSize.height, axisConfig.ticks);

  const generateId = () => Math.random().toString(36).substr(2, 9);
  const saveHistory = () => setHistory(prev => [...prev, shapes]);

  useEffect(() => {
    const updateCanvasSize = () => {
        if (svgRef.current) {
            const { clientWidth, clientHeight } = svgRef.current;
            setCanvasSize({ width: clientWidth, height: clientHeight });
        }
    };
    updateCanvasSize();
    const observer = new ResizeObserver(() => updateCanvasSize());
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync Function Paths
  useEffect(() => {
      setShapes(prev => prev.map(s => {
          if (s.type === ShapeType.FUNCTION_GRAPH && s.formulaParams) {
              const newPath = generateQuadraticPath(s.formulaParams, s.functionForm || 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit);
              return { ...s, pathData: newPath };
          }
          return s;
      }));
  }, [canvasSize.width, canvasSize.height, axisConfig.ticks]);

  useEffect(() => {
      if (textEditing && inputRef.current) {
          setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (angleEditing && angleInputRef.current) {
          // Fix: Check if already focused to prevent re-selecting text on every keystroke
          if (document.activeElement !== angleInputRef.current) {
              setTimeout(() => {
                 angleInputRef.current?.focus(); 
                 angleInputRef.current?.select();
              }, 50);
          }
      }
  }, [textEditing, angleEditing]);

  // --- Helper to process image file (shared by Upload, Drag&Drop, Paste) ---
  const processImageFile = useCallback((file: File, position?: Point) => {
      const reader = new FileReader();
      reader.onload = (event) => {
          const url = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              saveHistory();
              const id = generateId();
              const width = img.width;
              const height = img.height;
              
              // Scale down if too big
              const maxDim = 300;
              let finalW = width;
              let finalH = height;
              if (width > maxDim || height > maxDim) {
                  const ratio = width / height;
                  if (width > height) { finalW = maxDim; finalH = maxDim / ratio; }
                  else { finalH = maxDim; finalW = maxDim * ratio; }
              }

              let centerX, centerY;
              if (position) {
                  centerX = position.x;
                  centerY = position.y;
              } else {
                  // Default to center of canvas
                  centerX = canvasSize.width / 2;
                  centerY = canvasSize.height / 2;
              }

              const newShape: Shape = {
                  id, type: ShapeType.IMAGE,
                  points: [{x: centerX - finalW/2, y: centerY - finalH/2}, {x: centerX + finalW/2, y: centerY + finalH/2}],
                  imageUrl: url,
                  fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0
              };
              setShapes(prev => [...prev, newShape]);
              setSelectedIds(new Set([id]));
              setTool(ToolType.SELECT);
          }
          img.src = url;
      };
      reader.readAsDataURL(file);
  }, [canvasSize]);

  // Paste Event Listener
  useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
          if (e.clipboardData?.items) {
              for (let i = 0; i < e.clipboardData.items.length; i++) {
                  const item = e.clipboardData.items[i];
                  if (item.type.indexOf('image') !== -1) {
                      const file = item.getAsFile();
                      if (file) {
                          e.preventDefault(); 
                          // Use mouse position from ref if available, otherwise undefined (centers on canvas)
                          processImageFile(file, cursorPosRef.current || undefined);
                      }
                  }
              }
          }
      };
      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [processImageFile]);

  // --- Label Generator ---
  const getNextLabels = (count: number): string[] => {
      const used = new Set<string>();
      shapes.forEach(s => {
          if (s.labels) s.labels.forEach(l => used.add(l));
          if (s.type === ShapeType.TEXT && s.text && s.text.length <= 2) used.add(s.text);
      });

      const result: string[] = [];
      let i = 0;
      while(result.length < count && i < 1000) {
          const charCode = 65 + (i % 26);
          let label = String.fromCharCode(charCode);
          const cycle = Math.floor(i / 26);
          if (cycle > 0) label += cycle;

          if (!used.has(label)) {
              result.push(label);
              used.add(label); 
          }
          i++;
      }
      return result;
  };

  const undo = () => {
      if (history.length === 0) return;
      const previousState = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1)); 
      setShapes(previousState);
      setSelectedIds(new Set<string>()); 
      setActiveShapeId(null);
  };

  const deleteSelected = () => {
      if (selectedIds.size === 0) return;
      saveHistory();
      const idsToDelete = new Set<string>(Array.from(selectedIds) as string[]);
      setShapes(prev => prev.filter(s => {
          // Remove if specifically selected
          if (idsToDelete.has(s.id)) return false;
          // Remove if dependent constraint parent is deleted
          if (s.constraint && idsToDelete.has(s.constraint.parentId || '')) return false;
          // Remove if it is a marker for a deleted shape
          if (s.type === ShapeType.MARKER && s.markerConfig && idsToDelete.has(s.markerConfig.targets[0].shapeId)) return false;
          
          return true;
      }));
      setSelectedIds(new Set<string>());
  };

  // Keyboard
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);
          if (e.key === 'Shift') setIsShiftPressed(true);
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT') return;
          if (textEditing || angleEditing) return;

          if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
          // Ctrl+A: Select All
          if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
              e.preventDefault();
              setSelectedIds(new Set(shapes.map(s => s.id)));
              return;
          }
          if (e.key === 'Escape') {
              if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
              if (markingAnglesMode) { setMarkingAnglesMode(false); return; }
              if (activeShapeId) {
                  setShapes(prev => prev.filter(s => s.id !== activeShapeId));
                  setActiveShapeId(null); setIsDragging(false); setTool(ToolType.SELECT); return;
              }
              if (tool === ToolType.COMPASS && compassState.center) { setCompassState({ center: null, radiusPoint: null, startAngle: null }); setCompassPreviewPath(null); return; }
              if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
              if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
          }
          if ((e.key === 'Delete' || e.key === 'Backspace')) { deleteSelected(); }
          if (e.key === 'Enter' && selectedIds.size === 1) {
              const id = (Array.from(selectedIds) as string[])[0];
              const s = shapes.find(sh => sh.id === id);
              if (s && s.type === ShapeType.TEXT) {
                  e.preventDefault(); setTextEditing({ id: s.id, x: s.points[0].x, y: s.points[0].y, text: s.text || '' });
              }
          }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(false);
          if (e.key === 'Shift') setIsShiftPressed(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedIds, textEditing, angleEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, tool, compassState]); 

  const getMousePos = (e: React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const raw = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    
    if (tool === ToolType.FREEHAND) {
        setSnapIndicator(null); return raw;
    }

    if (snap && !isShiftPressed) { 
        const exclude = activeShapeId ? [activeShapeId] : [];
        // Only snap to grid if it is visible and enabled
        const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) 
            ? { width: canvasSize.width, height: canvasSize.height, ppu: pixelsPerUnit } 
            : undefined;

        const { point, snapped, constraint } = getSnapPoint(raw, shapes, exclude, gridSnapConfig);
        
        if (!snapped && hoveredShapeId) {
            const shape = shapes.find(s => s.id === hoveredShapeId);
            if (shape?.type === ShapeType.FUNCTION_GRAPH && shape.formulaParams) {
                const mp = screenToMath(raw, canvasSize.width, canvasSize.height, pixelsPerUnit);
                const my = evaluateQuadratic(mp.x, shape.formulaParams, shape.functionForm);
                const sp = mathToScreen({ x: mp.x, y: my }, canvasSize.width, canvasSize.height, pixelsPerUnit);
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

  const handleToolChange = (newTool: ToolType) => {
    if (newTool === ToolType.IMAGE) {
        imageInputRef.current?.click();
        return;
    }
    setTool(newTool); setSelectedIds(new Set()); setSnapIndicator(null); setCursorPos(null);
    setSelectionBox(null); setActiveShapeId(null); setTextEditing(null); setAngleEditing(null);
    setPickingMirrorMode(false); setMarkingAnglesMode(false); setHoveredShapeId(null);
    setCompassState({ center: null, radiusPoint: null, startAngle: null });
    setCompassPreviewPath(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processImageFile(file); // Use the shared helper
        e.target.value = ''; 
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dropPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
              processImageFile(file, dropPos);
          }
      }
  };

  const handleRotateStart = (e: React.MouseEvent, shape: Shape) => {
    e.stopPropagation();
    setIsRotating(true);
    let center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
    if (pivotIndex !== 'center') {
        const idx = pivotIndex as number;
        const corners = getRotatedCorners(shape);
        if (corners[idx]) center = corners[idx];
    }
    setRotationCenter(center);
    const pos = getMousePos(e, false);
    lastRotationMouseAngle.current = Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);
  };

  const handleAngleDoubleClick = (sid: string, index: number, e: React.MouseEvent) => {
      const shape = shapes.find(s => s.id === sid);
      if (!shape) return;
      
      const center = getShapeCenter(shape.points);
      const p = shape.points[index];
      // Calculate text position similar to SelectionOverlay
      const dx = center.x - p.x;
      const dy = center.y - p.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const off = 25;
      const tx = p.x + (dx/len) * off;
      const ty = p.y + (dy/len) * off;
      
      // Get current angle value
      const angles = getPolygonAngles(shape.points);
      const val = angles[index]?.toString() || "0";
      
      setAngleEditing({ id: sid, index, x: tx, y: ty, value: val });
  };

  const handleAngleUpdate = (newValString: string) => {
      if (!angleEditing) return;
      const newVal = parseFloat(newValString);
      if (isNaN(newVal) || newVal <= 0 || newVal >= 180) {
          setAngleEditing(null);
          return;
      }

      saveHistory();
      const { id, index } = angleEditing;
      
      setShapes(prev => prev.map(s => {
          if (s.id !== id) return s;
          if (s.type !== ShapeType.TRIANGLE || s.points.length < 3) return s;

          const points = [...s.points];
          
          // Indices: 
          // pCurr = Pivot (Angle being modified, B)
          // pPrev = Anchor (CW Neighbor, A) -> Position Fixed, Angle at A Fixed.
          // pNext = Target (CCW Neighbor, C) -> This Point Moves.
          
          const iCurr = index;
          const iNext = (index + 1) % 3; // CCW neighbor
          const iPrev = (index - 1 + 3) % 3; // CW neighbor
          
          const pCurr = points[iCurr];
          const pNext = points[iNext];
          const pPrev = points[iPrev];

          // 1. Determine Ray 1: From pPrev (A) passing through pNext (C).
          // Since Angle A is fixed, and Point A is fixed, this ray direction is fixed.
          // Vector A -> C
          const vRayFixed = { x: pNext.x - pPrev.x, y: pNext.y - pPrev.y };
          
          // 2. Determine Ray 2: From pCurr (B) outwards at the NEW Angle.
          // We need to rotate the vector BA (pCurr -> pPrev) by the new angle to get direction BC.
          
          // Vector B -> A
          const vBA = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
          
          const vBC_Old = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
          
          // Current Vector B -> C (to determine sign/winding)
          // Cross product z-component
          const crossZ = vBA.x * vBC_Old.y - vBA.y * vBC_Old.x;
          // If crossZ > 0, C is "to the right/CW" of BA (in screen coords where Y is down).
          // We apply the rotation in the same direction.
          const sign = crossZ >= 0 ? 1 : -1;
          
          const angleRad = (newVal * Math.PI) / 180;
          
          // Rotate vBA by (sign * angleRad) to get new vBC direction
          const cos = Math.cos(sign * angleRad);
          const sin = Math.sin(sign * angleRad);
          
          const vBC_NewDir = {
              x: vBA.x * cos - vBA.y * sin,
              y: vBA.x * sin + vBA.y * cos
          };
          
          // 3. Find Intersection of Ray(pPrev, vRayFixed) and Ray(pCurr, vBC_NewDir)
          const newNext = getLineIntersection(pPrev, vRayFixed, pCurr, vBC_NewDir);
          
          if (!newNext) return s; 

          // 4. Safety Checks to prevent "Distance too much" / Infinity / Inversion
          // Check 1: Distance limit (prevent shooting to infinity)
          const d1 = distance(pCurr, newNext);
          const d2 = distance(pPrev, newNext);
          if (d1 > 3000 || d2 > 3000) return s; // Abort if too huge
          
          // Check 2: Directionality (Intersection must be "forward" along the rays)
          // Project (NewNext - pPrev) onto vRayFixed. Dot product should be positive.
          const dotFixed = (newNext.x - pPrev.x) * vRayFixed.x + (newNext.y - pPrev.y) * vRayFixed.y;
          // Project (NewNext - pCurr) onto vBC_NewDir. Dot product should be positive.
          const dotNew = (newNext.x - pCurr.x) * vBC_NewDir.x + (newNext.y - pCurr.y) * vBC_NewDir.y;
          
          if (dotFixed <= 0 || dotNew <= 0) return s; // Intersection is behind the points

          points[iNext] = newNext;
          return { ...s, points };
      }));
      setAngleEditing(null);
  };

  // --- Style Handling ---
  const handleStyleChange = (key: keyof typeof currentStyle, value: any) => {
      setCurrentStyle(prev => ({ ...prev, [key]: value }));
      if (selectedIds.size > 0) {
          saveHistory();
          setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, [key]: value } : s));
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEditing || angleEditing) return;
    let pos = getMousePos(e, true);
    const rawPos = getMousePos(e, false);

    if (tool !== ToolType.SELECT && tool !== ToolType.COMPASS && !pickingMirrorMode && !markingAnglesMode) {
        setSelectedIds(new Set());
    }

    if (tool === ToolType.COMPASS) {
        if (!compassState.center) {
            setCompassState({ ...compassState, center: pos });
        } else {
             // New Logic: Pressing down defines the radius and start angle immediately
            setCompassState({ ...compassState, radiusPoint: pos, startAngle: getAngleDegrees(compassState.center, pos) });
        }
        return;
    }

    if (tool === ToolType.RULER) {
        const existingRuler = shapes.find(s => s.type === ShapeType.RULER);
        if (existingRuler) {
            setSelectedIds(new Set([existingRuler.id]));
            setDragStartPos(rawPos);
            setIsDragging(true);
            return;
        }
        saveHistory();
        const id = generateId();
        const width = 400, height = 50;
        const newShape: Shape = { 
            id, type: ShapeType.RULER, points: [{ x: pos.x - width/2, y: pos.y - height/2 }, { x: pos.x + width/2, y: pos.y + height/2 }], 
            fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, rotation: 0 
        };
        setShapes(prev => [...prev, newShape]);
        setSelectedIds(new Set([id]));
        // Initialize drag for new shape too to allow immediate move
        setDragStartPos(rawPos);
        setIsDragging(true); 
        return;
    }

    if (pickingMirrorMode) { 
        const line = shapes.find(s => (s.type === ShapeType.LINE || s.type === ShapeType.FREEHAND) && distance(pos, getClosestPointOnShape(pos, s)) < 10);
        if (line) handleFold(line.id); return; 
    }
    
    if (tool === ToolType.FUNCTION) {
        saveHistory();
        const id = generateId();
        // Fix 1: Offset new functions so they don't overlap exactly with existing ones
        const existingFunctions = shapes.filter(s => s.type === ShapeType.FUNCTION_GRAPH).length;
        const offset = existingFunctions * 2; 
        
        const params = { a: 1, b: 0, c: offset, h: 0, k: offset }; 
        const pathData = generateQuadraticPath(params, 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit);
        const newShape: Shape = { id, type: ShapeType.FUNCTION_GRAPH, points: [], formulaParams: params, functionForm: 'standard', pathData, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0 };
        setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); 
        return;
    }

    if (tool === ToolType.SELECT) {
        if (hoveredShapeId) {
             if (e.altKey) {
                 const shapeToClone = shapes.find(s => s.id === hoveredShapeId);
                 if (shapeToClone) {
                     saveHistory();
                     const newId = generateId();
                     const clonedShape = { ...shapeToClone, id: newId };
                     setShapes(prev => [...prev, clonedShape]);
                     setSelectedIds(new Set([newId]));
                     setDragStartPos(rawPos);
                     setIsDragging(true);
                     return;
                 }
             }
             const newSel = new Set(e.shiftKey || e.ctrlKey ? selectedIds : []);
             newSel.add(hoveredShapeId);
             setSelectedIds(newSel);
             setDragStartPos(rawPos);
             setIsDragging(true);
             return;
        }

        if (!e.shiftKey && !e.ctrlKey) { setSelectedIds(new Set()); }
        setSelectionBox({ start: rawPos, current: rawPos });
        setIsDragging(true); return;
    }

    saveHistory(); 

    if (tool === ToolType.PROTRACTOR) {
        const existingProtractor = shapes.find(s => s.type === ShapeType.PROTRACTOR);
        if (existingProtractor) {
            setSelectedIds(new Set([existingProtractor.id]));
            setDragStartPos(rawPos);
            setIsDragging(true);
            return;
        }
        const id = generateId();
        const newShape: Shape = { id, type: ShapeType.PROTRACTOR, points: [{ x: pos.x - 150, y: pos.y - 150 }, { x: pos.x + 150, y: pos.y }], fill: 'transparent', stroke: currentStyle.stroke, strokeWidth: 1, rotation: 0 };
        setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id]));
        // Initialize drag for new shape too
        setDragStartPos(rawPos);
        setIsDragging(true); 
        return;
    }

    if (tool === ToolType.TEXT) {
        e.preventDefault(); 
        const id = generateId();
        const newShape: Shape = { 
            id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 
        };
        setShapes(prev => [...prev, newShape]);
        setTextEditing({ id, x: pos.x, y: pos.y, text: '' });
        setSelectedIds(new Set<string>([id]));
        return;
    }

    if (tool === ToolType.LINE) {
        if (activeShapeId) {
            setShapes(prev => prev.map(s => {
                if (s.id !== activeShapeId) return s;
                const newPoints = [...s.points];
                newPoints[newPoints.length - 1] = pos; 
                return { ...s, points: newPoints };
            }));
            setActiveShapeId(null);
            setDragStartPos(null);
            return;
        } else {
            setDragStartPos(rawPos);
            const id = generateId();
            const newShape: Shape = { id, type: ShapeType.LINE, points: [pos, pos], fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
            setShapes(prev => [...prev, newShape]); 
            setActiveShapeId(id); 
            return;
        }
    }

    setDragStartPos(rawPos); 
    setIsDragging(true);
    const id = generateId();
    let points: Point[] = [pos, pos];
    if (tool === ToolType.TRIANGLE) points = [pos, pos, pos];
    if (tool === ToolType.POINT || tool === ToolType.FREEHAND) points = [pos];

    let labels: string[] | undefined = undefined;
    if (autoLabelMode) {
        if (tool === ToolType.TRIANGLE) labels = getNextLabels(3);
        if (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE) labels = getNextLabels(4);
        if (tool === ToolType.POLYGON) labels = getNextLabels(points.length);
    }

    const newShape: Shape = {
      id, type: tool as unknown as ShapeType, points, labels, 
      fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, 
      strokeType: currentStyle.strokeType, // FIX: Apply strokeType to new shapes
      rotation: 0
    };
    
    if (tool === ToolType.POINT && hoveredConstraint) newShape.constraint = hoveredConstraint;

    setShapes(prev => [...prev, newShape]);
    setActiveShapeId(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e, true);
    const rawPos = getMousePos(e, false);
    setCursorPos(rawPos);
    cursorPosRef.current = rawPos; // Keep ref updated for synchronous access in paste listener

    if (tool === ToolType.COMPASS && compassState.radiusPoint) {
         const radius = distance(compassState.center!, compassState.radiusPoint);
         const angleRad = Math.atan2(rawPos.y - compassState.center!.y, rawPos.x - compassState.center!.x);
         const startRad = (compassState.startAngle! * Math.PI) / 180;
         const arcEnd = { x: compassState.center!.x + radius * Math.cos(angleRad), y: compassState.center!.y + radius * Math.sin(angleRad) };
         const arcStart = { x: compassState.center!.x + radius * Math.cos(startRad), y: compassState.center!.y + radius * Math.sin(startRad) };
         setCompassPreviewPath(getAngleArcPath(compassState.center!, arcStart, arcEnd, radius));
         return;
    }

    if (tool === ToolType.SELECT && selectionBox && isDragging) {
        setSelectionBox(prev => prev ? ({ ...prev, current: rawPos }) : null);
        const box = { start: selectionBox.start, end: rawPos };
        const newSelection = new Set<string>();
        shapes.forEach(s => { if (isShapeInRect(s, box)) newSelection.add(s.id); });
        setSelectedIds(newSelection);
        return;
    }

    if (isRotating && rotationCenter && activeShapeId === null) { 
         const currentAngle = Math.atan2(rawPos.y - rotationCenter.y, rawPos.x - rotationCenter.x) * (180 / Math.PI);
         const delta = currentAngle - lastRotationMouseAngle.current;
         lastRotationMouseAngle.current = currentAngle;

         setShapes(prev => {
             const rotatedShapes = prev.map(s => {
                 if (!selectedIds.has(s.id)) return s;
                 const newRotation = (s.rotation || 0) + delta;
                 if (pivotIndex === 'center') {
                     return { ...s, rotation: newRotation };
                 }
                 const oldCenter = getShapeCenter(s.points, s.type, s.fontSize, s.text);
                 const newCenter = rotatePoint(oldCenter, rotationCenter, delta);
                 const dx = newCenter.x - oldCenter.x;
                 const dy = newCenter.y - oldCenter.y;
                 const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                 return { ...s, points: newPoints, rotation: newRotation };
             });
             
             // Sync markers for any rotated shapes
             return rotatedShapes.map(s => {
                 if (s.type === ShapeType.MARKER && s.markerConfig) {
                     const targetId = s.markerConfig.targets[0].shapeId;
                     if (selectedIds.has(targetId)) return recalculateMarker(s, rotatedShapes) || s;
                 }
                 return s;
             });
         });
         return;
    }

    if (!isDragging) {
        // FIX 2: Check shapes in REVERSE order (top-most first) for accurate hit testing when shapes overlap
        const hit = [...shapes].reverse().find(s => { 
            return isPointInShape(rawPos, s, canvasSize.width, canvasSize.height, pixelsPerUnit);
        });
        setHoveredShapeId(hit ? hit.id : null); 
    }

    if (dragHandleIndex !== null && selectedIds.size === 1) {
        const id = (Array.from(selectedIds) as string[])[0];
        setShapes(prev => {
            const resizedShapes = prev.map(s => {
                if (s.id !== id) return s;

                // --- FREEHAND RESIZE LOGIC ---
                if (s.type === ShapeType.FREEHAND && dragHandleIndex !== null && dragHandleIndex < 4) {
                     const xs = s.points.map(p => p.x);
                     const ys = s.points.map(p => p.y);
                     const minX = Math.min(...xs), maxX = Math.max(...xs);
                     const minY = Math.min(...ys), maxY = Math.max(...ys);
                     const w = maxX - minX;
                     const h = maxY - minY;
                     
                     if (w === 0 || h === 0) return s;

                     const corners = [ { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY } ];
                     const fixedIdx = (dragHandleIndex + 2) % 4;
                     const fixedPoint = corners[fixedIdx];
                     
                     let targetPos = pos; 
                     if (isShiftPressed) {
                         const ratio = w / h;
                         const dx = targetPos.x - fixedPoint.x;
                         const dy = targetPos.y - fixedPoint.y;
                         if (Math.abs(dx) / Math.abs(dy) > ratio) {
                             const newH = Math.abs(dx) / ratio;
                             targetPos = { ...targetPos, y: fixedPoint.y + (dy > 0 ? newH : -newH) };
                         } else {
                             const newW = Math.abs(dy) * ratio;
                             targetPos = { ...targetPos, x: fixedPoint.x + (dx > 0 ? newW : -newW) };
                         }
                     }

                     const newMinX = Math.min(fixedPoint.x, targetPos.x);
                     const newWidth = Math.abs(targetPos.x - fixedPoint.x);
                     const newMinY = Math.min(fixedPoint.y, targetPos.y);
                     const newHeight = Math.abs(targetPos.y - fixedPoint.y);

                     const scaledPoints = s.points.map(p => ({
                         x: newMinX + ((p.x - minX) / w) * newWidth,
                         y: newMinY + ((p.y - minY) / h) * newHeight
                     }));
                     
                     return { ...s, points: scaledPoints };
                }

                if (s.type === ShapeType.TEXT) {
                     const center = getShapeCenter(s.points, s.type, s.fontSize, s.text);
                     const d = distance(center, rawPos); 
                     const newSize = Math.max(8, Math.round(d / 2));
                     return { ...s, fontSize: newSize };
                }
                const newPoints = [...s.points];
                
                // --- BOUNDING BOX RESIZE LOGIC (Rect, Square, Image, Circle, Ellipse) ---
                // Supports all 4 corners and Shift aspect ratio lock
                const isBoxShape = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(s.type);

                if (isBoxShape && newPoints.length === 2) {
                     // 1. Calculate current BBox corners (0:TL, 1:TR, 2:BR, 3:BL)
                     const p0 = newPoints[0];
                     const p1 = newPoints[1];
                     const minX = Math.min(p0.x, p1.x);
                     const maxX = Math.max(p0.x, p1.x);
                     const minY = Math.min(p0.y, p1.y);
                     const maxY = Math.max(p0.y, p1.y);
                     
                     const corners = [
                         { x: minX, y: minY }, 
                         { x: maxX, y: minY }, 
                         { x: maxX, y: maxY }, 
                         { x: minX, y: maxY }  
                     ];
                     
                     // 2. Determine fixed anchor point (opposite to dragged handle)
                     // SelectionOverlay maps handles 0..3 to corners 0..3
                     if (dragHandleIndex !== null && dragHandleIndex >= 0 && dragHandleIndex < 4) {
                         const fixedIdx = (dragHandleIndex + 2) % 4;
                         const fixedPoint = corners[fixedIdx];
                         
                         let targetPos = pos; // Use snapped position (unless Shift is held, getMousePos handles that)

                         // 3. Apply Aspect Ratio Constraint
                         if (isShiftPressed || s.type === ShapeType.SQUARE || s.type === ShapeType.CIRCLE) {
                             const w = maxX - minX;
                             const h = maxY - minY;
                             if (w > 0 && h > 0) {
                                 const ratio = w / h;
                                 const dx = targetPos.x - fixedPoint.x;
                                 const dy = targetPos.y - fixedPoint.y;
                                 
                                 // Determine major axis for scaling to prevent collapse
                                 if (Math.abs(dx) / Math.abs(dy) > ratio) {
                                     // Scale based on X
                                     const newH = Math.abs(dx) / ratio;
                                     targetPos = { ...targetPos, y: fixedPoint.y + (dy > 0 ? newH : -newH) };
                                 } else {
                                     // Scale based on Y
                                     const newW = Math.abs(dy) * ratio;
                                     targetPos = { ...targetPos, x: fixedPoint.x + (dx > 0 ? newW : -newW) };
                                 }
                             }
                         }
                         
                         // 4. Update points to new diagonal
                         newPoints[0] = fixedPoint;
                         newPoints[1] = targetPos;
                     }
                } else {
                    // Standard vertex drag for other shapes (Line, Triangle, Polygon, etc.)
                    if (dragHandleIndex !== null && dragHandleIndex < newPoints.length) {
                        newPoints[dragHandleIndex] = pos;
                    }
                }

                return { ...s, points: newPoints };
            });

            // Sync markers for resized shape
            return resizedShapes.map(s => {
                 if (s.type === ShapeType.MARKER && s.markerConfig && s.markerConfig.targets[0].shapeId === id) {
                     return recalculateMarker(s, resizedShapes) || s;
                 }
                 return s;
            });
        });
        return;
    }
    
    if (activeShapeId) {
        setShapes(prev => prev.map(s => {
            if (s.id !== activeShapeId) return s;
            const start = s.points[0];
            let newPoints = [...s.points];
            newPoints[newPoints.length - 1] = pos;
            
            if (s.type === ShapeType.SQUARE || s.type === ShapeType.CIRCLE) {
                const d = Math.max(Math.abs(pos.x - start.x), Math.abs(pos.y - start.y));
                const sx = pos.x > start.x ? 1 : -1;
                const sy = pos.y > start.y ? 1 : -1;
                newPoints[1] = { x: start.x + d * sx, y: start.y + d * sy };
            } else if (s.type === ShapeType.TRIANGLE) {
                newPoints[1] = { x: start.x, y: pos.y };
                newPoints[2] = pos;
            } else if (s.type === ShapeType.FREEHAND) {
                newPoints = [...s.points, pos];
            }
            return { ...s, points: newPoints };
        }));
    } else if (selectedIds.size > 0 && dragStartPos && isDragging) {
        const dx = rawPos.x - dragStartPos.x;
        const dy = rawPos.y - dragStartPos.y;
        setDragStartPos(rawPos); 
        setShapes(prev => {
            const movedShapes = prev.map(s => selectedIds.has(s.id) ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : s);
            
            // Sync markers for moved shapes
            return movedShapes.map(s => {
                 if (s.type === ShapeType.MARKER && s.markerConfig) {
                     const targetId = s.markerConfig.targets[0].shapeId;
                     if (selectedIds.has(targetId)) return recalculateMarker(s, movedShapes) || s;
                 }
                 return s;
            });
        });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      setIsDragging(false); setIsRotating(false); setDragHandleIndex(null); setSelectionBox(null);
      const rawPos = getMousePos(e, false);

      if (tool === ToolType.COMPASS) {
          if (compassPreviewPath) {
              saveHistory();
              const id = generateId();
              
              // Generate approximate points for the arc to allow selection
              const center = compassState.center!;
              const radius = distance(center, compassState.radiusPoint!);
              const startAngle = compassState.startAngle!;
              const endAngle = getAngleDegrees(center, rawPos);
              
              const arcPoints = [];
              // Simple interpolation. 20 points usually enough for hit testing.
              const step = (endAngle - startAngle) / 20;
              for(let i=0; i<=20; i++) {
                  const rad = ((startAngle + step * i) * Math.PI) / 180;
                  arcPoints.push({
                      x: center.x + radius * Math.cos(rad),
                      y: center.y + radius * Math.sin(rad)
                  });
              }

              const newShape: Shape = { 
                  id, 
                  type: ShapeType.PATH, 
                  points: [center, ...arcPoints], // Store center + arc points for logic
                  pathData: compassPreviewPath, 
                  fill: 'none', 
                  stroke: currentStyle.stroke, 
                  strokeWidth: currentStyle.strokeWidth, 
                  rotation: 0, 
                  isConstruction: true 
              };
              setShapes(prev => [...prev, newShape]);
          }
          // Reset drawing state (radius/startAngle), but KEEP center point
          setCompassState(prev => ({ ...prev, radiusPoint: null, startAngle: null })); 
          setCompassPreviewPath(null);
          return;
      }

      if (activeShapeId && tool === ToolType.LINE) {
          if (dragStartPos) {
              const d = distance(dragStartPos, rawPos);
              if (d > 5) setActiveShapeId(null);
          }
          setDragStartPos(null);
          return;
      }
      setDragStartPos(null);

      if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) {
          const shape = shapes.find(s => s.id === activeShapeId);
          if (shape && shape.points.length > 5) {
               const recognized = recognizeFreehandShape(shape.points);
               if (recognized) {
                   const newPoints = recognized.points;
                   let labels: string[] | undefined = undefined;
                   if (autoLabelMode) {
                        if (recognized.type === ShapeType.TRIANGLE) labels = getNextLabels(3);
                        if (recognized.type === ShapeType.RECTANGLE || recognized.type === ShapeType.SQUARE) labels = getNextLabels(4);
                   }
                   setShapes(prev => prev.map(s => s.id === activeShapeId ? { ...s, type: recognized.type, points: newPoints, labels } : s));
               }
          }
      }

      if (activeShapeId) {
          if (tool !== ToolType.FREEHAND) {
             setSelectedIds(new Set([activeShapeId])); 
          }
          setActiveShapeId(null);
      }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      const rawPos = getMousePos(e, false);
      // Check for hit (top-most first)
      const hit = [...shapes].reverse().find(s => { 
          return isPointInShape(rawPos, s, canvasSize.width, canvasSize.height, pixelsPerUnit);
      });

      if (hit && hit.type === ShapeType.TEXT) {
          setTextEditing({ id: hit.id, x: hit.points[0].x, y: hit.points[0].y, text: hit.text || '' });
          setSelectedIds(new Set([hit.id]));
      }
  };

  const handleSaveProject = () => { isElectron() ? saveProject(shapes, 'project') : saveProject(shapes, 'project'); };
  const handleOpenProjectClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      try { 
          const loaded = await loadProject(e.target.files[0]); 
          setShapes(loaded); 
          setHistory([]); 
          setSelectedIds(new Set()); 
      } catch(e) { 
          alert("Error loading"); 
      } finally {
          e.target.value = ''; // Reset input value to allow re-selection of the same file
      }
  };
  
  const handleCornerClick = (sid: string, idx: number) => {
      // Toggle existing marker if present
      const shape = shapes.find(s => s.id === sid);
      if (!shape) return;
      
      const corners = getRotatedCorners(shape);
      const len = corners.length;
      const prev = (idx - 1 + len) % len;
      const next = (idx + 1) % len;
      
      // Check if marker exists for this corner (simplification: check if targets match)
      const existing = shapes.find(s => s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === sid && s.markerConfig?.targets[0].pointIndices[1] === idx);
      
      if (existing) {
          // Toggle type if it exists
          const newType: MarkerType = existing.markerConfig?.type === 'angle_arc' ? 'perpendicular' : 'angle_arc';
          setShapes(prevShapes => prevShapes.map(s => {
              if (s.id === existing.id) {
                  const updated: Shape = { ...s, markerConfig: { ...s.markerConfig!, type: newType } };
                  return recalculateMarker(updated, prevShapes) || updated;
              }
              return s;
          }));
      } else {
          // Create new
          saveHistory();
          const id = generateId();
          const vertex = corners[idx];
          let newShape: Shape = {
              id, type: ShapeType.MARKER, points: [vertex], fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0,
              markerConfig: { type: 'angle_arc', targets: [{ shapeId: sid, pointIndices: [prev, idx, next] }] }
          };
          const calculated = recalculateMarker(newShape, shapes);
          if (calculated) newShape = calculated;
          setShapes(prev => [...prev, newShape]);
      }
  };

  const handleSymbolClick = (s: string) => { 
      if(textEditing) {
          const newVal = textEditing.text + s;
          setTextEditing(prev => prev ? ({...prev, text: newVal}) : null);
          // Don't update shapes here, wait for Enter/Blur
      }
  };

  const updateMarkerType = (type: MarkerType) => {
      if (selectedIds.size !== 1) return;
      const id = [...selectedIds][0];
      setShapes(prev => prev.map(s => {
          if (s.id !== id || !s.markerConfig) return s;
          const newMarker: Shape = { ...s, markerConfig: { ...s.markerConfig, type } };
          // Recalculate path immediately
          return recalculateMarker(newMarker, prev) || newMarker;
      }));
  };

  const handleFold = (lineId: string) => {
      const line = shapes.find(s => s.id === lineId);
      if (!line || line.points.length < 2) return;
      const p1 = line.points[0];
      const p2 = line.points[1];

      saveHistory();
      const newShapes: Shape[] = shapes.map(s => {
          if (selectedIds.has(s.id) && s.id !== lineId) return { ...s, fill: 'transparent', stroke: '#cbd5e1' }; 
          return s;
      });

      shapes.forEach(s => {
          if (selectedIds.has(s.id) && s.id !== lineId) {
              let sourcePoints = s.points;
              let newType = s.type;
              if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.TRIANGLE, ShapeType.POLYGON, ShapeType.LINE].includes(s.type)) {
                  sourcePoints = getRotatedCorners(s);
                  newType = s.type === ShapeType.LINE ? ShapeType.LINE : ShapeType.POLYGON;
              }
              const newPoints = sourcePoints.map(p => reflectPointAcrossLine(p, p1, p2));
              const cloneId = generateId();
              newShapes.push({
                  ...s, id: cloneId, type: newType, points: newPoints, rotation: 0, labels: undefined, text: s.text, fill: s.fill, stroke: s.stroke === '#cbd5e1' ? '#000000' : s.stroke 
              });
          }
      });
      setShapes(newShapes);
      setPickingMirrorMode(false);
      setSelectedIds(new Set()); 
  };

  // Helper to update function params
  const updateFunctionParam = (param: string, val: number | string) => {
      if (selectedIds.size !== 1) return;
      const id = [...selectedIds][0];
      const numVal = parseFloat(val.toString());
      if (isNaN(numVal) && val !== '' && val !== '-') return; // Allow empty string or negative sign for editing
      
      setShapes(prev => prev.map(s => {
          if (s.id !== id || !s.formulaParams) return s;
          const newParams = { ...s.formulaParams, [param]: numVal || 0 };
          const newPath = generateQuadraticPath(newParams, s.functionForm || 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit);
          return { ...s, formulaParams: newParams, pathData: newPath };
      }));
  };

  // Helper to toggle function form and recalc path
  const toggleFunctionForm = (newForm: 'standard' | 'vertex') => {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    setShapes(prev => prev.map(s => {
        if (s.id !== id || !s.formulaParams) return s;
        // When switching forms, we keep the parameters but they mean different things mathematically.
        // The path should update to reflect the new interpretation.
        const newPath = generateQuadraticPath(s.formulaParams, newForm, canvasSize.width, canvasSize.height, pixelsPerUnit);
        return { ...s, functionForm: newForm, pathData: newPath };
    }));
  };

  const constructionTools = [ToolType.RULER, ToolType.COMPASS, ToolType.PROTRACTOR];
  const shapeToolsConfig = TOOL_CONFIG.filter(t => !constructionTools.includes(t.id));
  const constructionToolsConfig = TOOL_CONFIG.filter(t => constructionTools.includes(t.id));

  const selectedShape = selectedIds.size === 1 ? shapes.find(s => s.id === [...selectedIds][0]) : null;

  // New Helper: Get Marker for Corner
  const getMarkerForCorner = (shapeId: string, idx: number) => {
      return shapes.find(s => s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === shapeId && s.markerConfig.targets[0].pointIndices[1] === idx);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-slate-900 font-sans bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm z-20 shrink-0 h-14">
            <div className="flex items-center space-x-2">
                <div className="bg-blue-600 text-white p-1 rounded-lg"><Spline size={20} /></div>
                <h1 className="font-bold text-lg text-slate-800 tracking-tight">GeoDraw Pro</h1>
            </div>
            <div className="flex items-center space-x-2">
                <button onClick={() => imageInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" title="Import Image"><ImageIcon size={18}/> Image</button>
                <button onClick={handleOpenProjectClick} className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" title="Open"><FolderOpen size={18}/> Open</button>
                <button onClick={handleSaveProject} className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" title="Save"><Save size={18}/> Save</button>
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <button onClick={undo} className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" title="Undo"><Undo size={18}/> Undo</button>
                <button onClick={deleteSelected} className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" title="Delete"><Trash2 size={18}/> Delete</button>
                <button onClick={() => { setShapes([]); setHistory([]); setSelectedIds(new Set()); }} className="p-2 text-red-500 hover:bg-red-50 rounded flex items-center gap-1 text-sm font-medium" title="Clear All"><Eraser size={18}/> Clear All</button>
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <button onClick={() => exportCanvas(svgRef.current!, 'png', 'drawing')} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 hover:bg-blue-700 shadow-sm"><Download size={16}/> Export</button>
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-1 z-10 overflow-y-auto scrollbar-hide shrink-0">
                {shapeToolsConfig.map(t => (
                    <button key={t.id} onClick={() => handleToolChange(t.id)} className={`p-2 rounded-lg transition-all ${tool === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`} title={t.label}>
                        <t.icon size={22} strokeWidth={tool === t.id ? 2.5 : 2} />
                    </button>
                ))}
                <div className="w-10 h-px bg-slate-300 my-1"></div>
                {constructionToolsConfig.map(t => (
                    <button key={t.id} onClick={() => handleToolChange(t.id)} className={`p-2 rounded-lg transition-all ${tool === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`} title={t.label}>
                        <t.icon size={22} strokeWidth={tool === t.id ? 2.5 : 2} />
                    </button>
                ))}
            </div>

            <div 
                className="flex-1 relative bg-white cursor-crosshair"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {pickingMirrorMode && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium animate-bounce pointer-events-none">
                        Select a line to mirror across
                    </div>
                )}

                <svg ref={svgRef} className="w-full h-full touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={(e) => e.preventDefault()}>
                    <defs>
                       <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1"/></pattern>
                    </defs>
                    {axisConfig.showGrid && <rect width="100%" height="100%" fill="url(#grid)" />}
                    <AxisLayer config={axisConfig} width={canvasSize.width} height={canvasSize.height} />
                    {shapes.map(shape => {
                        // FIX: Hide underlying text while editing to prevent ghosting
                        const displayShape = (textEditing && textEditing.id === shape.id) ? { ...shape, text: '' } : shape;
                        return <ShapeRenderer key={shape.id} shape={displayShape} isSelected={selectedIds.has(shape.id)} />
                    })}
                    {tool === ToolType.COMPASS && <CompassOverlay center={compassState.center} cursor={cursorPos || {x:0, y:0}} radiusPoint={compassState.radiusPoint} isDrawing={!!compassState.startAngle} />}
                    {tool === ToolType.RULER && selectedIds.size === 0 && <RulerOverlay start={null} cursor={cursorPos || {x:0,y:0}} end={null} />}
                    {compassPreviewPath && <path d={compassPreviewPath} fill="none" stroke={currentStyle.stroke} strokeWidth={currentStyle.strokeWidth} strokeDasharray="4,4" opacity={0.6} />}
                    {shapes.filter(s => selectedIds.has(s.id)).map(s => {
                        // FIX 1: Don't render overlay if text is editing
                        if (textEditing && textEditing.id === s.id) return null;
                        return <SelectionOverlay key={'sel-' + s.id} shape={s} isSelected={true} pivotIndex={pivotIndex} isAltPressed={isAltPressed} isMarkingAngles={markingAnglesMode} onResizeStart={(idx, e) => { e.stopPropagation(); setDragHandleIndex(idx); setIsDragging(true); }} onRotateStart={(e) => handleRotateStart(e, s)} onSetPivot={(idx) => setPivotIndex(idx)} onMarkAngle={(idx) => handleCornerClick(s.id, idx)} onAngleChange={() => {}} onAngleDoubleClick={(idx, e) => handleAngleDoubleClick(s.id, idx, e)} />
                    })}
                    {snapIndicator && <circle cx={snapIndicator.x} cy={snapIndicator.y} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />}
                    {selectionBox && <rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth={1} />}
                </svg>
                {textEditing && (
                    <div style={{ position: 'absolute', left: textEditing.x, top: textEditing.y, transform: 'translate(0, -50%)' }}>
                        <input ref={inputRef} type="text" value={textEditing.text} 
                        onChange={(e) => { 
                            const val = e.target.value; 
                            setTextEditing(prev => prev ? ({...prev, text: val}) : null); 
                            // Removed setShapes call to prevent real-time ghosting
                        }} 
                        onKeyDown={(e) => { 
                            if(e.key === 'Enter') { 
                                saveHistory(); // Save before committing changes
                                setShapes(prev => prev.map(s => s.id === textEditing.id ? { ...s, text: textEditing.text } : s));
                                setTextEditing(null); 
                                setSelectedIds(new Set()); // Deselect after confirmation
                            } 
                        }} 
                        onBlur={() => {
                            saveHistory(); // Save before committing changes
                            setShapes(prev => prev.map(s => s.id === textEditing.id ? { ...s, text: textEditing.text } : s));
                            setTextEditing(null);
                        }} 
                        className="bg-transparent border border-blue-500 rounded px-1 py-0.5 text-lg font-sans outline-none" style={{ color: currentStyle.stroke, minWidth: '50px' }} autoFocus />
                        <div className="absolute top-full left-0 bg-white shadow-lg border rounded p-1 flex gap-1 mt-1 z-50 w-64 flex-wrap">
                            {MATH_SYMBOLS.map(sym => (
                                <button key={sym} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSymbolClick(sym)} className="hover:bg-gray-100 p-1 rounded text-sm min-w-[20px]">{sym}</button>
                            ))}
                        </div>
                    </div>
                )}
                {angleEditing && (
                    <div style={{ position: 'absolute', left: angleEditing.x, top: angleEditing.y, transform: 'translate(-50%, -50%)' }}>
                        <input 
                            ref={angleInputRef}
                            type="number" 
                            value={angleEditing.value} 
                            onChange={(e) => setAngleEditing(prev => prev ? ({ ...prev, value: e.target.value }) : null)}
                            onKeyDown={(e) => { 
                                if (e.key === 'Enter') handleAngleUpdate(angleEditing.value); 
                                if (e.key === 'Escape') setAngleEditing(null);
                            }}
                            onBlur={() => setAngleEditing(null)}
                            className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm font-sans shadow-lg outline-none w-20 text-center"
                        />
                    </div>
                )}
            </div>
            {/* Sidebar code follows... */}
            <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto z-10 custom-scrollbar">
                
                {selectedShape?.type === ShapeType.MARKER && selectedShape.markerConfig && (
                    <div className="p-5 border-b border-slate-100">
                         <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm uppercase tracking-wide">
                            <Radius size={16} /> Marker Type
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => updateMarkerType('angle_arc')} 
                                className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.markerConfig?.type === 'angle_arc' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                Arc
                            </button>
                            <button 
                                onClick={() => updateMarkerType('perpendicular')} 
                                className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.markerConfig?.type === 'perpendicular' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                Right Angle
                            </button>
                        </div>
                    </div>
                )}

                {selectedShape?.type === ShapeType.FUNCTION_GRAPH && selectedShape.formulaParams && (
                    <div className="p-5 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm uppercase tracking-wide">
                            <FunctionSquare size={16} /> Function Properties
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                            <button onClick={() => toggleFunctionForm('standard')} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.functionForm === 'standard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Standard</button>
                            <button onClick={() => toggleFunctionForm('vertex')} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.functionForm === 'vertex' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Vertex</button>
                        </div>
                        {selectedShape.functionForm === 'standard' ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2"><span className="w-6 font-bold text-slate-500">a</span><input type="number" step="0.1" value={selectedShape.formulaParams.a} onChange={(e) => updateFunctionParam('a', e.target.value)} className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" /></div>
                                <div className="flex items-center gap-2"><span className="w-6 font-bold text-slate-500">b</span><input type="number" step="0.1" value={selectedShape.formulaParams.b} onChange={(e) => updateFunctionParam('b', e.target.value)} className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" /></div>
                                <div className="flex items-center gap-2"><span className="w-6 font-bold text-slate-500">c</span><input type="number" step="0.1" value={selectedShape.formulaParams.c} onChange={(e) => updateFunctionParam('c', e.target.value)} className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" /></div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2"><span className="w-6 font-bold text-slate-500">h</span><input type="number" step="0.1" value={selectedShape.formulaParams.h || 0} onChange={(e) => updateFunctionParam('h', e.target.value)} className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" /></div>
                                <div className="flex items-center gap-2"><span className="w-6 font-bold text-slate-500">k</span><input type="number" step="0.1" value={selectedShape.formulaParams.k || 0} onChange={(e) => updateFunctionParam('k', e.target.value)} className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" /></div>
                            </div>
                        )}
                        <div className="mt-4 p-2 bg-slate-50 rounded text-center font-mono text-sm text-blue-600">
                            {selectedShape.functionForm === 'standard' 
                                ? `y = ${selectedShape.formulaParams.a}x² + ${selectedShape.formulaParams.b}x + ${selectedShape.formulaParams.c}`
                                : `y = ${selectedShape.formulaParams.a}(x - ${selectedShape.formulaParams.h || 0})² + ${selectedShape.formulaParams.k || 0}`
                            }
                        </div>
                    </div>
                )}

                <div className="p-5 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm uppercase tracking-wide">
                        <Grid3X3 size={16} /> Coordinate System
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm text-slate-600 font-medium">Show Axes</label>
                        <input type="checkbox" checked={axisConfig.visible} onChange={(e) => setAxisConfig(prev => ({ ...prev, visible: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm text-slate-600 font-medium">Show Grid</label>
                        <input type="checkbox" checked={axisConfig.showGrid} onChange={(e) => setAxisConfig(prev => ({ ...prev, showGrid: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    </div>
                     <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500 uppercase font-semibold">
                            <span>Ticks Density</span>
                            <span>{axisConfig.ticks}</span>
                        </div>
                        <input type="range" min="2" max="20" value={axisConfig.ticks} onChange={(e) => setAxisConfig(prev => ({ ...prev, ticks: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                </div>
                
                <div className="p-5 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm uppercase tracking-wide">
                        <Sparkles size={16} /> Smart Tools
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button onClick={() => setAutoLabelMode(!autoLabelMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${autoLabelMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            <CaseUpper size={16} /> Auto AB
                        </button>
                        <button onClick={() => setSmartSketchMode(!smartSketchMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${smartSketchMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            <Wand2 size={16} /> Sketch Fix
                        </button>
                         <button onClick={() => setMarkingAnglesMode(!markingAnglesMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${markingAnglesMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            <Radius size={16} /> Angles
                        </button>
                         <button onClick={() => setPickingMirrorMode(!pickingMirrorMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${pickingMirrorMode ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            <FoldHorizontal size={16} /> Mirror
                        </button>
                    </div>

                    {/* Integrated Angles Section */}
                    {selectedShape && [ShapeType.TRIANGLE, ShapeType.POLYGON, ShapeType.RECTANGLE, ShapeType.SQUARE].includes(selectedShape.type) && (
                        <div className="border-t border-slate-100 pt-3">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Corner Markers</div>
                            <div className="space-y-1">
                                {selectedShape.points.map((_, i) => {
                                    // For Triangles, only show 3. For others, show all.
                                    if (selectedShape.type === ShapeType.TRIANGLE && i > 2) return null;
                                    
                                    const m = getMarkerForCorner(selectedShape.id, i);
                                    const isPerp = m?.markerConfig?.type === 'perpendicular';
                                    
                                    return (
                                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded">
                                            <span className="text-slate-600 font-medium">Angle {String.fromCharCode(65 + i)}</span>
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={() => handleCornerClick(selectedShape.id, i)}
                                                    className={`px-1.5 py-0.5 rounded border transition-colors ${m ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {m ? 'On' : 'Off'}
                                                </button>
                                                {m && (
                                                    <button 
                                                        onClick={() => handleCornerClick(selectedShape.id, i)} // Toggles type by re-clicking
                                                        className={`w-6 h-6 flex items-center justify-center rounded border font-bold transition-colors ${isPerp ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-200 text-slate-500'}`}
                                                        title="Toggle Right Angle"
                                                    >
                                                        {isPerp ? '∟' : '◠'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-5 border-b border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Stroke Color</label>
                    <div className="grid grid-cols-5 gap-2">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => handleStyleChange('stroke', c)} className={`w-8 h-8 rounded-full border border-slate-200 relative focus:outline-none transition-transform active:scale-95 ${currentStyle.stroke === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}>
                                {c === 'transparent' && <div className="absolute inset-0 bg-red-500 w-[1px] h-full left-1/2 -translate-x-1/2 rotate-45" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-b border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Fill Color</label>
                    <div className="grid grid-cols-5 gap-2">
                        {COLORS.map(c => (
                             <button key={c} onClick={() => handleStyleChange('fill', c)} className={`w-8 h-8 rounded-full border border-slate-200 relative focus:outline-none transition-transform active:scale-95 ${currentStyle.fill === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}>
                                {c === 'transparent' && <div className="absolute inset-0 bg-red-500 w-[1px] h-full left-1/2 -translate-x-1/2 rotate-45" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-b border-slate-100">
                    <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        <span>Stroke Width</span>
                        <span className="text-slate-600">{currentStyle.strokeWidth}px</span>
                    </div>
                     <div className="flex items-center space-x-2">
                        <Minus size={14} className="text-slate-400"/>
                        <input type="range" min="1" max="10" value={currentStyle.strokeWidth} onChange={(e) => handleStyleChange('strokeWidth', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                        <Plus size={14} className="text-slate-400"/>
                    </div>
                </div>

                <div className="p-5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Line Style</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {['solid', 'dashed', 'dotted'].map((type) => (
                            <button key={type} onClick={() => handleStyleChange('strokeType', type as any)} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${currentStyle.strokeType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".geo,.json" className="hidden" />
        <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
    </div>
  );
}
