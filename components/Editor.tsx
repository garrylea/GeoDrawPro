import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { ToolType, Shape, ShapeType, Point, AxisConfig, Constraint, TransientState } from '../types';
import { DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from '../constants';
import { AxisLayer } from './AxisLayer';
import { ShapeRenderer } from './ShapeRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { CompassOverlay } from './ConstructionTools';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { loadProject, saveProject, isElectron } from '../utils/exportUtils';
import { 
  getSnapPoint, distance, getShapeCenter, 
  getRotatedCorners, rotatePoint, reflectPointAcrossLine, 
  getAngleDegrees, getAngleArcPath, recognizeFreehandShape, 
  recalculateMarker, getClosestPointOnShape, getPixelsPerUnit, 
  evaluateQuadratic, mathToScreen, screenToMath, 
  generateQuadraticPath, getPolygonAngles, 
  fitShapesToViewport, sanitizeLoadedShapes,
  solveTriangleASA, snapToRuler
} from '../utils/mathUtils';
import { resolveConstraints, constrainPointToEdge, getDependents } from '../utils/constraintSystem';
import { getHitShape, calculateMovedShape, calculateResizedShape, getSelectionBounds, calculateRotatedShape } from '../utils/shapeOperations';
import { Plus, Loader2 } from 'lucide-react';
// Use explicit paths for pdfjs-dist to ensure Vite resolves them correctly
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

export function Editor() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [selectedIds, _setSelectedIds] = useState<Set<string>>(new Set<string>());
  const setSelectedIds = (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      _setSelectedIds(prev => {
          const next = typeof ids === 'function' ? ids(prev) : ids;
          if (next.size === 1) {
              const id = Array.from(next)[0];
              const s = shapesRef.current.find(shape => shape.id === id);
              if (s && s.type === ShapeType.RULER) {
                  setPivotIndex(0); // Default to Start for Ruler
              } else {
                  setPivotIndex('center');
              }
          } else {
              setPivotIndex('center');
          }
          return next;
      });
  };
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);
  const [clipboard, setClipboard] = useState<Shape[]>([]);
  
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  const shapesRef = useRef(shapes);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);

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
  const [activeLineConstraints, setActiveLineConstraints] = useState<(Constraint | undefined)[]>([]);
  const [snapIndicator, setSnapIndicator] = useState<(Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' }) | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null); 
  const cursorPosRef = useRef<Point | null>(null);
  
  // DIRECT DOM MANIPULATION REFS
  const transientStateRef = useRef<TransientState | null>(null);
  const domCacheRef = useRef<Map<string, Element>>(new Map());
  const initialShapeStateRef = useRef<Map<string, Shape>>(new Map()); // Snapshot for resize math

  // PERFORMANCE: Hit test throttling
  const lastHitTestTime = useRef<number>(0);

  const isScrollingRef = useRef(false);
  const lastScrollPos = useRef<{x: number, y: number} | null>(null);
  const zoomFocusPointRef = useRef<{x: number, y: number} | null>(null);
  
  const selectionRectRef = useRef<SVGRectElement>(null);
  const selectionStartRef = useRef<Point | null>(null);
  const shapeBoundsCache = useRef<Map<string, { minX: number, minY: number, maxX: number, maxY: number }>>(new Map());

  const dragHistorySaved = useRef(false);

  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  
  const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
  const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(true); 
  const [smartSketchMode, setSmartSketchMode] = useState(true);
  const [lockBackground, setLockBackground] = useState(true);
  const [pressureEnabled, _setPressureEnabled] = useState(true); 
  const setPressureEnabled = (val: boolean) => {
      _setPressureEnabled(val);
      if (selectedIds.size > 0) {
          setShapes(prev => prev.map(s => (selectedIds.has(s.id) && s.type === ShapeType.FREEHAND) ? { ...s, usePressure: val } : s));
      }
  };

  const [compassState, setCompassState] = useState<{
      center: Point | null; 
      radiusPoint: Point | null; 
      startAngle: number | null;
      accumulatedRotation: number;
      lastMouseAngle: number;
  }>({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 });
  const [compassPreviewPath, setCompassPreviewPath] = useState<string | null>(null);

  const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
  const [angleEditing, setAngleEditing] = useState<{ id: string; index: number; x: number; y: number; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const angleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lastRotationMouseAngle = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // PAGE_HEIGHT is now a state to allow it to match imported PDF proportions
  const [pageHeight, setPageHeight] = useState(1400); 
  const [pageCount, setPageCount] = useState(1);
  const [loadingState, setLoadingState] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // LOGICAL_CANVAS_WIDTH is fixed for coordinate stability
  const LOGICAL_CANVAS_WIDTH = 1600;
  const [canvasSize, setCanvasSize] = useState({ width: LOGICAL_CANVAS_WIDTH, height: window.innerHeight });
  const [zoom, setZoom] = useState(1);

  const originY = pageHeight / 2;
  const svgHeight = Math.max(canvasSize.height, pageCount * pageHeight);
  const pixelsPerUnit = getPixelsPerUnit(canvasSize.width, canvasSize.height, axisConfig.ticks);
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Initialize PDF worker locally for offline/Electron support
  useEffect(() => {
    try {
        pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
    } catch (e) {
        console.error("Failed to initialize PDF worker:", e);
    }
  }, []);

  useLayoutEffect(() => {
    if (zoomFocusPointRef.current && containerRef.current) {
        const { x, y } = zoomFocusPointRef.current;
        const { clientWidth, clientHeight } = containerRef.current;
        const newScrollLeft = x * zoom - clientWidth / 2;
        const newScrollTop = y * zoom - clientHeight / 2;
        containerRef.current.scrollLeft = newScrollLeft;
        containerRef.current.scrollTop = newScrollTop;
        zoomFocusPointRef.current = null;
    }
  }, [zoom]);

  const handleZoomChange = (newZoom: number) => {
      if (Math.abs(newZoom - zoom) < 0.001) return;
      const container = containerRef.current;
      if (container) {
          const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
          // Calculate center relative to unscaled content
          const centerX = (scrollLeft + clientWidth / 2) / zoom;
          const centerY = (scrollTop + clientHeight / 2) / zoom;
          zoomFocusPointRef.current = { x: centerX, y: centerY };
      }
      setZoom(newZoom);
  };
  
  const saveHistory = useCallback(() => {
      setHistory(prev => [...prev, shapes]);
      setIsDirty(true);
  }, [shapes]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSave = async () => {
      const success = await saveProject(shapes, 'project');
      if (success) { 
          setIsDirty(false); 
          setSaveMessage('文件保存成功！');
          setTimeout(() => setSaveMessage(null), 3000);
      }
      return success;
  };

  useEffect(() => {
      if (isElectron()) {
          const { ipcRenderer } = (window as any).require('electron');
          const handleCheckUnsaved = () => { ipcRenderer.send('UNSAVED_CHECK_RESULT', isDirtyRef.current); };
          const handleActionSave = async () => { const success = await saveProject(shapesRef.current, 'project'); if (success) { setIsDirty(false); ipcRenderer.send('SAVE_COMPLETE'); } };
          const handleMainLog = (_: any, msg: string) => { console.log(msg); };

          ipcRenderer.on('CHECK_UNSAVED', handleCheckUnsaved);
          ipcRenderer.on('ACTION_SAVE', handleActionSave);
          ipcRenderer.on('MAIN_PROCESS_LOG', handleMainLog);

          return () => { 
            ipcRenderer.removeListener('CHECK_UNSAVED', handleCheckUnsaved); 
            ipcRenderer.removeListener('ACTION_SAVE', handleActionSave);
            ipcRenderer.removeListener('MAIN_PROCESS_LOG', handleMainLog);
          };
      }
  }, []); 

  useEffect(() => {
    const updateCanvasHeight = () => {
        setCanvasSize(prev => ({ ...prev, height: window.innerHeight }));
    };
    updateCanvasHeight();
    window.addEventListener('resize', updateCanvasHeight);
    return () => window.removeEventListener('resize', updateCanvasHeight);
  }, []);

  useEffect(() => {
      setShapes(prev => prev.map(s => {
          if (s.type === ShapeType.FUNCTION_GRAPH && s.formulaParams) {
              const fType = s.functionType || 'quadratic';
              const newPath = generateQuadraticPath(s.formulaParams, s.functionForm || 'standard', canvasSize.width, svgHeight, pixelsPerUnit, fType, originY);
              return { ...s, pathData: newPath };
          }
          return s;
      }));
  }, [canvasSize.width, svgHeight, axisConfig.ticks, pixelsPerUnit, originY]);

  const processImageFile = useCallback((file: File, position?: Point) => {
      const reader = new FileReader();
      reader.onload = (event) => {
          const url = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              saveHistory();
              const id = generateId();
              const width = img.width; const height = img.height; const maxDim = 300; let finalW = width; let finalH = height;
              if (width > maxDim || height > maxDim) { const ratio = width / height; if (width > height) { finalW = maxDim; finalH = maxDim / ratio; } else { finalH = maxDim; finalW = maxDim * ratio; } }
              const centerX = position ? position.x : canvasSize.width / 2; const centerY = position ? position.y : originY; 
              const newShape: Shape = { id, type: ShapeType.IMAGE, points: [{x: centerX - finalW/2, y: centerY - finalH/2}, {x: centerX + finalW/2, y: centerY + finalH/2}], imageUrl: url, fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0 };
              setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setTool(ToolType.SELECT);
          }
          img.src = url;
      };
      reader.readAsDataURL(file);
  }, [canvasSize.width, originY, saveHistory]);

  const processPdfFile = useCallback(async (file: File) => {
      try {
          setLoadingState({ active: true, message: 'Loading PDF...' });
          const arrayBuffer = await file.arrayBuffer();
          // Use the explicitly imported pdfjsLib
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;
          const newShapes: Shape[] = [];
          
          for (let i = 1; i <= numPages; i++) {
              setLoadingState({ active: true, message: `Processing page ${i} of ${numPages}...` });
              // Yield to main thread to allow UI update
              await new Promise(resolve => setTimeout(resolve, 0));

              const page = await pdf.getPage(i);
              // Use a higher scale for better resolution, can be adjusted
              const scale = 2.0; 
              const viewport = page.getViewport({ scale });
              
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (!context) continue;
              
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              const renderContext = { canvasContext: context, viewport: viewport };
              await page.render(renderContext).promise;
              const imgUrl = canvas.toDataURL('image/png');
              
              const pageIndex = i - 1;
              const centerX = LOGICAL_CANVAS_WIDTH / 2;
              
              // NEW: Fit to 80% of logical width while maintaining aspect ratio
              const targetWidth = LOGICAL_CANVAS_WIDTH * 0.8;
              const aspectRatio = viewport.height / viewport.width;
              const displayWidth = targetWidth;
              const displayHeight = targetWidth * aspectRatio;

              // Synchronize editor page height with PDF page height on the first page
              if (i === 1) {
                  setPageHeight(displayHeight);
              }

              // Use the calculated displayHeight for consistent positioning
              const pageTopY = pageIndex * displayHeight;
              const pageCenterY = pageTopY + (displayHeight / 2);
              
              const shapeId = generateId();
              
              const newShape: Shape = {
                  id: shapeId,
                  type: ShapeType.IMAGE,
                  points: [
                      { x: centerX - displayWidth / 2, y: pageCenterY - displayHeight / 2 },
                      { x: centerX + displayWidth / 2, y: pageCenterY + displayHeight / 2 }
                  ],
                  imageUrl: imgUrl,
                  fill: 'none',
                  stroke: 'transparent',
                  strokeWidth: 0,
                  rotation: 0
              };
              newShapes.push(newShape);
          }
          
          saveHistory();
          // Append new shapes (PDF pages) to existing shapes
          setShapes(prev => [...prev, ...newShapes]);
          // Ensure canvas is tall enough
          setPageCount(prev => Math.max(prev, numPages));
          setLockBackground(true);
      } catch (err) {
          console.error("Error processing PDF:", err);
          alert("Failed to load PDF file.");
      } finally {
          setLoadingState({ active: false, message: '' });
      }
  }, [canvasSize.width, saveHistory]);

  useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
          let imageFound = false;
          if (e.clipboardData?.items) {
              for (let i = 0; i < e.clipboardData.items.length; i++) {
                  const item = e.clipboardData.items[i];
                  if (item.type.indexOf('image') !== -1) { const file = item.getAsFile(); if (file) { e.preventDefault(); processImageFile(file, cursorPosRef.current || undefined); imageFound = true; } }
              }
          }
          if (!imageFound && clipboard.length > 0) {
              e.preventDefault(); saveHistory(); const offset = 20; const newShapes: Shape[] = []; const newIds = new Set<string>();
              clipboard.forEach(s => { const newId = generateId(); newIds.add(newId); const newShape = { ...s, id: newId }; if (newShape.points) newShape.points = newShape.points.map(p => ({ x: p.x + offset, y: p.y + offset, p: p.p })); delete newShape.constraint; delete newShape.markerConfig; newShapes.push(newShape); });
              setShapes(prev => [...prev, ...newShapes]); setSelectedIds(newIds); setTool(ToolType.SELECT);
          }
      };
      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [processImageFile, clipboard, saveHistory]);

  const getNextLabels = (count: number): string[] => {
      const used = new Set<string>();
      shapes.forEach(s => { if (s.labels) s.labels.forEach(l => used.add(l)); if (s.type === ShapeType.TEXT && s.text && s.text.length <= 2) used.add(s.text); });
      const result: string[] = []; let i = 0;
      while(result.length < count && i < 1000) { const charCode = 65 + (i % 26); let label = String.fromCharCode(charCode); const cycle = Math.floor(i / 26); if (cycle > 0) label += cycle; if (!used.has(label)) { result.push(label); used.add(label); } i++; }
      return result;
  };

  const undo = () => { if (history.length === 0) return; const previousState = history[history.length - 1]; setHistory(prev => prev.slice(0, -1)); setShapes(previousState); setSelectedIds(new Set<string>()); setActiveShapeId(null); setIsDirty(true); };

  const deleteSelected = () => {
      if (selectedIds.size === 0) return; saveHistory(); const idsToDelete = new Set<string>(Array.from(selectedIds) as string[]);
      setShapes(prev => prev.filter(s => { if (idsToDelete.has(s.id)) return false; if (s.constraint && idsToDelete.has(s.constraint.parentId || '')) return false; if (s.type === ShapeType.MARKER && s.markerConfig && idsToDelete.has(s.markerConfig.targets[0].shapeId)) return false; return true; })); setSelectedIds(new Set<string>());
  };

  const clearAll = () => { saveHistory(); setShapes([]); setHistory([]); setSelectedIds(new Set()); };
  const isTool = (s: Shape) => s.type === ShapeType.RULER || s.type === ShapeType.PROTRACTOR;

  const handleFold = (lineId: string) => {
      const line = shapes.find(s => s.id === lineId); if (!line || line.points.length < 2) return;
      const targets = shapes.filter(s => selectedIds.has(s.id) && s.id !== lineId); if (targets.length === 0) { setPickingMirrorMode(false); return; }
      saveHistory(); 
      const p1 = line.points[0]; 
      const p2 = line.points[line.points.length - 1];
      const lineAngle = getAngleDegrees(p1, p2);

      const newShapes = targets.map(s => { 
          if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TEXT, ShapeType.IMAGE].includes(s.type)) {
               const center = getShapeCenter(s.points, s.type, s.fontSize, s.text);
               const reflectedCenter = reflectPointAcrossLine(center, p1, p2);
               const dx = reflectedCenter.x - center.x;
               const dy = reflectedCenter.y - center.y;
               const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
               let newRotation = 2 * lineAngle - (s.rotation || 0);
               newRotation = (newRotation % 360 + 360) % 360; 
               return { ...s, id: generateId(), points: newPoints, rotation: newRotation };
          }
          let pts = s.points; 
          if (s.rotation) { 
              const c = getShapeCenter(s.points, s.type, s.fontSize, s.text); 
              pts = pts.map(p => rotatePoint(p, c, s.rotation)); 
          } 
          const mirroredPts = pts.map(p => reflectPointAcrossLine(p, p1, p2)); 
          return { ...s, id: generateId(), points: mirroredPts, rotation: 0 }; 
      });
      setShapes(prev => [...prev, ...newShapes]); setSelectedIds(new Set(newShapes.map(s => s.id))); setPickingMirrorMode(false);
  };

  const finishTextEditing = () => {
      if (textEditing) { 
          if (!textEditing.text.trim()) { 
              setShapes(prev => prev.filter(s => s.id !== textEditing.id)); 
          } else { 
              setShapes(prev => prev.map(s => s.id === textEditing.id ? { ...s, text: textEditing.text } : s)); 
          } 
          setTextEditing(null); 
          setSelectedIds(new Set());
      }
  };

  const cancelTextEditing = () => {
      if (textEditing) {
          const shape = shapes.find(s => s.id === textEditing.id);
          if (shape && !shape.text) setShapes(prev => prev.filter(s => s.id !== textEditing.id));
          setTextEditing(null);
      }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      const pos = getMousePos(e, false);
      let hit = getHitShape(pos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY);
      if (!hit) {
          const target = e.target as Element;
          const group = target.closest('g[data-shape-id]');
          if (group) { const id = group.getAttribute('data-shape-id'); if (id) { const s = shapes.find(sh => sh.id === id); if (s && s.type === ShapeType.TEXT) hit = s; } }
      }
      if (hit && hit.type === ShapeType.TEXT) {
          setTextEditing({ id: hit.id, x: hit.points[0].x, y: hit.points[0].y, text: hit.text || '' }); e.stopPropagation(); e.preventDefault();
      } else if (tool === ToolType.SELECT) { // ALLOW creation even if hitting another shape
          e.preventDefault(); saveHistory(); const id = generateId();
          const newShape: Shape = { id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }; 
          setShapes(prev => [...prev, newShape]); setTextEditing({ id, x: pos.x, y: pos.y, text: '' }); setSelectedIds(new Set<string>([id])); 
      }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true); if (e.key === 'Shift') setIsShiftPressed(true);
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT') return;
          if (textEditing || angleEditing) return;
          if (selectedIds.size > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault(); const step = 1;
              const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0; const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
              saveHistory();
              setShapes(prev => {
                  const movedShapes = prev.map(s => { if (selectedIds.has(s.id)) { if (s.type === ShapeType.FUNCTION_GRAPH) return s; const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p })); return { ...s, points: newPoints }; } return s; });
                  return movedShapes.map(s => { if (s.type === ShapeType.MARKER && s.markerConfig) { const targetId = s.markerConfig.targets[0].shapeId; const updatedTarget = movedShapes.find(ms => ms.id === targetId); if (updatedTarget) return recalculateMarker(s, movedShapes) || s; } return s; });
              }); return;
          }
          if (e.key === 'a' || e.key === 'A') { setTool(ToolType.SELECT); return; }
          if (e.key === 'l' || e.key === 'L') { setTool(ToolType.LINE); return; }
          if (e.key === 'p' || e.key === 'P') { setTool(ToolType.POINT); return; }
          if (e.key === 'f' || e.key === 'F') { setTool(ToolType.FREEHAND); return; }
          if (e.key === 'e' || e.key === 'E') { setTool(ToolType.ERASER); return; }
          if (e.key === 'r' || e.key === 'R') { setTool(ToolType.RULER); return; }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { const selected = shapes.filter(s => selectedIds.has(s.id)); if (selected.length > 0) setClipboard(JSON.parse(JSON.stringify(selected))); return; }
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
          if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelectedIds(new Set(shapes.map(s => s.id))); return; }
          if (e.key === 'Enter') { finishTextEditing(); return; }
          if (e.key === 'Escape') {
              if (textEditing) { cancelTextEditing(); return; }
              if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
              if (markingAnglesMode) { setMarkingAnglesMode(false); return; }
              if (activeShapeId) { setShapes(prev => prev.filter(s => s.id !== activeShapeId)); setActiveShapeId(null); setIsDragging(false); setTool(ToolType.SELECT); return; }
              if (tool === ToolType.COMPASS && compassState.center) { setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null); return; }
              if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
              if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
          }
          if ((e.key === 'Delete' || e.key === 'Backspace')) { deleteSelected(); }
      };
      const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setIsAltPressed(false); if (e.key === 'Shift') setIsShiftPressed(false); };
      window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedIds, textEditing, angleEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, tool, compassState, clipboard, saveHistory]); 

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

  const handleToolChange = (newTool: ToolType) => {
    setTool(newTool); setSelectedIds(new Set()); setSnapIndicator(null); setCursorPos(null);
    if (selectionRectRef.current) { selectionRectRef.current.style.display = 'none'; selectionRectRef.current.setAttribute('width', '0'); selectionRectRef.current.setAttribute('height', '0'); }
    selectionStartRef.current = null;
    setActiveShapeId(null); setTextEditing(null); setAngleEditing(null); setPickingMirrorMode(false); setMarkingAnglesMode(false); setHoveredShapeId(null);
    setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null);
    transientStateRef.current = null;
  };

  const updateTransientVisuals = (state: TransientState | null) => {
    let overlay = domCacheRef.current.get('selection-overlay-group');
    if (!overlay || !overlay.isConnected) {
        overlay = document.getElementById('selection-overlay-group') || undefined;
        if (overlay) domCacheRef.current.set('selection-overlay-group', overlay);
    }

    if (!state) {
        domCacheRef.current.forEach((el, id) => { 
             const shape = shapesRef.current.find(s => s.id === id);
             if (shape && shape.rotation) {
                 const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
                 el.setAttribute('transform', `rotate(${shape.rotation} ${center.x} ${center.y})`);
             } else {
                 el.setAttribute('transform', ''); 
             }
             // Reset elastic line changes
             if (shape?.type === ShapeType.LINE) {
                 const line = el.querySelector('line');
                 if (line) {
                     line.setAttribute('x1', shape.points[0].x.toString());
                     line.setAttribute('y1', shape.points[0].y.toString());
                     line.setAttribute('x2', shape.points[1].x.toString());
                     line.setAttribute('y2', shape.points[1].y.toString());
                 }
             }
        });
        return;
    }
    const { dx, dy, rotation, rotationCenter: pivot, scale, scaleCenter } = state;
    
    domCacheRef.current.forEach((cachedEl, id) => {
        const isTracked = initialShapeStateRef.current.has(id) || id === 'selection-overlay-group';
        if (!isTracked) return;

        let el = cachedEl;
        if (!el.isConnected) {
            const liveEl = id === 'selection-overlay-group' 
                ? document.getElementById('selection-overlay-group') 
                : svgRef.current?.querySelector(`g[data-shape-id="${id}"]`);
            if (liveEl) {
                domCacheRef.current.set(id, liveEl);
                el = liveEl;
            } else {
                return;
            }
        }

        const shape = shapesRef.current.find(s => s.id === id);
        
        // --- SELECTION OVERLAY SPECIAL HANDLING ---
        // If it's the overlay and we have a single selection, we must include the target shape's persistent rotation
        if (id === 'selection-overlay-group' && selectedIds.size === 1) {
            const singleId = Array.from(selectedIds)[0];
            const targetShape = shapesRef.current.find(s => s.id === singleId);
            if (targetShape) {
                let finalTransform = '';
                if (rotation && pivot) { finalTransform += `rotate(${rotation} ${pivot.x} ${pivot.y}) `; }
                if (dx || dy) { finalTransform += `translate(${dx || 0} ${dy || 0}) `; }
                
                const center = getShapeCenter(targetShape.points, targetShape.type, targetShape.fontSize, targetShape.text);
                if (targetShape.rotation) { finalTransform += `rotate(${targetShape.rotation} ${center.x} ${center.y}) `; }
                
                if (scale && scaleCenter) { finalTransform += `translate(${scaleCenter.x} ${scaleCenter.y}) scale(${scale.x} ${scale.y}) translate(${-scaleCenter.x} ${-scaleCenter.y}) `; }
                
                el.setAttribute('transform', finalTransform.trim());
                return;
            }
        }

        // --- RIGID BODY SYNC LOGIC ---
        // If we are moving a group (e.g. Triangle), and this shape is a dependent (Point/Line),
        // we should just apply the SAME global translation.
        // We only use 'Elastic' logic if the driver ITSELF is one of the linked parents.
        const isDirectlySelected = selectedIds.has(id);
        const isElasticTarget = shape?.type === ShapeType.LINE && 
                               shape.constraint?.type === 'points_link' && 
                               (shape.constraint.parents || [shape.constraint.parentId!]).some(pid => pid && selectedIds.has(pid));

        if (isElasticTarget && !isDirectlySelected) {
            const line = el.querySelector('line');
            if (line) {
                const pids = shape!.constraint!.parents || [shape!.constraint!.parentId!];
                pids.forEach((pid, idx) => {
                    if (!pid) return;
                    if (selectedIds.has(pid)) {
                        const originalPt = shape!.points[idx];
                        line.setAttribute(`x${idx+1}`, (originalPt.x + (dx || 0)).toString());
                        line.setAttribute(`y${idx+1}`, (originalPt.y + (dy || 0)).toString());
                    }
                });
            }
            return; 
        }

        // For everything else (Triangle, or Point/Line being moved AS A DEPENDENT), 
        // use rigid translation.
        let finalTransform = '';
        if (rotation && pivot) { finalTransform += `rotate(${rotation} ${pivot.x} ${pivot.y}) `; }
        if (dx || dy) { finalTransform += `translate(${dx || 0} ${dy || 0}) `; }
        
        if (shape) {
             const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
             if (shape.rotation) { finalTransform += `rotate(${shape.rotation} ${center.x} ${center.y}) `; }
             if (scale && scaleCenter) { finalTransform += `translate(${scaleCenter.x} ${scaleCenter.y}) scale(${scale.x} ${scale.y}) translate(${-scaleCenter.x} ${-scaleCenter.y}) `; }
        }
        el.setAttribute('transform', finalTransform.trim());
    });
  };

  const refreshDomCache = (idsOverride?: Set<string>) => {
    domCacheRef.current.clear();
    initialShapeStateRef.current.clear();
    
    const targetIds = idsOverride || selectedIds;
    
    // 1. Add target shapes
    if (tool === ToolType.SELECT || tool === ToolType.RULER || tool === ToolType.PROTRACTOR) {
        shapesRef.current.forEach(s => {
            if (targetIds.has(s.id)) {
                 const el = svgRef.current?.querySelector(`g[data-shape-id="${s.id}"]`);
                 if (el) { domCacheRef.current.set(s.id, el); initialShapeStateRef.current.set(s.id, s); }
            }
        });
        
        // 2. Add dependent shapes (recursive)
        const dependents = getDependents(shapesRef.current, targetIds);
        dependents.forEach(s => {
             const el = svgRef.current?.querySelector(`g[data-shape-id="${s.id}"]`);
             if (el) { domCacheRef.current.set(s.id, el); initialShapeStateRef.current.set(s.id, s); }
        });

        const overlay = document.getElementById('selection-overlay-group');
        if (overlay) domCacheRef.current.set('selection-overlay-group', overlay);
    }
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
    
    // Use the unified binder for initial position and constraint. 
    // Exclude activeShapeId if we are finishing a multi-click shape (like a LINE).
    const { point: pos, constraint: currentConstraint } = bindPointToShapes(rawPos, activeShapeId ? [activeShapeId] : [], tool === ToolType.LINE);

    dragHistorySaved.current = false;
    if (tool !== ToolType.SELECT && tool !== ToolType.COMPASS && tool !== ToolType.ERASER && tool !== ToolType.RULER && !pickingMirrorMode && !markingAnglesMode) setSelectedIds(new Set());
    
    if (tool === ToolType.LINE) {
        if (activeShapeId) { 
            // Only establish points_link if we snapped to a POINT shape
            const startC = activeLineConstraints[0];
            const endC = currentConstraint;
            
            const startPointId = (startC?.type === 'points_link') ? startC.parentId : null;
            const endPointId = (endC?.type === 'points_link') ? endC.parentId : null;

            setShapes(prev => prev.map(s => {
                if (s.id === activeShapeId) {
                    const updated: Shape = { ...s, points: [s.points[0], pos] };
                    if (startPointId || endPointId) {
                        updated.constraint = { type: 'points_link', parents: [startPointId || null, endPointId || null] };
                    }
                    return updated;
                }
                return s;
            })); 
            setActiveShapeId(null); setActiveLineConstraints([]); setDragStartPos(null); return; 
        } 
        else { 
            saveHistory(); const id = generateId(); 
            const newShape: Shape = { id, type: ShapeType.LINE, points: [pos, pos], fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }; 
            setShapes(prev => [...prev, newShape]); 
            
            // Only capture constraint if it's a point link
            const startC = currentConstraint?.type === 'points_link' ? currentConstraint : undefined;
            setActiveShapeId(id); setActiveLineConstraints([startC, undefined]); setDragStartPos(rawPos); return; 
        }
    }
    if (tool === ToolType.ERASER) { 
        saveHistory(); setIsDragging(true); 
        const hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY, 12); 
        if (hit && hit.type !== ShapeType.IMAGE) { setShapes(prev => prev.filter(s => (s.id !== hit.id && !(s.constraint?.parentId === hit.id) && !(s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === hit.id)))); } return; 
    }
    if (tool === ToolType.COMPASS) { if (!compassState.center) { setCompassState({ ...compassState, center: pos }); } else { const startAngle = getAngleDegrees(compassState.center, pos); setCompassState({ ...compassState, radiusPoint: pos, startAngle: startAngle, lastMouseAngle: startAngle, accumulatedRotation: 0 }); } return; }
    if (tool === ToolType.RULER) { const existingRuler = shapes.find(s => s.type === ShapeType.RULER); if (existingRuler) { setSelectedIds(new Set([existingRuler.id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([existingRuler.id])); return; } saveHistory(); const id = generateId(); const width = 400, height = 40; const center = pos; const newShape: Shape = { id, type: ShapeType.RULER, points: [{ x: center.x - width/2, y: center.y - height/2 }, { x: center.x + width/2, y: center.y + height/2 }], fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, rotation: 0 }; setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setTool(ToolType.SELECT); return; }
    if (pickingMirrorMode) { const line = shapes.find(s => (s.type === ShapeType.LINE || s.type === ShapeType.FREEHAND) && distance(pos, getClosestPointOnShape(pos, s)) < 10); if (line) handleFold(line.id); return; }
    if (tool === ToolType.FUNCTION || tool === ToolType.LINEAR_FUNCTION) { 
        const hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY);
        if (hit && hit.type === ShapeType.FUNCTION_GRAPH) {
            setTool(ToolType.SELECT); setSelectedIds(new Set([hit.id])); setActiveShapeId(null); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([hit.id])); return;
        }
        saveHistory(); const id = generateId(); const isLinear = tool === ToolType.LINEAR_FUNCTION; const params = isLinear ? { k: 1, b: 0 } : { a: 1, b: 0, c: 0, h: 0, k: 0 }; const fType = isLinear ? 'linear' : 'quadratic'; const pathData = generateQuadraticPath(params, 'standard', canvasSize.width, svgHeight, pixelsPerUnit, fType, originY); const newShape: Shape = { id, type: ShapeType.FUNCTION_GRAPH, points: [], formulaParams: params, functionForm: 'standard', functionType: fType, pathData, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0 }; setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); return; 
    }
    if (tool === ToolType.SELECT) { 
        let hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY); 
        if (hit && hit.type === ShapeType.IMAGE && lockBackground) {
            const corners = getRotatedCorners(hit); const distToEdge = distance(rawPos, getClosestPointOnShape(rawPos, { ...hit, points: corners, type: ShapeType.POLYGON })); if (distToEdge > 15) hit = null;
        }

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
    if (tool === ToolType.PROTRACTOR) { const existingProtractor = shapes.find(s => s.type === ShapeType.PROTRACTOR); if (existingProtractor) { setSelectedIds(new Set([existingProtractor.id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([existingProtractor.id])); return; } const id = generateId(); const newShape: Shape = { id, type: ShapeType.PROTRACTOR, points: [{ x: pos.x - 150, y: pos.y - 150 }, { x: pos.x + 150, y: pos.y }], fill: 'transparent', stroke: currentStyle.stroke, strokeWidth: 1, rotation: 0 }; setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setDragStartPos(rawPos); setIsDragging(true); refreshDomCache(new Set([id])); return; }
    if (tool === ToolType.TEXT) { e.preventDefault(); const id = generateId(); const newShape: Shape = { id, type: ShapeType.TEXT, points: [pos], text: '', fontSize: 16, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0 }; setShapes(prev => [...prev, newShape]); setTextEditing({ id, x: pos.x, y: pos.y, text: '' }); setSelectedIds(new Set<string>([id])); return; }
    setDragStartPos(rawPos); setIsDragging(true); const id = generateId(); let points: Point[] = [pos, pos]; if (tool === ToolType.TRIANGLE) points = [pos, pos, pos]; if (tool === ToolType.POINT || tool === ToolType.FREEHAND) points = [pos];
    let labels: string[] | undefined = (autoLabelMode && tool !== ToolType.POINT && tool !== ToolType.FREEHAND) ? getNextLabels(tool === ToolType.TRIANGLE ? 3 : (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE ? 4 : points.length)) : undefined;
    const newShape: Shape = { id, type: tool as unknown as ShapeType, points, labels, fill: currentStyle.fill, stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, strokeType: currentStyle.strokeType, rotation: 0, usePressure: tool === ToolType.FREEHAND && pressureEnabled };
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
    const prevRawPos = cursorPosRef.current || rawPos;
    cursorPosRef.current = rawPos;

    // Snapping configuration for detecting constraints
    const gridSnapConfig = (axisConfig.visible && axisConfig.showGrid) ? { width: canvasSize.width, height: svgHeight, ppu: pixelsPerUnit } : undefined;
    
    // Detect snapping target (all shapes except current dragging selection and the active shape being drawn)
    const snapResult = getSnapPoint(rawPos, shapesRef.current.filter(s => !selectedIds.has(s.id) && s.id !== activeShapeId), [], gridSnapConfig);
    const pos = snapResult.point;

    if (tool !== ToolType.SELECT) { setCursorPos(rawPos); }
    if (activeShapeId && tool === ToolType.LINE) { 
        setShapes(prev => prev.map(s => {
            if (s.id === activeShapeId) {
                const updated: Shape = { ...s, points: [s.points[0], pos] };
                const startPointId = (activeLineConstraints[0]?.type === 'points_link') ? activeLineConstraints[0].parentId : null;
                const endPointId = (snapResult.constraint?.type === 'points_link') ? snapResult.constraint.parentId : null;

                if (startPointId || endPointId) {
                    updated.constraint = { type: 'points_link', parents: [startPointId || null, endPointId || null] };
                } else {
                    updated.constraint = undefined;
                }
                return updated;
            }
            return s;
        })); 
    }
    if (tool === ToolType.COMPASS && compassState.radiusPoint) { const center = compassState.center!; const radius = distance(center, compassState.radiusPoint); const currentMouseAngle = getAngleDegrees(center, rawPos); let delta = currentMouseAngle - compassState.lastMouseAngle; if (delta > 180) delta -= 360; if (delta < -180) delta += 360; const newAccumulated = compassState.accumulatedRotation + delta; setCompassState(prev => ({ ...prev, lastMouseAngle: currentMouseAngle, accumulatedRotation: newAccumulated })); const startAngle = compassState.startAngle!; const endAngle = startAngle + newAccumulated; setCompassPreviewPath(getAngleArcPath(center, null, null, radius, startAngle, endAngle)); return; }
    if (tool === ToolType.ERASER && isDragging) { const hit = getHitShape(rawPos, shapes, canvasSize.width, svgHeight, pixelsPerUnit, originY, 12); if (hit && hit.type !== ShapeType.IMAGE) setShapes(prev => prev.filter(s => (s.id !== hit.id && !(s.constraint?.parentId === hit.id) && !(s.type === ShapeType.MARKER && s.markerConfig?.targets[0].shapeId === hit.id)))); return; }
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

             // 1. Logic for points ALREADY on edges (Stable sliding)
             // CRITICAL: We prioritize the existing edge constraint over the snap result
             if (draggingShape.constraint && draggingShape.constraint.type === 'on_edge') {
                  const parent = shapesRef.current.find(s => s.id === draggingShape.constraint!.parentId);
                  if (parent && draggingShape.constraint.edgeIndex !== undefined) {
                       // Use rawPos (mouse) for projection to allow smooth sliding even if snapResult is different
                       const { point: constrainedPos, t } = constrainPointToEdge(rawPos, parent, draggingShape.constraint.edgeIndex);
                       newPos = constrainedPos;
                       newConstraint = { ...draggingShape.constraint, paramT: t };
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
                              if (s.constraint && s.constraint.type === 'on_edge') {
                                  const parent = prev.find(p => p.id === s.constraint!.parentId);
                                  if (parent && s.constraint.edgeIndex !== undefined) {
                                      const { point: constrainedPos, t } = constrainPointToEdge(moved.points[0], parent, s.constraint.edgeIndex);
                                      return { ...moved, points: [constrainedPos], constraint: { ...s.constraint!, paramT: t } };
                                  }
                              } else {
                                  // Only attempt NEW binding if it wasn't already constrained to an edge
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

      if (tool === ToolType.COMPASS) { if (compassPreviewPath) { saveHistory(); const center = compassState.center!; const radius = distance(center, compassState.radiusPoint!); const startAngle = compassState.startAngle!; const endAngle = startAngle + compassState.accumulatedRotation; const arcPoints: Point[] = []; const stepCount = 40; const step = (endAngle - startAngle) / stepCount; for(let i=0; i<=stepCount; i++) { const rad = ((startAngle + step * i) * Math.PI) / 180; arcPoints.push({ x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) }); } setShapes(prev => [...prev, { id: generateId(), type: ShapeType.PATH, points: arcPoints, pathData: compassPreviewPath, fill: 'none', stroke: currentStyle.stroke, strokeWidth: currentStyle.strokeWidth, rotation: 0, isConstruction: true }]); setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null); } return; }
      if (activeShapeId && tool === ToolType.LINE) { 
          if (dragStartPos && distance(dragStartPos, rawPos) > 5) { 
              // Fix: Explicitly pass true for isCreatingLine to allow point linking
              const { point: finalEndPos, constraint: endC } = bindPointToShapes(rawPos, [activeShapeId], true);
              const startC = activeLineConstraints[0];
              const startPointId = (startC?.type === 'points_link') ? startC.parentId : null;
              const endPointId = (endC?.type === 'points_link') ? endC.parentId : null;

              setShapes(prev => prev.map(s => {
                  if (s.id === activeShapeId) {
                      const updated: Shape = { ...s, points: [s.points[0], finalEndPos] };
                      if (startPointId || endPointId) {
                          updated.constraint = { type: 'points_link', parents: [startPointId || null, endPointId || null] };
                      }
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
      
      if (activeShapeId && tool === ToolType.FREEHAND && smartSketchMode) { const shape = shapes.find(s => s.id === activeShapeId); if (shape && shape.points.length > 5) { const recognized = recognizeFreehandShape(shape.points); if (recognized) { let labels: string[] | undefined = undefined; if (autoLabelMode && recognized.type !== ShapeType.LINE) { labels = getNextLabels(recognized.type === ShapeType.TRIANGLE ? 3 : 4); } setShapes((prev: Shape[]) => prev.map((s: Shape) => s.id === activeShapeId ? { ...s, type: recognized.type, points: recognized.points, labels, usePressure: false } : s)); } } }
      
      if (activeShapeId) {
          const s = shapes.find(sh => sh.id === activeShapeId);
          if (s && distance(s.points[0], rawPos) < 10) { 
              const cx = rawPos.x, cy = rawPos.y; 
              if (tool === ToolType.RECTANGLE || tool === ToolType.SQUARE) { const wPx = 2 * pixelsPerUnit, hPx = (tool === ToolType.SQUARE ? 2 : 1) * pixelsPerUnit; setShapes((prev: Shape[]) => prev.map((sh: Shape) => sh.id === activeShapeId ? { ...sh, points: [{ x: cx - wPx/2, y: cy - hPx/2 }, { x: cx + wPx/2, y: cy + hPx/2 }] } : sh)); } 
              else if (tool === ToolType.TRIANGLE) { const sizePx = 2 * pixelsPerUnit; setShapes((prev: Shape[]) => prev.map((sh: Shape) => sh.id === activeShapeId ? { ...sh, points: [{ x: cx, y: cy - sizePx/2 }, { x: cx + sizePx/2, y: cy + sizePx/2 }, { x: cx - sizePx/2, y: cy + sizePx/2 }] } : sh)); } 
              else if (tool === ToolType.CIRCLE || tool === ToolType.ELLIPSE) { const wHalf = (tool === ToolType.CIRCLE) ? 50 : 75, hHalf = 50; setShapes((prev: Shape[]) => prev.map((sh: Shape) => sh.id === activeShapeId ? { ...sh, points: [{ x: cx - wHalf, y: cy - hHalf }, { x: cx + wHalf, y: cy + hHalf }] } : sh)); } 
          }
          if (tool !== ToolType.FREEHAND) setSelectedIds(new Set([activeShapeId])); 
          setActiveShapeId(null);
      }
  };

  const handleFitToViewport = useCallback(() => { setShapes((prev: Shape[]) => fitShapesToViewport(prev, canvasSize.width, canvasSize.height)); }, [canvasSize.width, canvasSize.height]);
  
  const handleFileLoad = useCallback((content: string) => { 
      try { 
          const loadedShapes = JSON.parse(content); 
          if (Array.isArray(loadedShapes)) { 
              saveHistory(); 
              const shapesArray = loadedShapes as any[]; 
              const sanitized: Shape[] = sanitizeLoadedShapes(shapesArray); 
              let maxY = 0; 
              sanitized.forEach((s: Shape) => { if (s.points) { s.points.forEach((p: Point) => { if(p.y > maxY) maxY = p.y; }); } }); 
              const requiredPages = Math.ceil(maxY / pageHeight); 
              setPageCount(Math.max(1, requiredPages)); 
              setShapes(sanitized); 
              setSelectedIds(new Set()); 
              setIsDirty(false); 
          } 
      } catch(e) { console.error("Load Failed", e); } 
  }, [saveHistory, pageHeight]);

  useEffect(() => {
    if (isElectron()) {
        const { ipcRenderer } = (window as any).require('electron');
        const handleOpenFileFromOS = (_: any, filePath: string) => {
            try {
                const fs = (window as any).require('fs');
                // Check if file exists
                if (fs.existsSync(filePath)) {
                    const data = fs.readFileSync(filePath, 'utf-8');
                    handleFileLoad(data);
                }
            } catch (e) {
                console.error("Failed to load file from OS:", e);
            }
        };

        ipcRenderer.on('OPEN_FILE_FROM_OS', handleOpenFileFromOS);
        return () => { ipcRenderer.removeListener('OPEN_FILE_FROM_OS', handleOpenFileFromOS); };
    }
  }, [handleFileLoad]);

  const groupBounds = selectedIds.size > 1 ? getSelectionBounds(shapes, selectedIds) : null;
  const selectedShape = selectedIds.size === 1 ? shapes.find(s => selectedIds.has(s.id)) || null : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 relative overflow-hidden select-none">
        <TopBar shapes={shapes} selectedIds={selectedIds} svgRef={svgRef} fileInputRef={fileInputRef} undo={undo} deleteSelected={deleteSelected} clearAll={clearAll} onSave={handleSave} zoom={zoom} onZoomChange={handleZoomChange} />
        <div className="flex flex-1 overflow-hidden relative">
            <Sidebar activeTool={tool} onToolChange={handleToolChange} />
            <div className="flex-1 relative flex flex-col min-w-0 bg-slate-50">
                <div className={`flex-1 bg-white relative overflow-x-auto overflow-y-auto custom-scrollbar ${tool === ToolType.ERASER ? 'cursor-eraser' : (tool === ToolType.SELECT ? 'cursor-default' : 'cursor-crosshair')}`} ref={containerRef} onDragOver={(e) => {e.preventDefault(); e.dataTransfer.dropEffect = 'copy';}} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (!file) return; if (file.type === 'application/pdf') { processPdfFile(file); } else if (file.type.startsWith('image/')) { processImageFile(file, { x: e.clientX - svgRef.current!.getBoundingClientRect().left, y: e.clientY - svgRef.current!.getBoundingClientRect().top }); } else if (file.name.endsWith('.geo') || file.name.endsWith('.json')) { const reader = new FileReader(); reader.onload = (event) => { handleFileLoad(event.target?.result as string); }; reader.readAsText(file); } }}>
                    <svg ref={svgRef} className="mx-auto touch-none block shadow-sm bg-white" style={{ width: canvasSize.width, height: svgHeight, transform: `scale(${zoom})`, transformOrigin: 'top center' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onDoubleClick={handleDoubleClick} onContextMenu={(e) => e.preventDefault()}>
                        <AxisLayer config={axisConfig} width={canvasSize.width} height={svgHeight} pixelsPerUnit={pixelsPerUnit} overrideOrigin={{ x: canvasSize.width / 2, y: originY }} pageCount={pageCount} pageHeight={pageHeight} />
                        {pageCount > 1 && Array.from({ length: pageCount - 1 }).map((_, i) => ( <g key={`page-break-${i}`} opacity="0.4"> <line x1={0} y1={(i + 1) * pageHeight} x2={canvasSize.width} y2={(i + 1) * pageHeight} stroke="#94a3b8" strokeWidth={1} strokeDasharray="8,8" /> <text x={10} y={(i + 1) * pageHeight - 5} fontSize={10} fill="#94a3b8" fontFamily="sans-serif">Page {i + 1} End</text> </g> ))}
                                  {shapes.filter(s => !isTool(s)).map(shape => ( <ShapeRenderer key={shape.id} shape={(textEditing?.id === shape.id) ? { ...shape, text: '' } : shape} isSelected={selectedIds.has(shape.id)} tool={tool} pixelsPerUnit={pixelsPerUnit} /> ))}
                                  {shapes.filter(s => isTool(s)).map(shape => ( <ShapeRenderer key={shape.id} shape={shape} isSelected={selectedIds.has(shape.id)} tool={tool} pixelsPerUnit={pixelsPerUnit} /> ))}                        {tool === ToolType.COMPASS && <CompassOverlay center={compassState.center} cursor={cursorPos || {x:0, y:0}} radiusPoint={compassState.radiusPoint} isDrawing={!!compassState.startAngle} />}
                        {tool === ToolType.RULER && selectedIds.size === 0 && ( <g style={{ opacity: 0.35, pointerEvents: 'none' }}> <ShapeRenderer shape={{ id: 'ghost-ruler', type: ShapeType.RULER, points: [{ x: (cursorPos?.x || 0) - 200, y: (cursorPos?.y || 0) - 20 }, { x: (cursorPos?.x || 0) + 200, y: (cursorPos?.y || 0) + 20 }], fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, rotation: 0 }} isSelected={false} tool={tool} pixelsPerUnit={pixelsPerUnit} /> </g> )}
                        {compassPreviewPath && <path d={compassPreviewPath} fill="none" stroke={currentStyle.stroke} strokeWidth={currentStyle.strokeWidth} strokeDasharray="4,4" opacity={0.6} />}
                        {selectedIds.size === 1 && shapes.filter(s => selectedIds.has(s.id)).map(s => (!textEditing || textEditing.id !== s.id) && (
                            <SelectionOverlay 
                                key={'sel-' + s.id} 
                                shape={s} 
                                isSelected={true} 
                                pivotIndex={pivotIndex} 
                                isAltPressed={isAltPressed} 
                                isMarkingAngles={markingAnglesMode} 
                                isDragging={isDragging} 
                                onResizeStart={(idx, e) => { e.stopPropagation(); saveHistory(); refreshDomCache(); setDragHandleIndex(idx); setIsDragging(true); }} 
                                onRotateStart={(e) => { 
                                    e.stopPropagation(); 
                                    saveHistory(); 
                                    refreshDomCache(); 
                                    setIsRotating(true); 
                                    let center = getShapeCenter(s.points, s.type, s.fontSize, s.text); 
                                    if (pivotIndex !== 'center') {
                                        if (s.type === ShapeType.RULER) {
                                            const p0 = s.points[0], p1 = s.points[1];
                                            const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
                                            const minY = Math.min(p0.y, p1.y), maxY = Math.max(p0.y, p1.y);
                                            const height = maxY - minY;
                                            if (pivotIndex === 0) center = { x: minX, y: minY + height / 2 };
                                            else if (pivotIndex === 1) center = { x: maxX, y: minY + height / 2 };
                                        } else {
                                            center = getRotatedCorners(s)[pivotIndex as number]; 
                                        }
                                    }
                                    setRotationCenter(center); 
                                    lastRotationMouseAngle.current = Math.atan2(getMousePos(e, false).y - center.y, getMousePos(e, false).x - center.x) * (180 / Math.PI); 
                                }} 
                                onSetPivot={(idx) => setPivotIndex(idx)} 
                                onMarkAngle={(idx) => { const corners = getRotatedCorners(s); const len = corners.length, prevIdx = (idx - 1 + len) % len, nextIdx = (idx + 1) % len; const existing = shapes.find(m => m.type === ShapeType.MARKER && m.markerConfig?.targets[0].shapeId === s.id && m.markerConfig?.targets[0].pointIndices[1] === idx); if (existing) { setShapes(ps => ps.map(m => m.id === existing.id ? (recalculateMarker({ ...m, markerConfig: { ...m.markerConfig!, type: m.markerConfig!.type === 'angle_arc' ? 'perpendicular' : 'angle_arc' } }, ps) || m) : m)); } else { saveHistory(); const nm = recalculateMarker({ id: generateId(), type: ShapeType.MARKER, points: [corners[idx]], fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0, markerConfig: { type: 'angle_arc', targets: [{ shapeId: s.id, pointIndices: [prevIdx, idx, nextIdx] }] } }, shapes); if (nm) setShapes(ps => [...ps, nm]); } }} 
                                onAngleChange={() => {}} 
                                onAngleDoubleClick={(idx, e) => { e.stopPropagation(); const c = getShapeCenter(s.points), p = s.points[idx], dx = c.x - p.x, dy = c.y - p.y, len = Math.sqrt(dx*dx + dy*dy) || 1, tx = p.x + (dx/len) * 25, ty = p.y + (dy/len) * 25; setAngleEditing({ id: s.id, index: idx, x: tx, y: ty, value: getPolygonAngles(s.points)[idx]?.toString() || "0" }); }} 
                            />
                        ))}
                        {selectedIds.size > 1 && groupBounds && ( <SelectionOverlay shape={{ id: 'selection-group', type: ShapeType.RECTANGLE, points: [{x: groupBounds.minX, y: groupBounds.minY}, {x: groupBounds.maxX, y: groupBounds.maxY}], fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0 }} isSelected={true} pivotIndex={pivotIndex} isAltPressed={isAltPressed} isDragging={isDragging} onResizeStart={(idx, e) => { e.stopPropagation(); saveHistory(); refreshDomCache(); setDragHandleIndex(idx); setIsDragging(true); }} onRotateStart={(e) => { e.stopPropagation(); saveHistory(); refreshDomCache(); setIsRotating(true); const center = { x: groupBounds.minX + groupBounds.width / 2, y: groupBounds.minY + groupBounds.height / 2 }; setRotationCenter(center); lastRotationMouseAngle.current = Math.atan2(getMousePos(e, false).y - center.y, getMousePos(e, false).x - center.x) * (180 / Math.PI); }} onSetPivot={() => {}} onMarkAngle={() => {}} onAngleChange={() => {}} /> )}
                        {snapIndicator && (
                            <g transform={`translate(${snapIndicator.x}, ${snapIndicator.y})`}>
                                {snapIndicator.type === 'midpoint' ? (
                                    <path d="M -6 4 L 0 -7 L 6 4 Z" fill="none" stroke="#fbbf24" strokeWidth={2} />
                                ) : snapIndicator.type === 'center' ? (
                                    <g>
                                        <circle cx={0} cy={0} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />
                                        <line x1={-8} y1={0} x2={8} y2={0} stroke="#fbbf24" strokeWidth={1} />
                                        <line x1={0} y1={-8} x2={0} y2={8} stroke="#fbbf24" strokeWidth={1} />
                                    </g>
                                ) : (
                                    <circle cx={0} cy={0} r={5} fill="none" stroke="#fbbf24" strokeWidth={2} />
                                )}
                            </g>
                        )}
                        <rect ref={selectionRectRef} x="0" y="0" width="0" height="0" fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeWidth="1" style={{ display: 'none', pointerEvents: 'none' }} />
                    </svg>
                    {textEditing && <div style={{ position: 'absolute', left: textEditing.x, top: textEditing.y, transform: 'translate(0, -50%)' }}><input ref={inputRef} type="text" value={textEditing.text} onChange={(e) => setTextEditing(prev => prev ? ({...prev, text: e.target.value}) : null)} onKeyDown={(e) => { if(e.key === 'Enter') { finishTextEditing(); } if(e.key === 'Escape') { cancelTextEditing(); } }} onBlur={finishTextEditing} className="bg-transparent border border-blue-500 rounded px-1 py-0.5 text-lg font-sans outline-none" style={{ color: currentStyle.stroke, minWidth: '50px' }} autoFocus /><div className="absolute top-full left-0 bg-white shadow-lg border rounded p-1 flex gap-1 mt-1 z-50 w-64 flex-wrap">{MATH_SYMBOLS.map(sym => <button key={sym} onMouseDown={(e) => e.preventDefault()} onClick={() => setTextEditing(p => p ? ({...p, text: p.text + sym}) : null)} className="hover:bg-gray-100 p-1 rounded text-sm min-w-[20px]">{sym}</button>)}</div></div>}
                    {angleEditing && (
                        <div style={{ position: 'absolute', left: angleEditing.x, top: angleEditing.y, transform: 'translate(-50%, -50%)' }}>
                            <input ref={angleInputRef} type="number" value={angleEditing.value} onChange={(e) => setAngleEditing(prev => prev ? ({ ...prev, value: e.target.value }) : null)} onKeyDown={(e) => { if (e.key === 'Enter') { const newValue = parseFloat(angleEditing.value); if (!isNaN(newValue) && newValue > 0 && newValue < 180) { saveHistory(); const { id, index } = angleEditing; setShapes(prev => prev.map(s => { if (s.id !== id) return s; if (s.type === ShapeType.TRIANGLE && s.points.length === 3) { const pts = [...s.points]; const iCurrent = index; let iFixed: number; if (s.lastModifiedAngleIndex !== undefined && s.lastModifiedAngleIndex !== iCurrent) { iFixed = s.lastModifiedAngleIndex; } else if (s.lastModifiedAngleIndex === iCurrent && s.lockedAngles && s.lockedAngles.length > 0) { iFixed = s.lockedAngles[0]; } else { iFixed = (iCurrent + 1) % 3; } const iMove = [0, 1, 2].find(x => x !== iCurrent && x !== iFixed)!; const pFixed = pts[iFixed]; const pCurrent = pts[iCurrent]; const pMove = pts[iMove]; const v1 = { x: pCurrent.x - pFixed.x, y: pCurrent.y - pFixed.y }; const v2 = { x: pMove.x - pFixed.x, y: pMove.y - pFixed.y }; const dot = v1.x * v2.x + v1.y * v2.y; const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y); const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y); const angleFixedRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))); const angleFixedVal = angleFixedRad * (180 / Math.PI); const newN = solveTriangleASA(pFixed, pCurrent, angleFixedVal, newValue, pMove); if (newN) { pts[iMove] = newN; return { ...s, points: pts, lockedAngles: [iFixed], lastModifiedAngleIndex: iCurrent }; } return s; } if (s.type === ShapeType.POLYGON && s.points.length >= 3) { const pts = [...s.points]; const iC = index; const iN = (index + 1) % pts.length; const iP = (index - 1 + pts.length) % pts.length; const pC = pts[iC]; const pN = pts[iN]; const pP = pts[iP]; const angleCP = Math.atan2(pP.y - pC.y, pP.x - pC.x); const angleCN = Math.atan2(pN.y - pC.y, pN.x - pC.x); let delta = angleCN - angleCP; while (delta <= -Math.PI) delta += 2*Math.PI; while (delta > Math.PI) delta -= 2*Math.PI; const sign = delta >= 0 ? 1 : -1; const newRadCN = angleCP + sign * (newValue * Math.PI / 180); const lenCN = Math.sqrt(Math.pow(pN.x - pC.x, 2) + Math.pow(pN.y - pC.y, 2)); pts[iN] = { x: pC.x + lenCN * Math.cos(newRadCN), y: pC.y + lenCN * Math.sin(newRadCN) }; return { ...s, points: pts }; } return s; })); setAngleEditing(null); } } if (e.key === 'Escape') setAngleEditing(null); }} onBlur={() => setAngleEditing(null)} className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm font-sans shadow-lg outline-none w-20 text-center" autoFocus />
                        </div>
                    )}
                </div>
                {pickingMirrorMode && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium animate-bounce pointer-events-none">Select a line to mirror across</div>}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50"><button onClick={() => setPageCount(p => p + 1)} className="bg-white shadow-lg border border-slate-200 text-slate-600 px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-bold uppercase tracking-wide"><Plus size={18} /> {pageCount > 1 ? `Page ${pageCount} / Add +` : 'Add Page'}</button></div>
            </div>
            <div className={`h-full bg-slate-50 border-l border-slate-200 shadow-xl z-20 transition-all duration-300 ease-in-out flex ${isSidebarOpen ? 'w-[350px]' : 'w-[15px]'}`} onMouseEnter={() => setIsSidebarOpen(true)} onMouseLeave={() => setIsSidebarOpen(false)}>
                <div className="w-[15px] h-full flex flex-row items-center justify-center gap-[3px] bg-slate-50 hover:bg-slate-100 cursor-pointer shrink-0 border-r border-slate-200 transition-colors"><div className="w-[1px] h-[16px] bg-slate-300 rounded-full"></div><div className="w-[1px] h-[16px] bg-slate-300 rounded-full"></div><div className="w-[1px] h-[16px] bg-slate-300 rounded-full"></div></div>
                <div className={`flex-1 overflow-hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                     <PropertiesPanel selectedShape={selectedShape} shapes={shapes} setShapes={setShapes} selectedIds={selectedIds} axisConfig={axisConfig} setAxisConfig={setAxisConfig} autoLabelMode={autoLabelMode} setAutoLabelMode={setAutoLabelMode} smartSketchMode={smartSketchMode} setSmartSketchMode={setSmartSketchMode} pressureEnabled={pressureEnabled} setPressureEnabled={setPressureEnabled} lockBackground={lockBackground} setLockBackground={setLockBackground} markingAnglesMode={markingAnglesMode} setMarkingAnglesMode={setMarkingAnglesMode} pickingMirrorMode={pickingMirrorMode} setPickingMirrorMode={setPickingMirrorMode} currentStyle={currentStyle} setCurrentStyle={setCurrentStyle} canvasSize={{ width: canvasSize.width, height: svgHeight }} pixelsPerUnit={pixelsPerUnit} originY={originY} onFitToViewport={handleFitToViewport} saveHistory={saveHistory} isDragging={isDragging} />
                </div>
            </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={async (e) => { 
            if (e.target.files?.[0]) { 
                const file = e.target.files[0]; 
                if (file.type === 'application/pdf') { 
                    await processPdfFile(file); 
                } else if (file.type.startsWith('image/')) {
                    processImageFile(file);
                } else { 
                    const loaded = await loadProject(file); 
                    handleFileLoad(JSON.stringify(loaded)); 
                } 
                e.target.value = ''; 
            } 
        }} accept=".geo,.json,.pdf,image/*" className="hidden" />
        
        {loadingState.active && (
            <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                    <div className="flex flex-col items-center gap-1">
                        <h3 className="font-bold text-lg text-slate-800">Importing PDF</h3>
                        <p className="text-slate-500 text-sm">{loadingState.message}</p>
                    </div>
                </div>
            </div>
        )}

        {saveMessage && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="bg-emerald-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border border-emerald-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {saveMessage}
                </div>
            </div>
        )}
    </div>
  );
}