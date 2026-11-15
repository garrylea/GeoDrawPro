import { useState, useRef, useCallback } from 'react';
import { ToolType, Shape, ShapeType, AxisConfig } from '../types';
import { DEFAULT_SHAPE_PROPS, MATH_SYMBOLS } from '../constants';
import { AxisLayer } from './AxisLayer';
import { ShapeRenderer } from './ShapeRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { CompassOverlay } from './ConstructionTools';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { loadProject, getLocalFilePath } from '../utils/exportUtils';
import { getPolygonAngles, fitShapesToViewport } from '../utils/mathUtils';
import { getSelectionBounds } from '../utils/shapeOperations';
import { createRulerShape } from '../utils/shapeFactory';
import { getAngleEditAnchor } from '../utils/angleEditing';
import { getRotationPivot, planAngleMarkerToggle, toggleMarkerType } from '../utils/markerEditing';
import { reflectShapesAcrossLine } from '../utils/mirror';
import { useTransientTransforms } from '../hooks/useTransientTransforms';
import { useDocument } from '../hooks/useDocument';
import { useViewport } from '../hooks/useViewport';
import { useProjectFiles } from '../hooks/useProjectFiles';
import { useElectronBridge } from '../hooks/useElectronBridge';
import { useInteractionSession } from '../hooks/useInteractionSession';
import { useInlineEditors } from '../hooks/useInlineEditors';
import { usePointerHandlers } from '../hooks/usePointerHandlers';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Plus, Loader2 } from 'lucide-react';

export function Editor() {
  const [tool, setTool] = useState<ToolType>(ToolType.SELECT);

  const [currentStyle, setCurrentStyle] = useState<{
      fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted'
  }>({ ...DEFAULT_SHAPE_PROPS, strokeType: 'solid' });

  const [axisConfig, setAxisConfig] = useState<AxisConfig>({
    visible: false, ticks: 5, color: '#94a3b8', showGrid: false,
  });

  const {
      isDragging, setIsDragging, isRotating, setIsRotating, dragStartPos, setDragStartPos,
      dragHandleIndex, setDragHandleIndex, activeShapeId, setActiveShapeId,
      activeLineConstraints, setActiveLineConstraints, snapIndicator, setSnapIndicator,
      cursorPos, setCursorPos, cursorPosRef, lastHitTestTime, isScrollingRef, lastScrollPos,
      selectionRectRef, selectionStartRef, shapeBoundsCache, dragHistorySaved,
      hoveredShapeId, setHoveredShapeId, pivotIndex, setPivotIndex, rotationCenter, setRotationCenter,
      isAltPressed, setIsAltPressed, isShiftPressed, setIsShiftPressed,
      compassState, setCompassState, compassPreviewPath, setCompassPreviewPath,
      lastRotationMouseAngle, resetSession
  } = useInteractionSession();

  const {
      shapes, setShapes, shapesRef, saveHistory, undo, history, selectedIds, setSelectedIds,
      deleteSelected, clearAll, clipboard, setClipboard, isDirty, setIsDirty, isDirtyRef, currentFilePathRef
  } = useDocument({ setPivotIndex, setActiveShapeId });

  const {
      zoom, handleZoomChange, canvasSize, pageHeight, setPageHeight, pageCount, setPageCount,
      containerRef, originY, svgHeight, pixelsPerUnit
  } = useViewport({ setShapes, ticks: axisConfig.ticks });

  const [pickingMirrorMode, setPickingMirrorMode] = useState(false);
  const [markingAnglesMode, setMarkingAnglesMode] = useState(false);
  const [autoLabelMode, setAutoLabelMode] = useState(false); 
  const [smartSketchMode, setSmartSketchMode] = useState(false);
  const [lockBackground, setLockBackground] = useState(true);
  const [pressureEnabled, _setPressureEnabled] = useState(false); 
  const setPressureEnabled = (val: boolean) => {
      _setPressureEnabled(val);
      if (selectedIds.size > 0) {
          setShapes(prev => prev.map(s => (selectedIds.has(s.id) && s.type === ShapeType.FREEHAND) ? { ...s, usePressure: val } : s));
      }
  };

  const {
      textEditing, setTextEditing, angleEditing, setAngleEditing,
      inputRef, angleInputRef, finishTextEditing, cancelTextEditing, commitAngleEdit
  } = useInlineEditors({ shapes, setShapes, setSelectedIds, saveHistory });

  const svgRef = useRef<SVGSVGElement>(null);
  const { transientStateRef, domCacheRef, initialShapeStateRef, updateTransientVisuals, refreshDomCache } =
      useTransientTransforms({ shapesRef, selectedIds, svgRef, tool });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const {
      loadingState, saveMessage, fileInputRef, persistProject, handleSave, handleSaveAs,
      processImageFile, processPdfFile, handleFileLoad
  } = useProjectFiles({
      shapes, setShapes, setSelectedIds, setTool, saveHistory, clipboard, isDirty, setIsDirty,
      currentFilePathRef, canvasWidth: canvasSize.width, originY, pageHeight, setPageHeight,
      setPageCount, setLockBackground, cursorPosRef, generateId
  });

  useElectronBridge({ persistProject, handleFileLoad, isDirtyRef, shapesRef });

  const isTool = (s: Shape) => s.type === ShapeType.RULER || s.type === ShapeType.PROTRACTOR;

  const handleFold = (lineId: string) => {
      const line = shapes.find(s => s.id === lineId); if (!line || line.points.length < 2) return;
      const targets = shapes.filter(s => selectedIds.has(s.id) && s.id !== lineId); if (targets.length === 0) { setPickingMirrorMode(false); return; }
      saveHistory();
      const newShapes = reflectShapesAcrossLine(targets, line, generateId);
      setShapes(prev => [...prev, ...newShapes]); setSelectedIds(new Set(newShapes.map(s => s.id))); setPickingMirrorMode(false);
  };

  const { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick, getMousePos } = usePointerHandlers({
      isDragging, setIsDragging, isRotating, setIsRotating, dragStartPos, setDragStartPos,
      dragHandleIndex, setDragHandleIndex, activeShapeId, setActiveShapeId,
      activeLineConstraints, setActiveLineConstraints, setSnapIndicator, setCursorPos,
      cursorPosRef, lastHitTestTime, isScrollingRef, lastScrollPos,
      selectionRectRef, selectionStartRef, shapeBoundsCache, dragHistorySaved,
      hoveredShapeId, setHoveredShapeId, rotationCenter, isShiftPressed, isAltPressed,
      compassState, setCompassState, compassPreviewPath, setCompassPreviewPath, lastRotationMouseAngle,
      shapes, setShapes, shapesRef, saveHistory, selectedIds, setSelectedIds,
      zoom, canvasSize, svgHeight, pixelsPerUnit, originY, containerRef,
      transientStateRef, domCacheRef, initialShapeStateRef, updateTransientVisuals, refreshDomCache,
      textEditing, angleEditing, finishTextEditing, setTextEditing,
      svgRef, tool, setTool, currentStyle, axisConfig, lockBackground,
      pickingMirrorMode, markingAnglesMode, autoLabelMode, smartSketchMode, pressureEnabled,
      generateId, handleFold
  });

  useKeyboardShortcuts({
      selectedIds, setSelectedIds, shapes, setShapes, saveHistory, undo, deleteSelected,
      clipboard, setClipboard, history, tool, setTool, textEditing, angleEditing,
      finishTextEditing, cancelTextEditing, activeShapeId, setActiveShapeId, setIsDragging,
      pickingMirrorMode, setPickingMirrorMode, markingAnglesMode, setMarkingAnglesMode,
      compassState, setCompassState, setCompassPreviewPath, setIsAltPressed, setIsShiftPressed
  });

  const handleToolChange = (newTool: ToolType) => {
    setTool(newTool); setSelectedIds(new Set()); resetSession(); setTextEditing(null); setAngleEditing(null); setPickingMirrorMode(false); setMarkingAnglesMode(false); transientStateRef.current = null;
  };

  const handleFitToViewport = useCallback(() => { setShapes((prev: Shape[]) => fitShapesToViewport(prev, canvasSize.width, canvasSize.height)); }, [canvasSize.width, canvasSize.height]);
  
  const groupBounds = selectedIds.size > 1 ? getSelectionBounds(shapes, selectedIds) : null;
  const selectedShape = selectedIds.size === 1 ? shapes.find(s => selectedIds.has(s.id)) || null : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 relative overflow-hidden select-none">
        <TopBar shapes={shapes} selectedIds={selectedIds} svgRef={svgRef} fileInputRef={fileInputRef} undo={undo} deleteSelected={deleteSelected} clearAll={clearAll} onSave={handleSave} onSaveAs={handleSaveAs} zoom={zoom} onZoomChange={handleZoomChange} />
        <div className="flex flex-1 overflow-hidden relative">
            <Sidebar activeTool={tool} onToolChange={handleToolChange} />
            <div className="flex-1 relative flex flex-col min-w-0 bg-slate-50">
                <div className={`flex-1 bg-white relative overflow-x-auto overflow-y-auto custom-scrollbar ${tool === ToolType.ERASER ? 'cursor-eraser' : tool === ToolType.FREEHAND ? 'cursor-pen' : (tool === ToolType.SELECT ? 'cursor-default' : 'cursor-crosshair')}`} ref={containerRef} onDragOver={(e) => {e.preventDefault(); e.dataTransfer.dropEffect = 'copy';}} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (!file) return; if (file.type === 'application/pdf') { processPdfFile(file); } else if (file.type.startsWith('image/')) { processImageFile(file, { x: e.clientX - svgRef.current!.getBoundingClientRect().left, y: e.clientY - svgRef.current!.getBoundingClientRect().top }); } else if (file.name.endsWith('.geo') || file.name.endsWith('.json')) { const reader = new FileReader(); reader.onload = (event) => { handleFileLoad(event.target?.result as string); }; reader.readAsText(file); } }}>
                    <svg ref={svgRef} className="mx-auto touch-none block shadow-sm bg-white" style={{ width: canvasSize.width, height: svgHeight, transform: `scale(${zoom})`, transformOrigin: 'top center' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onDoubleClick={handleDoubleClick} onContextMenu={(e) => e.preventDefault()}>
                        <AxisLayer config={axisConfig} width={canvasSize.width} height={svgHeight} pixelsPerUnit={pixelsPerUnit} overrideOrigin={{ x: canvasSize.width / 2, y: originY }} pageCount={pageCount} pageHeight={pageHeight} />
                        {pageCount > 1 && Array.from({ length: pageCount - 1 }).map((_, i) => ( <g key={`page-break-${i}`} opacity="0.4"> <line x1={0} y1={(i + 1) * pageHeight} x2={canvasSize.width} y2={(i + 1) * pageHeight} stroke="#94a3b8" strokeWidth={1} strokeDasharray="8,8" /> <text x={10} y={(i + 1) * pageHeight - 5} fontSize={10} fill="#94a3b8" fontFamily="sans-serif">Page {i + 1} End</text> </g> ))}
                                  {shapes.filter(s => !isTool(s)).map(shape => ( <ShapeRenderer key={shape.id} shape={(textEditing?.id === shape.id) ? { ...shape, text: '' } : shape} isSelected={selectedIds.has(shape.id)} tool={tool} pixelsPerUnit={pixelsPerUnit} /> ))}
                                  {shapes.filter(s => isTool(s)).map(shape => ( <ShapeRenderer key={shape.id} shape={shape} isSelected={selectedIds.has(shape.id)} tool={tool} pixelsPerUnit={pixelsPerUnit} /> ))}                        {tool === ToolType.COMPASS && <CompassOverlay center={compassState.center} cursor={cursorPos || {x:0, y:0}} radiusPoint={compassState.radiusPoint} isDrawing={!!compassState.startAngle} />}
                        {tool === ToolType.RULER && selectedIds.size === 0 && ( <g style={{ opacity: 0.35, pointerEvents: 'none' }}> <ShapeRenderer shape={createRulerShape('ghost-ruler', cursorPos || {x:0, y:0})} isSelected={false} tool={tool} pixelsPerUnit={pixelsPerUnit} /> </g> )}
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
                                    const center = getRotationPivot(s, pivotIndex);
                                    setRotationCenter(center);
                                    lastRotationMouseAngle.current = Math.atan2(getMousePos(e, false).y - center.y, getMousePos(e, false).x - center.x) * (180 / Math.PI);
                                }}
                                onSetPivot={(idx) => setPivotIndex(idx)}
                                onMarkAngle={(idx) => {
                                    const plan = planAngleMarkerToggle(shapes, s, idx, generateId());
                                    if (plan.kind === 'toggle') {
                                        setShapes(ps => ps.map(m => m.id === plan.markerId ? toggleMarkerType(m, ps) : m));
                                    } else if (plan.kind === 'create') {
                                        saveHistory();
                                        setShapes(ps => [...ps, plan.marker]);
                                    }
                                }}
                                onAngleChange={() => {}}
                                onAngleDoubleClick={(idx, e) => { e.stopPropagation(); const anchor = getAngleEditAnchor(s, idx); setAngleEditing({ id: s.id, index: idx, x: anchor.x, y: anchor.y, value: getPolygonAngles(s.points)[idx]?.toString() || "0" }); }}
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
                            <input ref={angleInputRef} type="number" value={angleEditing.value} onChange={(e) => setAngleEditing(prev => prev ? ({ ...prev, value: e.target.value }) : null)} onKeyDown={(e) => {
                                if (e.key === 'Enter') commitAngleEdit();
                                if (e.key === 'Escape') setAngleEditing(null);
                            }} onBlur={() => setAngleEditing(null)} className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm font-sans shadow-lg outline-none w-20 text-center" autoFocus />
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
                    handleFileLoad(JSON.stringify(loaded), getLocalFilePath(file));
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