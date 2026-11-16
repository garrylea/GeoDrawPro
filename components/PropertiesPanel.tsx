import React, { useState } from 'react';
import { Shape, ShapeType, AxisConfig } from '../types';
import { MarkerSection } from './editor/properties/MarkerSection';
import { FunctionSection } from './editor/properties/FunctionSection';
import { StrokeSection } from './editor/properties/StrokeSection';
import { FillSection } from './editor/properties/FillSection';
import { SmartToolsSection } from './editor/properties/SmartToolsSection';
import { CoordinatesSection } from './editor/properties/CoordinatesSection';

interface PropertiesPanelProps {
  selectedShape: Shape | null;
  shapes: Shape[];
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
  selectedIds: Set<string>;
  axisConfig: AxisConfig;
  setAxisConfig: React.Dispatch<React.SetStateAction<AxisConfig>>;
  autoLabelMode: boolean;
  setAutoLabelMode: (v: boolean) => void;
  smartSketchMode: boolean;
  setSmartSketchMode: (v: boolean) => void;
  pressureEnabled: boolean;
  setPressureEnabled: (v: boolean) => void;
  lockBackground: boolean;
  setLockBackground: (v: boolean) => void;
  markingAnglesMode: boolean;
  setMarkingAnglesMode: (v: boolean) => void;
  pickingMirrorMode: boolean;
  setPickingMirrorMode: (v: boolean) => void;
  currentStyle: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeType: 'solid' | 'dashed' | 'dotted';
  };
  setCurrentStyle: React.Dispatch<React.SetStateAction<{
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeType: 'solid' | 'dashed' | 'dotted';
  }>>;
  canvasSize: { width: number; height: number };
  pixelsPerUnit: number;
  originY: number;
  onFitToViewport: () => void;
  saveHistory: () => void;
  isDragging: boolean;
}

export const PropertiesPanel = React.memo<PropertiesPanelProps>(({
  selectedShape,
  setShapes,
  selectedIds,
  axisConfig,
  setAxisConfig,
  autoLabelMode,
  setAutoLabelMode,
  smartSketchMode,
  setSmartSketchMode,
  pressureEnabled,
  setPressureEnabled,
  lockBackground,
  setLockBackground,
  markingAnglesMode,
  setMarkingAnglesMode,
  pickingMirrorMode,
  setPickingMirrorMode,
  currentStyle,
  setCurrentStyle,
  canvasSize,
  pixelsPerUnit,
  originY,
  onFitToViewport,
  saveHistory,
}) => {
  
  // LOG: Check if Sidebar is re-rendering too often
  // console.log('[PropertiesPanel] Rendering...');

  // Manage accordion state - Set default to 'tools'
  const [activeSection, setActiveSection] = useState<string | null>('tools');

  const effectiveFill = selectedShape ? selectedShape.fill : currentStyle.fill;
  const effectiveStroke = selectedShape ? selectedShape.stroke : currentStyle.stroke;
  const effectiveStrokeWidth = selectedShape ? selectedShape.strokeWidth : currentStyle.strokeWidth;
  const effectiveStrokeType = selectedShape ? selectedShape.strokeType || 'solid' : currentStyle.strokeType;

  const updateStrokeColor = (color: string) => {
    saveHistory();
    setCurrentStyle(p => ({ ...p, stroke: color }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, stroke: color } : s));
    }
  };

  const updateFillColor = (color: string) => {
    saveHistory();
    setCurrentStyle(p => ({ ...p, fill: color }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, fill: color } : s));
    }
  };

  const updateStrokeWidth = (width: number) => {
    setCurrentStyle(p => ({ ...p, strokeWidth: width }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, strokeWidth: width } : s));
    }
  };

  const updateStrokeType = (type: 'solid' | 'dashed' | 'dotted') => {
    saveHistory();
    setCurrentStyle(p => ({ ...p, strokeType: type }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, strokeType: type } : s));
    }
  };

  const handleSectionToggle = (id: string) => {
      setActiveSection(prev => prev === id ? null : id);
  };

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-y-auto custom-scrollbar">
      
      {/* Contextual: Marker Properties */}
      {selectedShape?.type === ShapeType.MARKER && selectedShape.markerConfig && (
        <MarkerSection
            selectedShape={selectedShape}
            setShapes={setShapes}
            saveHistory={saveHistory}
            isOpen={activeSection === 'marker'}
            onToggle={() => handleSectionToggle('marker')}
        />
      )}

      {/* Contextual: Function Properties */}
      {selectedShape?.type === ShapeType.FUNCTION_GRAPH && selectedShape.formulaParams && (
        <FunctionSection
            selectedShape={selectedShape}
            selectedIds={selectedIds}
            setShapes={setShapes}
            saveHistory={saveHistory}
            canvasSize={canvasSize}
            pixelsPerUnit={pixelsPerUnit}
            originY={originY}
            isOpen={activeSection === 'function'}
            onToggle={() => handleSectionToggle('function')}
        />
      )}

      {/* Styles: Stroke */}
      <StrokeSection
        effectiveStroke={effectiveStroke}
        effectiveStrokeWidth={effectiveStrokeWidth}
        effectiveStrokeType={effectiveStrokeType}
        onColorChange={updateStrokeColor}
        onWidthChange={updateStrokeWidth}
        onTypeChange={updateStrokeType}
        saveHistory={saveHistory}
        isOpen={activeSection === 'stroke'}
        onToggle={() => handleSectionToggle('stroke')}
      />

      {/* Styles: Fill */}
      <FillSection
        effectiveFill={effectiveFill}
        onColorChange={updateFillColor}
        isOpen={activeSection === 'fill'}
        onToggle={() => handleSectionToggle('fill')}
      />

      {/* Smart Tools */}
      <SmartToolsSection
        autoLabelMode={autoLabelMode}
        setAutoLabelMode={setAutoLabelMode}
        smartSketchMode={smartSketchMode}
        setSmartSketchMode={setSmartSketchMode}
        pressureEnabled={pressureEnabled}
        setPressureEnabled={setPressureEnabled}
        lockBackground={lockBackground}
        setLockBackground={setLockBackground}
        markingAnglesMode={markingAnglesMode}
        setMarkingAnglesMode={setMarkingAnglesMode}
        pickingMirrorMode={pickingMirrorMode}
        setPickingMirrorMode={setPickingMirrorMode}
        onFitToViewport={onFitToViewport}
        isOpen={activeSection === 'tools'}
        onToggle={() => handleSectionToggle('tools')}
      />

      {/* Coordinate System */}
      <CoordinatesSection
        axisConfig={axisConfig}
        setAxisConfig={setAxisConfig}
        isOpen={activeSection === 'coordinates'}
        onToggle={() => handleSectionToggle('coordinates')}
      />

    </div>
  );
}, (prev, next) => {
    // Optimization: Skip rendering while dragging on canvas to prevent UI lag
    if (next.isDragging) return true;

    // Only re-render if the Selected ID changes, or if the properties of the selected object change.
    // If we are just dragging a box and 'shapes' is changing but selection remains empty, we should SKIP render.
    if (prev.selectedIds !== next.selectedIds) return false;
    
    // Check global modes
    if (prev.currentStyle !== next.currentStyle ||
        prev.axisConfig !== next.axisConfig ||
        prev.autoLabelMode !== next.autoLabelMode ||
        prev.smartSketchMode !== next.smartSketchMode ||
        prev.pressureEnabled !== next.pressureEnabled ||
        prev.lockBackground !== next.lockBackground ||
        prev.markingAnglesMode !== next.markingAnglesMode ||
        prev.pickingMirrorMode !== next.pickingMirrorMode) return false;

    // If no selection, and no global mode change, skip render even if 'shapes' changed (e.g. background drawing)
    if (prev.selectedIds.size === 0) return true;

    // If there is a selection, we must check if the selected shape inside 'shapes' array has changed
    const prevSel = prev.shapes.find(s => prev.selectedIds.has(s.id));
    const nextSel = next.shapes.find(s => next.selectedIds.has(s.id));
    
    return prevSel === nextSel;
});
