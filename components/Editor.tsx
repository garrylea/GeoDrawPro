import { useState, useRef, useCallback } from 'react';
import { ToolType, Shape, ShapeType, AxisConfig } from '../types';
import { DEFAULT_SHAPE_PROPS } from '../constants';
import { AxisLayer } from './AxisLayer';
import { ShapeRenderer } from './ShapeRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { CompassOverlay } from './ConstructionTools';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { loadProject, getLocalFilePath } from '../utils/exportUtils';
import { getPolygonAngles } from '../utils/shapeGeometry';
import { getSelectionBounds, fitShapesToViewport } from '../utils/shapeOperations';
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
import { SnapIndicator } from './editor/SnapIndicator';
import { PageBreaks } from './editor/PageBreaks';
import { TextEditorInput } from './editor/TextEditorInput';
import { AngleEditorInput } from './editor/AngleEditorInput';
import { MirrorBanner, AddPageButton, StatusToasts } from './editor/StatusToasts';

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
      selectionRectRef, selectionStartRef, shapeBoundsCache,
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
                        <PageBreaks pageCount={pageCount} pageHeight={pageHeight} width={canvasSize.width} />
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
                        {snapIndicator && <SnapIndicator indicator={snapIndicator} />}
                        <rect ref={selectionRectRef} x="0" y="0" width="0" height="0" fill="#3b82f6" fillOpacity="0.1" stroke="#3b82f6" strokeWidth="1" style={{ display: 'none', pointerEvents: 'none' }} />
                    </svg>
                    {textEditing && <TextEditorInput editing={textEditing} setEditing={setTextEditing} inputRef={inputRef} onFinish={finishTextEditing} onCancel={cancelTextEditing} strokeColor={currentStyle.stroke} />}
                    {angleEditing && <AngleEditorInput editing={angleEditing} setEditing={setAngleEditing} inputRef={angleInputRef} onCommit={commitAngleEdit} />}
                </div>
                {pickingMirrorMode && <MirrorBanner />}
                <AddPageButton pageCount={pageCount} onAdd={() => setPageCount(p => p + 1)} />
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
        
        <StatusToasts loadingState={loadingState} saveMessage={saveMessage} />
    </div>
  );
}