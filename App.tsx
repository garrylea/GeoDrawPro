
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, Constraint } from './types';
import { TOOL_CONFIG, COLORS, DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from './constants';
import { AxisLayer } from './components/AxisLayer';
import { ShapeRenderer } from './components/ShapeRenderer';
import { SelectionOverlay } from './components/SelectionOverlay';
import { CompassOverlay, RulerOverlay } from './components/ConstructionTools';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { loadProject, isElectron } from './utils/exportUtils';
import { getSnapPoint, distance, isShapeInRect, getShapeCenter, getRotatedCorners, rotatePoint, reflectPointAcrossLine, getAngleDegrees, getAngleArcPath, recognizeFreehandShape, recalculateMarker, getClosestPointOnShape, getPixelsPerUnit, evaluateQuadratic, mathToScreen, screenToMath, generateQuadraticPath, isPointInShape, getPolygonAngles, getLineIntersection, fitShapesToViewport } from './utils/mathUtils';
import { SnippetOverlay } from './components/SnippetOverlay';
import { SolverWindow } from './components/SolverWindow';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const isSnippetMode = mode === 'snippet';
  const isSolverMode = mode === 'solver';

  useLayoutEffect(() => {
    if (isSnippetMode) {
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
    } else if (isSolverMode) {
        document.body.style.backgroundColor = '#ffffff';
    } else {
        document.body.style.backgroundColor = '#f8fafc';
    }
  }, [isSnippetMode, isSolverMode]);

  useEffect(() => {
    if (isSnippetMode || isSolverMode) return;
    const handleSecretKey = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            if (isElectron()) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('OPEN_SOLVER');
            } else {
                const url = `${window.location.origin}${window.location.pathname}?mode=solver`;
                window.open(url, 'MathSolver', 'width=500,height=700,menubar=no,toolbar=no,location=no,status=no');
            }
        }
    };
    window.addEventListener('keydown', handleSecretKey);
    return () => window.removeEventListener('keydown', handleSecretKey);
  }, [isSnippetMode, isSolverMode]);

  if (isSnippetMode) return <SnippetOverlay />;
  if (isSolverMode) return <SolverWindow />;

  return <Editor />;
}

function Editor() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);
  const [clipboard, setClipboard] = useState<Shape[]>([]);
  
  const [currentStyle, setCurrentStyle] = useState<{
      fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted'
  }>({ ...DEFAULT_SHAPE_PROPS, strokeType: 'solid' });

  const [axisConfig, setAxisConfig] = useState<AxisConfig>({
    visible: false, ticks: 5, color: '#94a3b8', showGrid: false,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null); 
  const [dragHandleIndex, setDragHandleIndex] = useState<number | null>(null); 
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null); 
  const cursorPosRef = useRef<Point | null>(null);
  
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [hoveredConstraint, setHoveredConstraint] = useState<Constraint | null>(null);
  
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(true); 
  const [smartSketchMode, setSmartSketchMode] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

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
  const canvasSizeRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const pixelsPerUnit = getPixelsPerUnit(canvasSize.width, canvasSize.height, axisConfig.ticks);

  const generateId = () => Math.random().toString(36).substr(2, 9);
  const saveHistory = () => setHistory(prev => [...prev, shapes]);

  useEffect(() => {
    const updateCanvasSize = () => {
        if (!svgRef.current) return;
        const { clientWidth, clientHeight } = svgRef.current;
        const oldW = canvasSizeRef.current.width;
        const oldH = canvasSizeRef.current.height;

        const wasLandscape = oldW > oldH;
        const isLandscape = clientWidth > clientHeight;

        setShapes(prev => {
            if (prev.length === 0) return prev;
            if (wasLandscape !== isLandscape) {
                return fitShapesToViewport(prev, clientWidth, clientHeight);
            } else {
                const dx = (clientWidth - oldW) / 2;
                const dy = (clientHeight - oldH) / 2;
                if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return prev;
                return prev.map(s => {
                    if (s.type === ShapeType.FUNCTION_GRAPH) return s;
                    return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                });
            }
        });

        canvasSizeRef.current = { width: clientWidth, height: clientHeight };
        setCanvasSize({ width: clientWidth, height: clientHeight });
    };

    updateCanvasSize();
    const observer = new ResizeObserver(() => updateCanvasSize());
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
      setShapes(prev => prev.map(s => {
          if (s.type === ShapeType.FUNCTION_GRAPH && s.formulaParams) {
              const newPath = generateQuadraticPath(s.formulaParams, s.functionForm || 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit);
              return { ...s, pathData: newPath };
          }
          return s;
      }));
  }, [canvasSize.width, canvasSize.height, axisConfig.ticks, pixelsPerUnit]);

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
              const maxDim = 300;
              let finalW = width;
              let finalH = height;
              if (width > maxDim || height > maxDim) {
                  const ratio = width / height;
                  if (width > height) { finalW = maxDim; finalH = maxDim / ratio; }
                  else { finalH = maxDim; finalW = maxDim * ratio; }
              }
              const centerX = position ? position.x : canvasSize.width / 2;
              const centerY = position ? position.y : canvasSize.height / 2;
              const newShape: Shape = {
                  id, type: ShapeType.IMAGE,
                  points: [{x: centerX - finalW/2, y: centerY - finalH/2}, {x: centerX + finalW/2, y: centerY + finalH/2}],
                  imageUrl: url, fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0
              };
              setShapes(prev => [...prev, newShape]);
              setSelectedIds(new Set([id]));
              setTool(ToolType.SELECT);
          }
          img.src = url;
      };
      reader.readAsDataURL(file);
  }, [canvasSize.height, canvasSize.width]);

  useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
          if (e.clipboardData?.items) {
              for (let i = 0; i < e.clipboardData.items.length; i++) {
                  const item = e.clipboardData.items[i];
                  if (item.type.indexOf('image') !== -1) {
                      const file = item.getAsFile();
                      if (file) {
                          e.preventDefault(); 
                          processImageFile(file, cursorPosRef.current || undefined);
                      }
                  }
              }
          }
      };
      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [processImageFile]);

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
          if (!used.has(label)) { result.push(label); used.add(label); }
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
          if (idsToDelete.has(s.id)) return false;
          if (s.constraint && idsToDelete.has(s.constraint.parentId || '')) return false;
          if (s.type === ShapeType.MARKER && s.markerConfig && idsToDelete.has(s.markerConfig.targets[0].shapeId)) return false;
          return true;
      }));
      setSelectedIds(new Set<string>());
  };

  const clearAll = () => {
    saveHistory();
    setShapes([]);
    setHistory([]);
    setSelectedIds(new Set());
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);
          if (e.key === 'Shift') setIsShiftPressed(true);
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT') return;
          if (textEditing || angleEditing) return;

          if (selectedIds.size > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              const step = 1;
              const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
              const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
              saveHistory();
              setShapes(prev => {
                  const movedShapes = prev.map(s => {
                      if (selectedIds.has(s.id)) {
                          if (s.type === ShapeType.FUNCTION_GRAPH) return s;
                          const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                          return { ...s, points: newPoints };
                      }
                      return s;
                  });
                  return movedShapes.map(s => {
                       if (s.type === ShapeType.MARKER && s.markerConfig) {
                           const targetId = s.markerConfig.targets[0].shapeId;
                           const updatedTarget = movedShapes.find(ms => ms.id === targetId);
                           if (updatedTarget) return recalculateMarker(s, movedShapes) || s;
                       }
                       return s;
                  });
              });
              return;
          }
          if (e.key === 'a' || e.key === 'A') { setTool(ToolType.SELECT); return; }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
              const selected = shapes.filter(s => selectedIds.has(s.id));
              if (selected.length > 0) setClipboard(JSON.parse(JSON.stringify(selected)));
              return;
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
              if (clipboard.length === 0) return;
              saveHistory();
              const offset = 20;
              const newShapes: Shape[] = [];
              const newIds = new Set<string>();
              clipboard.forEach(s => {
                  const newId = generateId();
                  newIds.add(newId);
                  const newShape = { ...s, id: newId };
                  if (newShape.points) newShape.points = newShape.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
                  delete newShape.constraint;
                  delete newShape.markerConfig;
                  newShapes.push(newShape);
              });
              setShapes(prev => [...prev, ...newShapes]);
              setSelectedIds(newIds);
              setTool(ToolType.SELECT);
              return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
          if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelectedIds(new Set(shapes.map(s => s.id))); return; }
          if (e.key === 'Escape') {
              if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
              if (markingAnglesMode) { setMarkingAnglesMode(false); return; }
              if (activeShapeId) { setShapes(prev => prev.filter(s => s.id !== activeShapeId)); setActiveShapeId(null); setIsDragging(false); setTool(ToolType.SELECT); return; }
              if (tool === ToolType.COMPASS && compassState.center) { setCompassState({ center: null, radiusPoint: null, startAngle: null }); setCompassPreviewPath(null); return; }
              if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
              if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
          }
          if ((e.key === 'Delete' || e.key === 'Backspace')) { deleteSelected(); }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(false);
          if (e.key === 'Shift') setIsShiftPressed(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedIds, textEditing, angleEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, tool, compassState, clipboard]); 

  const getMousePos = (e: React.MouseEvent | MouseEvent, snap: boolean = true): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const raw = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (tool === ToolType.FREEHAND) { setSnapIndicator(null); return raw; }
    if (snap && !isShiftPressed && !isAltPressed) { 
        const exclude = activeShapeId ? [activeShapeId] : [];
        const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) ? { width: canvasSize.width, height: canvasSize.height, ppu: pixelsPerUnit } : undefined;
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
    setSnapIndicator(null); setHoveredConstraint(null); return raw;
  };

  const getHitShape = (pos: Point, shapesList: Shape[]) => {
      const hits = shapesList.filter(s => isPointInShape(pos, s, canvasSize.width, canvasSize.height, pixelsPerUnit));
      if (hits.length === 0) return null;
      const points = hits.filter(s => s.type === ShapeType.POINT || s.type === ShapeType.MARKER);
      if (points.length > 0) {
          points.sort((a,b) => distance(pos, getClosestPointOnShape(pos, a)) - distance(pos, getClosestPointOnShape(pos, b)));
          return points[0];
      }
      const lines = hits.filter(s => s.type === ShapeType.LINE || s.type === ShapeType.FUNCTION_GRAPH);
      if (lines.length > 0) {
           lines.sort((a,b) => distance(pos, getClosestPointOnShape(pos, a)) - distance(pos, getClosestPointOnShape(pos, b)));
           return lines[0];
      }
      hits.sort((a, b) => distance(pos, getClosestPointOnShape(pos, a)) - distance(pos, getClosestPointOnShape(pos, b)));
      return hits[0];
  };

  const handleToolChange = (newTool: ToolType) => {
    if (newTool === ToolType.IMAGE) { imageInputRef.current?.click(); return; }
    setTool(newTool); setSelectedIds(new Set()); setSnapIndicator(null); setCursorPos(null);
    setSelectionBox(null); setActiveShapeId(null); setTextEditing(null); setAngleEditing(null);
    setPickingMirrorMode(false); setMarkingAnglesMode(false); setHoveredShapeId(null);
    setCompassState({ center: null, radiusPoint: null, startAngle: null }); setCompassPreviewPath(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEditing || angleEditing) return;
    let pos = getMousePos(e, true);
    const rawPos = getMousePos(e, false);
    if (tool !== ToolType.SELECT && tool !== ToolType.COMPASS && tool !== ToolType.ERASER && tool !== ToolType.RULER && !pickingMirrorMode && !markingAnglesMode) setSelectedIds(new Set());
    if (tool === ToolType.ERASER) { saveHistory(); setIsDragging(true); const hit = getHitShape(rawPos, shapes); if (hit) { setShapes(prev => prev.filter(s => (s.id !== hit.id && !(s.constraint?.parentId === hit.id) && !(s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === hit.id)))); } return; }
    if (tool === ToolType.COMPASS) { if (!compassState.center) { setCompassState({ ...compassState, center: pos }); } else { setCompassState({ ...compassState, radiusPoint: pos, startAngle: getAngleDegrees(compassState.center, pos) }); } return; }
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
        // 20 major ticks * 20px per major tick = 400px length
        const width = 400, height = 40; 
        const center = pos; 
        const newShape: Shape = { id, type: ShapeType.RULER, points: [{ x: center.x - width/2, y: center.y - height/2 }, { x: center.x + width/2, y: center.y + height/2 }], fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, rotation: 0 }; 
        setShapes(prev => [...prev, newShape]); 
        setSelectedIds(new Set([id])); 
        setTool(ToolType.SELECT); 
        return; 
    }
    if (pickingMirrorMode) { const line = shapes.find(s => (s.type === ShapeType.LINE || s.type === ShapeType.FREEHAND) && distance(pos, getClosestPointOnShape(pos, s)) < 10); if (line) handleFold(line.id); return; }
    if (tool === ToolType.FUNCTION) { saveHistory(); const id = generateId(); const offset = shapes.filter(s => s.type === ShapeType.FUNCTION_GRAPH).length * 2; const params = { a: 1, b: 0, c: offset, h: 0, k: offset }; const pathData = generateQuadraticPath(params, 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit); const newShape: Shape = { id, type: ShapeType.FUNCTION_GRAPH, points: [], formulaParams: params, functionForm: 'standard', pathData, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0 }; setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); return; }
    if (tool === ToolType.SELECT) { 
        const hit = getHitShape(rawPos, shapes); 
        if (hit) { 
            saveHistory(); 
            if (e.altKey) { 
                const newId = generateId(); 
                const clonedShape = { ...hit, id: newId }; 
                setShapes(prev => [...prev, clonedShape]); 
                setSelectedIds(new Set([newId])); 
                setDragStartPos(rawPos); 
                setIsDragging(true); 
                return; 
            } 
            const newSel = new Set(e.shiftKey || e.ctrlKey ? selectedIds : []); 
            newSel.add(hit.id); 
            setSelectedIds(newSel); 
            setDragStartPos(rawPos); 
            setIsDragging(true); 
            return; 
        } 
        if (!e.shiftKey && !e.ctrlKey) { setSelectedIds(new Set()); } 
        setSelectionBox({ start: rawPos, current: rawPos }); 
        setIsDragging(true); 
        return; 
    }
    saveHistory(); 
    if (tool === ToolType.PROTRACTOR) { const existingProtractor = shapes.find(s => s.type === ShapeType.PROTRACTOR); if (existingProtractor) { setSelectedIds(new Set([existingProtractor.id])); setDragStartPos(rawPos); setIsDragging(true); return; } const id = generateId(); const newShape: Shape = { id, type: ShapeType.PROTRACTOR, points: [{ x: pos.x - 150, y: pos.y - 150 }, { x: pos.x + 150, y: pos.y }], fill: 'transparent', stroke: currentStyle.stroke, strokeWidth: 1, rotation: 0 }; setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setDragStartPos(rawPos); setIsDragging(true); return; }
    if (tool === ToolType.TEXT) { e.preventDefault(); const id = generateId(); const newShape: Shape = { id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }; setShapes(prev => [...prev, newShape]); setTextEditing({ id, x: pos.x, y: pos.y, text: '' }); setSelectedIds(new Set<string>([id])); return; }
    if (tool === ToolType.LINE) { if (activeShapeId) { setShapes(prev => prev.map(s => s.id === activeShapeId ? { ...s, points: [...s.points.slice(0, -1), pos] } : s)); setActiveShapeId(null); setDragStartPos(null); return; } else { setDragStartPos(rawPos); const id = generateId(); const newShape: Shape = { id, type: ShapeType.LINE, points: [pos, pos], fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }; setShapes(prev => [...prev, newShape]); setActiveShapeId(id); return; } }
    setDragStartPos(rawPos); setIsDragging(true); const id = generateId(); let points: Point[] = [pos, pos]; if (tool === ToolType.TRIANGLE) points = [pos, pos, pos]; if (tool === ToolType.POINT || tool === ToolType.FREEHAND) points = [pos];
    let labels: string[] | undefined = autoLabelMode ? getNextLabels(tool === ToolType.TRIANGLE ? 3 : (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE ? 4 : points.length)) : undefined;
    const newShape: Shape = { id, type: tool as unknown as ShapeType, points, labels, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 };
    if (tool === ToolType.POINT && hoveredConstraint) newShape.constraint = hoveredConstraint;
    setShapes(prev => [...prev, newShape]); setActiveShapeId(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e, true); const rawPos = getMousePos(e, false); setCursorPos(rawPos); cursorPosRef.current = rawPos;
    if (tool === ToolType.COMPASS && compassState.radiusPoint) { const radius = distance(compassState.center!, compassState.radiusPoint); const angleRad = Math.atan2(rawPos.y - compassState.center!.y, rawPos.x - compassState.center!.x); const startRad = (compassState.startAngle! * Math.PI) / 180; const arcEnd = { x: compassState.center!.x + radius * Math.cos(angleRad), y: compassState.center!.y + radius * Math.sin(angleRad) }; const arcStart = { x: compassState.center!.x + radius * Math.cos(startRad), y: compassState.center!.y + radius * Math.sin(startRad) }; setCompassPreviewPath(getAngleArcPath(compassState.center!, arcStart, arcEnd, radius)); return; }
    if (tool === ToolType.ERASER && isDragging) { const hit = getHitShape(rawPos, shapes); if (hit) setShapes(prev => prev.filter(s => (s.id !== hit.id && !(s.constraint?.parentId === hit.id) && !(s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === hit.id)))); return; }
    if (tool === ToolType.SELECT && selectionBox && isDragging) { setSelectionBox(prev => prev ? ({ ...prev, current: rawPos }) : null); const box = { start: selectionBox.start, end: rawPos }; const newSelection = new Set<string>(); shapes.forEach(s => { if (isShapeInRect(s, box)) newSelection.add(s.id); }); setSelectedIds(newSelection); return; }
    if (isRotating && rotationCenter && activeShapeId === null) { const currentAngle = Math.atan2(rawPos.y - rotationCenter.y, rawPos.x - rotationCenter.x) * (180 / Math.PI); const delta = currentAngle - lastRotationMouseAngle.current; lastRotationMouseAngle.current = currentAngle; setShapes(prev => { const rotatedShapes = prev.map(s => { if (!selectedIds.has(s.id)) return s; let newRotation = (s.rotation || 0) + delta; if (isShiftPressed) newRotation = Math.round(newRotation / 15) * 15; if (pivotIndex === 'center') return { ...s, rotation: newRotation }; const oldCenter = getShapeCenter(s.points, s.type, s.fontSize, s.text); const newCenter = rotatePoint(oldCenter, rotationCenter, delta); const dx = newCenter.x - oldCenter.x, dy = newCenter.y - oldCenter.y; return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })), rotation: newRotation }; }); return rotatedShapes.map(s => (s.type === ShapeType.MARKER && s.markerConfig && selectedIds.has(s.markerConfig.targets[0].shapeId)) ? (recalculateMarker(s, rotatedShapes) || s) : s); }); return; }
    if (!isDragging) { const hit = getHitShape(rawPos, shapes); setHoveredShapeId(hit ? hit.id : null); }
    if (dragHandleIndex !== null && selectedIds.size === 1) {
        const id = (Array.from(selectedIds) as string[])[0];
        setShapes(prev => {
            const resizedShapes = prev.map(s => {
                if (s.id !== id) return s;
                if (s.type === ShapeType.FREEHAND && dragHandleIndex !== null && dragHandleIndex < 4) {
                     const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
                     const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), w = maxX - minX, h = maxY - minY;
                     if (w === 0 || h === 0) return s;
                     const corners = [ { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY } ];
                     const fixedPoint = corners[(dragHandleIndex + 2) % 4];
                     let targetPos = pos;
                     if (isShiftPressed) { const ratio = w / h, dx = targetPos.x - fixedPoint.x, dy = targetPos.y - fixedPoint.y; if (Math.abs(dx) / Math.abs(dy) > ratio) { targetPos.y = fixedPoint.y + (dy > 0 ? Math.abs(dx) / ratio : -Math.abs(dx) / ratio); } else { targetPos.x = fixedPoint.x + (dx > 0 ? Math.abs(dy) * ratio : -Math.abs(dy) * ratio); } }
                     const nMinX = Math.min(fixedPoint.x, targetPos.x), nMinY = Math.min(fixedPoint.y, targetPos.y), nW = Math.abs(targetPos.x - fixedPoint.x), nH = Math.abs(targetPos.y - fixedPoint.y);
                     return { ...s, points: s.points.map(p => ({ x: nMinX + ((p.x - minX) / w) * nW, y: nMinY + ((p.y - minY) / h) * nH })) };
                }
                if (s.type === ShapeType.TEXT) { const center = getShapeCenter(s.points, s.type, s.fontSize, s.text); return { ...s, fontSize: Math.max(8, Math.round(distance(center, rawPos) / 2)) }; }
                const isBoxShape = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.IMAGE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.RULER].includes(s.type);
                if (isBoxShape && s.points.length === 2) {
                     const p0 = s.points[0], p1 = s.points[1], minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x), minY = Math.min(p0.y, p1.y), maxY = Math.max(p0.y, p1.y), corners = [ { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY } ];
                     if (dragHandleIndex !== null && dragHandleIndex >= 0 && dragHandleIndex < 4) {
                         const fixedPoint = corners[(dragHandleIndex + 2) % 4]; let targetPos = pos;
                         // Specific logic for Ruler: Lock height
                         if (s.type === ShapeType.RULER) {
                             const currentHeight = Math.abs(p1.y - p0.y);
                             const sign = Math.sign(targetPos.y - fixedPoint.y) || 1;
                             return { ...s, points: [fixedPoint, { x: targetPos.x, y: fixedPoint.y + sign * currentHeight }] };
                         }
                         if (isShiftPressed || s.type === ShapeType.SQUARE || s.type === ShapeType.CIRCLE) { const w = maxX - minX, h = maxY - minY; if (w > 0 && h > 0) { const ratio = w / h, dx = targetPos.x - fixedPoint.x, dy = targetPos.y - fixedPoint.y; if (Math.abs(dx) / Math.abs(dy) > ratio) { targetPos.y = fixedPoint.y + (dy > 0 ? Math.abs(dx) / ratio : -Math.abs(dx) / ratio); } else { targetPos.x = fixedPoint.x + (dx > 0 ? Math.abs(dy) * ratio : -Math.abs(dy) * ratio); } } }
                         return { ...s, points: [fixedPoint, targetPos] };
                     }
                }
                const newPoints = [...s.points]; if (dragHandleIndex !== null && dragHandleIndex < newPoints.length) newPoints[dragHandleIndex] = pos; return { ...s, points: newPoints };
            });
            return resizedShapes.map(s => (s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === id) ? (recalculateMarker(s, resizedShapes) || s) : s);
        });
        return;
    }
    if (activeShapeId) { setShapes(prev => prev.map(s => { if (s.id !== activeShapeId) return s; let newPoints = [...s.points]; newPoints[newPoints.length - 1] = pos; if (s.type === ShapeType.SQUARE || s.type === ShapeType.CIRCLE) { const d = Math.max(Math.abs(pos.x - s.points[0].x), Math.abs(pos.y - s.points[0].y)), sx = pos.x > s.points[0].x ? 1 : -1, sy = pos.y > s.points[0].y ? 1 : -1; newPoints[1] = { x: s.points[0].x + d * sx, y: s.points[0].y + d * sy }; } else if (s.type === ShapeType.TRIANGLE) { newPoints[1] = { x: s.points[0].x, y: pos.y }; newPoints[2] = pos; } else if (s.type === ShapeType.FREEHAND) { newPoints = [...s.points, pos]; } return { ...s, points: newPoints }; })); } 
    else if (selectedIds.size > 0 && dragStartPos && isDragging) {
        const dx = rawPos.x - dragStartPos.x, dy = rawPos.y - dragStartPos.y; setDragStartPos(rawPos);
        setShapes(prev => {
            const drivingPoints: Point[] = []; prev.forEach(s => { if (selectedIds.has(s.id) && s.type === ShapeType.POINT) drivingPoints.push(s.points[0]); });
            const movedShapes = prev.map(s => {
                if (selectedIds.has(s.id)) return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                if (drivingPoints.length > 0 && !s.constraint) { const linkedPoints = s.points.map(p => drivingPoints.some(dp => Math.abs(dp.x - p.x) < 5.0 && Math.abs(dp.y - p.y) < 5.0) ? { x: p.x + dx, y: p.y + dy } : p); if (linkedPoints.some((lp, i) => lp.x !== s.points[i].x || lp.y !== s.points[i].y)) return { ...s, points: linkedPoints }; }
                return s;
            });
            return movedShapes.map(s => (s.type === ShapeType.MARKER && s.markerConfig) ? (recalculateMarker(s, movedShapes) || s) : s);
        });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      setIsDragging(false); setIsRotating(false); setDragHandleIndex(null); setSelectionBox(null);
      const rawPos = getMousePos(e, false);
      if (tool === ToolType.COMPASS) { if (compassPreviewPath) { saveHistory(); const center = compassState.center!, radius = distance(center, compassState.radiusPoint!), startAngle = compassState.startAngle!, endAngle = getAngleDegrees(center, rawPos), arcPoints = []; const step = (endAngle - startAngle) / 20; for(let i=0; i<=20; i++) { const rad = ((startAngle + step * i) * Math.PI) / 180; arcPoints.push({ x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) }); } setShapes(prev => [...prev, { id: generateId(), type: ShapeType.PATH, points: [center, ...arcPoints], pathData: compassPreviewPath, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0, isConstruction: true }]); } setCompassState(prev => ({ ...prev, radiusPoint: null, startAngle: null })); setCompassPreviewPath(null); return; }
      if (activeShapeId && tool === ToolType.LINE) { if (dragStartPos && distance(dragStartPos, rawPos) > 5) setActiveShapeId(null); setDragStartPos(null); return; }
      setDragStartPos(null);
      if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) { const shape = shapes.find(s => s.id === activeShapeId); if (shape && shape.points.length > 5) { const recognized = recognizeFreehandShape(shape.points); if (recognized) { setShapes(prev => prev.map(s => s.id === activeShapeId ? { ...s, type: recognized.type, points: recognized.points, labels: autoLabelMode ? getNextLabels(recognized.type === ShapeType.TRIANGLE ? 3 : 4) : undefined } : s)); } } }
      if (activeShapeId) {
          const s = shapes.find(sh => sh.id === activeShapeId);
          if (s && distance(s.points[0], rawPos) < 10) {
              const cx = rawPos.x, cy = rawPos.y;
              if (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE) { const wPx = 2 * pixelsPerUnit, hPx = (tool === ToolType.SQUARE ? 2 : 1) * pixelsPerUnit; setShapes(prev => prev.map(sh => sh.id === activeShapeId ? { ...sh, points: [{ x: cx - wPx/2, y: cy - hPx/2 }, { x: cx + wPx/2, y: cy + hPx/2 }] } : sh)); }
              else if (tool === ToolType.TRIANGLE) { const sizePx = 2 * pixelsPerUnit; setShapes(prev => prev.map(sh => sh.id === activeShapeId ? { ...sh, points: [{ x: cx, y: cy - sizePx/2 }, { x: cx + sizePx/2, y: cy + sizePx/2 }, { x: cx - sizePx/2, y: cy + sizePx/2 }] } : sh)); }
              else if (tool === ToolType.CIRCLE || tool === ToolType.ELLIPSE) { const wHalf = (tool === ToolType.CIRCLE) ? 50 : 75, hHalf = 50; setShapes(prev => prev.map(sh => sh.id === activeShapeId ? { ...sh, points: [{ x: cx - wHalf, y: cy - hHalf }, { x: cx + wHalf, y: cy + hHalf }] } : sh)); }
          }
          if (tool !== ToolType.FREEHAND) setSelectedIds(new Set([activeShapeId]));
          setActiveShapeId(null);
      }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      const rawPos = getMousePos(e, false); const hit = getHitShape(rawPos, shapes);
      if (hit && hit.type === ShapeType.TEXT) { setTextEditing({ id: hit.id, x: hit.points[0].x, y: hit.points[0].y, text: hit.text || '' }); setSelectedIds(new Set([hit.id])); return; }
      if (!hit && tool === ToolType.SELECT) { const id = generateId(); saveHistory(); setShapes(prev => [...prev, { id, type: ShapeType.TEXT, points: [rawPos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }]); setTextEditing({ id, x: rawPos.x, y: rawPos.y, text: '' }); setSelectedIds(new Set([id])); }
  };

  const finishTextEditing = useCallback(() => {
    if (!textEditing) return;
    if (!textEditing.text.trim()) {
        setShapes(prev => prev.filter(s => s.id !== textEditing.id));
    } else {
        saveHistory();
        setShapes(prev => prev.map(s => {
          if (s.id === textEditing.id) {
            return { ...s, text: textEditing.text };
          }
          return s;
        }));
    }
    setTextEditing(null);
    setSelectedIds(new Set());
  }, [textEditing]);

  const handleFold = (lineId: string) => {
      const line = shapes.find(s => s.id === lineId); if (!line || line.points.length < 2) return;
      saveHistory(); const p1 = line.points[0], p2 = line.points[1];
      const newShapes = shapes.map(s => selectedIds.has(s.id) && s.id !== lineId ? { ...s, fill: 'transparent', stroke: '#cbd5e1' } : s);
      shapes.forEach(s => { if (selectedIds.has(s.id) && s.id !== lineId) { let sourcePoints = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.TRIANGLE, ShapeType.POLYGON, ShapeType.LINE].includes(s.type) ? getRotatedCorners(s) : s.points; newShapes.push({ ...s, id: generateId(), type: s.type === ShapeType.LINE ? ShapeType.LINE : ShapeType.POLYGON, points: sourcePoints.map(p => reflectPointAcrossLine(p, p1, p2)), rotation: 0, labels: undefined, text: s.text, fill: s.fill, stroke: s.stroke === '#cbd5e1' ? '#000000' : s.stroke }); } });
      setShapes(newShapes); setPickingMirrorMode(false); setSelectedIds(new Set());
  };

  const selectedShape = selectedIds.size === 1 ? shapes.find(s => s.id === [...selectedIds][0]) : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden text-slate-900 font-sans bg-slate-50 relative">
        <TopBar 
          shapes={shapes}
          selectedIds={selectedIds}
          svgRef={svgRef}
          imageInputRef={imageInputRef}
          fileInputRef={fileInputRef}
          undo={undo}
          deleteSelected={deleteSelected}
          clearAll={clearAll}
        />

        <div className="flex-1 flex overflow-hidden relative">
            <Sidebar activeTool={tool} onToolChange={handleToolChange} />

            <div className={`flex-1 relative bg-white ${tool === ToolType.ERASER ? 'cursor-eraser' : 'cursor-crosshair'}`} onDragOver={(e) => {e.preventDefault(); e.dataTransfer.dropEffect = 'copy';}} onDrop={(e) => {
                e.preventDefault(); 
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                if (file.type.startsWith('image/')) {
                    processImageFile(file, { x: e.clientX - svgRef.current!.getBoundingClientRect().left, y: e.clientY - svgRef.current!.getBoundingClientRect().top });
                } else if (file.name.endsWith('.geo') || file.name.endsWith('.json')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const content = event.target?.result as string;
                            const loadedShapes = JSON.parse(content);
                            if (Array.isArray(loadedShapes)) {
                                saveHistory();
                                const processed = fitShapesToViewport(loadedShapes, canvasSize.width, canvasSize.height);
                                setShapes(processed);
                                setSelectedIds(new Set());
                            }
                        } catch (err) { console.error("Drop Parse Error:", err); }
                    };
                    reader.readAsText(file); // Fixed: Read as text for JSON parsing
                }
            }}>
                {pickingMirrorMode && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium animate-bounce pointer-events-none">Select a line to mirror across</div>}
                <svg ref={svgRef} className="w-full h-full touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} onContextMenu={(e) => e.preventDefault()}>
                    <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1"/></pattern></defs>
                    {axisConfig.showGrid && <rect width="100%" height="100%" fill="url(#grid)" />}
                    <AxisLayer config={axisConfig} width={canvasSize.width} height={canvasSize.height} />
                    {shapes.map(shape => <ShapeRenderer key={shape.id} shape={(textEditing?.id === shape.id) ? { ...shape, text: '' } : shape} isSelected={selectedIds.has(shape.id)} />)}
                    {tool === ToolType.COMPASS && <CompassOverlay center={compassState.center} cursor={cursorPos || {x:0, y:0}} radiusPoint={compassState.radiusPoint} isDrawing={!!compassState.startAngle} />}
                    {tool === ToolType.RULER && selectedIds.size === 0 && (
                        <g style={{ opacity: 0.35, pointerEvents: 'none' }}>
                            <ShapeRenderer 
                                shape={{ 
                                    id: 'ghost-ruler', 
                                    type: ShapeType.RULER, 
                                    points: [
                                        { x: (cursorPos?.x || 0) - 200, y: (cursorPos?.y || 0) - 20 }, 
                                        { x: (cursorPos?.x || 0) + 200, y: (cursorPos?.y || 0) + 20 }
                                    ], 
                                    fill: 'transparent', 
                                    stroke: '#94a3b8', 
                                    strokeWidth: 1, 
                                    rotation: 0 
                                }} 
                                isSelected={false} 
                            />
                        </g>
                    )}
                    {compassPreviewPath && <path d={compassPreviewPath} fill="none" stroke={currentStyle.stroke} strokeWidth={currentStyle.strokeWidth} strokeDasharray="4,4" opacity={0.6} />}
                    {shapes.filter(s => selectedIds.has(s.id)).map(s => (!textEditing || textEditing.id !== s.id) && <SelectionOverlay key={'sel-' + s.id} shape={s} isSelected={true} pivotIndex={pivotIndex} isAltPressed={isAltPressed} isMarkingAngles={markingAnglesMode} isDragging={isDragging} onResizeStart={(idx, e) => { e.stopPropagation(); setDragHandleIndex(idx); setIsDragging(true); }} onRotateStart={(e) => { e.stopPropagation(); setIsRotating(true); let center = getShapeCenter(s.points, s.type, s.fontSize, s.text); if (pivotIndex !== 'center') center = getRotatedCorners(s)[pivotIndex as number]; setRotationCenter(center); lastRotationMouseAngle.current = Math.atan2(getMousePos(e, false).y - center.y, getMousePos(e, false).x - center.x) * (180 / Math.PI); }} onSetPivot={(idx) => setPivotIndex(idx)} onMarkAngle={(idx) => { const corners = getRotatedCorners(s); const len = corners.length, prevIdx = (idx - 1 + len) % len, nextIdx = (idx + 1) % len; const existing = shapes.find(m => m.type === ShapeType.MARKER && m.markerConfig?.targets[0].shapeId === s.id && m.markerConfig?.targets[0].pointIndices[1] === idx); if (existing) { setShapes(ps => ps.map(m => m.id === existing.id ? (recalculateMarker({ ...m, markerConfig: { ...m.markerConfig!, type: m.markerConfig!.type === 'angle_arc' ? 'perpendicular' : 'angle_arc' } }, ps) || m) : m)); } else { saveHistory(); const nm = recalculateMarker({ id: generateId(), type: ShapeType.MARKER, points: [corners[idx]], fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0, markerConfig: { type: 'angle_arc', targets: [{ shapeId: s.id, pointIndices: [prevIdx, idx, nextIdx] }] } }, shapes); if (nm) setShapes(ps => [...ps, nm]); } }} onAngleChange={() => {}} onAngleDoubleClick={(idx, e) => { e.stopPropagation(); const c = getShapeCenter(s.points), p = s.points[idx], dx = c.x - p.x, dy = c.y - p.y, len = Math.sqrt(dx*dx + dy*dy) || 1, tx = p.x + (dx/len) * 25, ty = p.y + (dy/len) * 25; setAngleEditing({ id: s.id, index: idx, x: tx, y: ty, value: getPolygonAngles(s.points)[idx]?.toString() || "0" }); }} />)}
                    {snapIndicator && <circle cx={snapIndicator.x} cy={snapIndicator.y} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />}
                    {selectionBox && <rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth={1} />}
                </svg>
                {textEditing && <div style={{ position: 'absolute', left: textEditing.x, top: textEditing.y, transform: 'translate(0, -50%)' }}><input ref={inputRef} type="text" value={textEditing.text} onChange={(e) => setTextEditing(prev => prev ? ({...prev, text: e.target.value}) : null)} onKeyDown={(e) => { if(e.key === 'Enter') { finishTextEditing(); } }} onBlur={finishTextEditing} className="bg-transparent border border-blue-500 rounded px-1 py-0.5 text-lg font-sans outline-none" style={{ color: currentStyle.stroke, minWidth: '50px' }} autoFocus /><div className="absolute top-full left-0 bg-white shadow-lg border rounded p-1 flex gap-1 mt-1 z-50 w-64 flex-wrap">{MATH_SYMBOLS.map(sym => <button key={sym} onMouseDown={(e) => e.preventDefault()} onClick={() => setTextEditing(p => p ? ({...p, text: p.text + sym}) : null)} className="hover:bg-gray-100 p-1 rounded text-sm min-w-[20px]">{sym}</button>)}</div></div>}
                {angleEditing && <div style={{ position: 'absolute', left: angleEditing.x, top: angleEditing.y, transform: 'translate(-50%, -50%)' }}><input ref={angleInputRef} type="number" value={angleEditing.value} onChange={(e) => setAngleEditing(prev => prev ? ({ ...prev, value: e.target.value }) : null)} onKeyDown={(e) => { if (e.key === 'Enter') { const v = parseFloat(angleEditing.value); if (!isNaN(v) && v > 0 && v < 180) { saveHistory(); const { id, index } = angleEditing; setShapes(prev => prev.map(s => { if (s.id !== id || s.type !== ShapeType.TRIANGLE || s.points.length < 3) return s; const pts = [...s.points], iC = index, iN = (index + 1) % 3, iP = (index - 1 + 3) % 3, pC = pts[iC], pN = pts[iN], pP = pts[iP], vRF = { x: pN.x - pP.x, y: pN.y - pP.y }, vBA = { x: pP.x - pC.x, y: pP.y - pC.y }, vBC_O = { x: pN.x - pC.x, y: pN.y - pC.y }, sign = (vBA.x * vBC_O.y - vBA.y * vBC_O.x) >= 0 ? 1 : -1, aR = (v * Math.PI) / 180, cos = Math.cos(sign * aR), sin = Math.sin(sign * aR), vBC_N = { x: vBA.x * cos - vBA.y * sin, y: vBA.x * sin + vBA.y * cos }, nN = getLineIntersection(pP, vRF, pC, vBC_N); if (!nN || distance(pC, nN) > 3000 || ((nN.x - pP.x) * vRF.x + (nN.y - pP.y) * vRF.y) <= 0) return s; pts[iN] = nN; return { ...s, points: pts }; })); } setAngleEditing(null); } if (e.key === 'Escape') setAngleEditing(null); }} onBlur={() => setAngleEditing(null)} className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm font-sans shadow-lg outline-none w-20 text-center" /></div>}
            </div>

            <div onMouseEnter={() => setIsSidebarHovered(true)} onMouseLeave={() => setIsSidebarHovered(false)} className={`absolute top-0 right-0 bottom-0 z-30 transition-all duration-300 ease-in-out flex ${isSidebarHovered ? 'translate-x-0' : 'translate-x-[calc(100%-20px)]'}`}>
                <div className="w-[20px] h-full cursor-pointer bg-slate-100/10 backdrop-blur-sm flex items-center justify-center hover:bg-slate-100/50 transition-colors group">
                    <div className="flex flex-row gap-[3px]">
                        <div className="w-[1px] h-8 bg-slate-200 rounded-full group-hover:bg-slate-400 transition-colors" />
                        <div className="w-[1px] h-8 bg-slate-200 rounded-full group-hover:bg-slate-400 transition-colors" />
                        <div className="w-[1px] h-8 bg-slate-200 rounded-full group-hover:bg-slate-400 transition-colors" />
                    </div>
                </div>
                
                <PropertiesPanel 
                  selectedShape={selectedShape}
                  shapes={shapes}
                  setShapes={setShapes}
                  selectedIds={selectedIds}
                  axisConfig={axisConfig}
                  setAxisConfig={setAxisConfig}
                  autoLabelMode={autoLabelMode}
                  setAutoLabelMode={setAutoLabelMode}
                  smartSketchMode={smartSketchMode}
                  setSmartSketchMode={setSmartSketchMode}
                  markingAnglesMode={markingAnglesMode}
                  setMarkingAnglesMode={setMarkingAnglesMode}
                  pickingMirrorMode={pickingMirrorMode}
                  setPickingMirrorMode={setPickingMirrorMode}
                  currentStyle={currentStyle}
                  setCurrentStyle={setCurrentStyle}
                  canvasSize={canvasSize}
                  pixelsPerUnit={pixelsPerUnit}
                  onFitToViewport={() => setShapes(prev => fitShapesToViewport(prev, canvasSize.width, canvasSize.height))}
                />
            </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={async (e) => { if (e.target.files?.[0]) { const loaded = await loadProject(e.target.files[0]); const processed = fitShapesToViewport(loaded, canvasSize.width, canvasSize.height); saveHistory(); setShapes(processed); setSelectedIds(new Set()); e.target.value = ''; } }} accept=".geo,.json" className="hidden" />
        <input type="file" ref={imageInputRef} onChange={(e) => { if (e.target.files?.[0]) processImageFile(e.target.files[0]); e.target.value = ''; }} accept="image/*" className="hidden" />
    </div>
  );
}
