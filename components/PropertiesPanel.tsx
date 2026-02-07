import React, { useState } from 'react';
import { Shape, ShapeType, AxisConfig } from '../types';
import { COLORS } from '../constants';
import { recalculateMarker, generateQuadraticPath, standardToVertex, vertexToStandard } from '../utils/mathUtils';
import { 
  Radius, FunctionSquare, Grid3X3, Sparkles, CaseUpper, 
  Wand2, FoldHorizontal, Maximize, Minus, Plus, 
  Fingerprint, ChevronDown, PaintBucket, PenTool
} from 'lucide-react';

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

const PARAM_DESCRIPTIONS: Record<string, string> = {
    a: "Controls the width and direction (vertical stretch).",
    b: "Affects the horizontal position of the axis of symmetry.",
    c: "The Y-intercept (vertical shift).",
    h: "Horizontal shift of the vertex.",
    k: "Vertical shift of the vertex."
};

interface SectionProps {
  title: string;
  icon: any;
  children?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

const Section = ({ title, icon: Icon, children, isOpen, onToggle }: SectionProps) => {
  return (
    <div className="border-b border-slate-100">
       <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors focus:outline-none">
         <div className="flex items-center gap-2 font-bold text-slate-700 text-sm uppercase tracking-wide">
            <Icon size={16} className="text-blue-500" /> {title}
         </div>
         <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
       </button>
       <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-4 pb-4">
             {children}
          </div>
       </div>
    </div>
  );
};

const NumberInput = ({ value, onChange, className, step = "0.1", placeholder, title }: { value: number, onChange: (val: number) => void, className?: string, step?: string, placeholder?: string, title?: string }) => {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    React.useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed)) {
            onChange(parsed);
        } else if (newVal === '' || newVal === '-') {
            // Allow empty or negative sign without updating parent yet (or update to 0 if preferred, but usually better to wait)
            // If we don't update parent, the chart won't update while typing "-", which is fine.
        }
    };

    const handleBlur = () => {
        const parsed = parseFloat(localValue);
        if (isNaN(parsed)) {
            setLocalValue(value.toString()); // Revert to last valid prop value
        } else {
             // Ensure parent is definitely synced (though likely already done via change)
             onChange(parsed);
        }
    };

    return (
        <input 
            type="number" 
            step={step}
            value={localValue} 
            onFocus={(e) => e.target.select()}
            onChange={handleChange}
            onBlur={handleBlur}
            className={className} 
            placeholder={placeholder}
            title={title}
        />
    );
};

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

  const toggleFunctionForm = (newForm: 'standard' | 'vertex') => {
    if (selectedIds.size !== 1) return;
    saveHistory();
    const id = [...selectedIds][0];
    setShapes(prev => prev.map(s => 
      (s.id === id && s.formulaParams) 
        ? { 
            ...s, 
            functionForm: newForm, 
            pathData: generateQuadraticPath(
                s.formulaParams, 
                newForm, 
                canvasSize.width, 
                canvasSize.height, 
                pixelsPerUnit, 
                s.functionType || 'quadratic',
                originY
            ) 
          } 
        : s
    ));
  };

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

  const updateFunctionParams = (key: string, val: number) => {
      if (!selectedShape) return;
      const roundedVal = Math.round(val * 10) / 10;
      setShapes(prev => prev.map(s => {
          if (s.id === selectedShape.id && s.formulaParams) {
              const prevParams = s.formulaParams;
              let newParams = { ...prevParams, [key]: roundedVal };
              const fType = s.functionType || 'quadratic';
              
              if (fType === 'quadratic') {
                  const a = (key === 'a' ? roundedVal : (prevParams.a ?? 1));
                  
                  if (s.functionForm === 'standard') {
                      // Edited a, b, or c -> Recalculate h, k
                      // Note: If key is 'a', it's already updated in newParams
                      const b = (key === 'b' ? roundedVal : (prevParams.b ?? 0));
                      const c = (key === 'c' ? roundedVal : (prevParams.c ?? 0));
                      
                      const { h, k } = standardToVertex(a, b, c);
                      newParams.h = Math.round(h * 10) / 10;
                      newParams.k = Math.round(k * 10) / 10;
                  } else {
                      // Edited a, h, or k -> Recalculate b, c
                      const h = (key === 'h' ? roundedVal : (prevParams.h ?? 0));
                      const k = (key === 'k' ? roundedVal : (prevParams.k ?? 0));
                      
                      const { b, c } = vertexToStandard(a, h, k);
                      newParams.b = Math.round(b * 10) / 10;
                      newParams.c = Math.round(c * 10) / 10;
                  }
              }

              return { 
                  ...s, 
                  formulaParams: newParams, 
                  pathData: generateQuadraticPath(
                      newParams, 
                      s.functionForm || 'standard', 
                      canvasSize.width, 
                      canvasSize.height, 
                      pixelsPerUnit, 
                      fType,
                      originY
                  ) 
              };
          }
          return s;
      }));
  };

  const handleSectionToggle = (id: string) => {
      setActiveSection(prev => prev === id ? null : id);
  };

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-y-auto custom-scrollbar">
      
      {/* Contextual: Marker Properties */}
      {selectedShape?.type === ShapeType.MARKER && selectedShape.markerConfig && (
        <Section 
            title="Marker Type" 
            icon={Radius} 
            isOpen={activeSection === 'marker'} 
            onToggle={() => handleSectionToggle('marker')}
        >
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => { saveHistory(); setShapes(ps => ps.map(s => (s.id === selectedShape.id && s.markerConfig) ? (recalculateMarker({ ...s, markerConfig: { ...s.markerConfig, type: 'angle_arc' } }, ps) || s) : s)); }} 
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.markerConfig?.type === 'angle_arc' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Arc
            </button>
            <button 
              onClick={() => { saveHistory(); setShapes(ps => ps.map(s => (s.id === selectedShape.id && s.markerConfig) ? (recalculateMarker({ ...s, markerConfig: { ...s.markerConfig, type: 'perpendicular' } }, ps) || s) : s)); }} 
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.markerConfig?.type === 'perpendicular' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Right Angle
            </button>
          </div>
        </Section>
      )}

      {/* Contextual: Function Properties */}
      {selectedShape?.type === ShapeType.FUNCTION_GRAPH && selectedShape.formulaParams && (
        <Section 
            title={(selectedShape.functionType || 'quadratic') === 'linear' ? 'Linear Function' : 'Quadratic Function'} 
            icon={FunctionSquare}
            isOpen={activeSection === 'function'}
            onToggle={() => handleSectionToggle('function')}
        >
          {(selectedShape.functionType || 'quadratic') === 'quadratic' ? (
              <>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                    <button 
                    onClick={() => toggleFunctionForm('standard')} 
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.functionForm === 'standard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                    >
                    Standard
                    </button>
                    <button 
                    onClick={() => toggleFunctionForm('vertex')} 
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.functionForm === 'vertex' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                    >
                    Vertex
                    </button>
                </div>
                <div className="space-y-3">
                    {(selectedShape.functionForm === 'standard' ? ['a', 'b', 'c'] : ['a', 'h', 'k']).map(p => (
                    <div key={p} className="flex items-center gap-2" title={PARAM_DESCRIPTIONS[p]}>
                        <span className="w-6 font-bold text-slate-500 cursor-help border-b border-dotted border-slate-300">{p}</span>
                        <NumberInput 
                            step="0.1" 
                            value={selectedShape.formulaParams![p as keyof typeof selectedShape.formulaParams] ?? 0} 
                            onChange={(val) => { saveHistory(); updateFunctionParams(p, val); }}
                            className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                            placeholder={PARAM_DESCRIPTIONS[p]}
                        />
                    </div>
                    ))}
                </div>
                <div className="text-xs text-slate-400 mt-3 bg-slate-50 p-2 rounded">
                    {selectedShape.functionForm === 'standard' ? (
                        <span>Format: y = ax² + bx + c</span>
                    ) : (
                        <span>Format: y = a(x - h)² + k</span>
                    )}
                </div>
              </>
          ) : (
              <div className="space-y-3">
                   <div className="flex items-center gap-2" title="Slope (k)">
                        <span className="w-6 font-bold text-slate-500 italic border-b border-dotted border-slate-300 cursor-help">k</span>
                        <NumberInput 
                            step="0.1" 
                            title="Slope of the line"
                            value={selectedShape.formulaParams.k ?? 1} 
                            onChange={(val) => { saveHistory(); updateFunctionParams('k', val); }}
                            className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                        />
                   </div>
                   <div className="flex items-center gap-2" title="Y-Intercept (b)">
                        <span className="w-6 font-bold text-slate-500 italic border-b border-dotted border-slate-300 cursor-help">b</span>
                        <NumberInput 
                            step="0.1" 
                            title="Y-intercept of the line"
                            value={selectedShape.formulaParams.b ?? 0} 
                            onChange={(val) => { saveHistory(); updateFunctionParams('b', val); }}
                            className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                        />
                   </div>
                   <div className="text-xs text-slate-400 mt-2 bg-slate-50 p-2 rounded">
                       Format: y = kx + b
                   </div>
              </div>
          )}
        </Section>
      )}

      {/* Styles: Stroke */}
      <Section 
        title="Stroke" 
        icon={PenTool}
        isOpen={activeSection === 'stroke'}
        onToggle={() => handleSectionToggle('stroke')}
      >
         <div className="mb-4">
            <div className="grid grid-cols-5 gap-2 mb-3">
                {COLORS.map(c => (
                    <button 
                    key={c} 
                    onClick={() => updateStrokeColor(c)} 
                    className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110 active:scale-95 ${effectiveStroke === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} 
                    style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                    title={c}
                    >
                    {c === 'transparent' && <div className="absolute inset-0 bg-red-500 w-[1px] h-full left-1/2 -translate-x-1/2 rotate-45" />}
                    </button>
                ))}
            </div>
            
            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span>Thickness</span>
                <span className="text-slate-600">{effectiveStrokeWidth}px</span>
            </div>
            <div className="flex items-center space-x-2 mb-4">
                <div className="text-slate-400"><Minus size={14} /></div>
                <input 
                    type="range" min="1" max="10" 
                    value={effectiveStrokeWidth} 
                    onPointerDown={() => saveHistory()}
                    onChange={(e) => updateStrokeWidth(parseInt(e.target.value))} 
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                />
                <div className="text-slate-400"><Plus size={14} /></div>
            </div>

            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Pattern</label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                {['solid', 'dashed', 'dotted'].map(t => (
                    <button 
                    key={t} 
                    onClick={() => updateStrokeType(t as any)} 
                    className={`flex-1 py-1 text-xs font-bold uppercase rounded-md transition-all ${effectiveStrokeType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                    >
                    {t}
                    </button>
                ))}
            </div>
         </div>
      </Section>

      {/* Styles: Fill */}
      <Section 
        title="Fill" 
        icon={PaintBucket}
        isOpen={activeSection === 'fill'}
        onToggle={() => handleSectionToggle('fill')}
      >
        <div className="grid grid-cols-5 gap-2">
            <button 
                onClick={() => updateFillColor('transparent')}
                className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110 active:scale-95 ${effectiveFill === 'transparent' ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                style={{ backgroundColor: '#ffffff' }}
                title="No Fill"
            >
                <div className="absolute inset-0 bg-red-500 w-[1px] h-full left-1/2 -translate-x-1/2 rotate-45" />
            </button>
            {COLORS.filter(c => c !== 'transparent').map(c => (
                <button 
                key={c} 
                onClick={() => updateFillColor(c)} 
                className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110 active:scale-95 ${effectiveFill === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} 
                style={{ backgroundColor: c }}
                title={c}
                />
            ))}
        </div>
      </Section>

      {/* Smart Tools */}
      <Section 
        title="Smart Tools" 
        icon={Sparkles}
        isOpen={activeSection === 'tools'}
        onToggle={() => handleSectionToggle('tools')}
      >
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setAutoLabelMode(!autoLabelMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${autoLabelMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <CaseUpper size={16} /> Auto AB
          </button>
          <button onClick={() => setSmartSketchMode(!smartSketchMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${smartSketchMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Wand2 size={16} /> Sketch Fix
          </button>
          <button onClick={() => setPressureEnabled(!pressureEnabled)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${pressureEnabled ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Fingerprint size={16} /> Pressure
          </button>
          <button onClick={() => setMarkingAnglesMode(!markingAnglesMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${markingAnglesMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Radius size={16} /> Angles
          </button>
          <button onClick={() => setPickingMirrorMode(!pickingMirrorMode)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${pickingMirrorMode ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <FoldHorizontal size={16} /> Mirror
          </button>
        </div>
        <button onClick={onFitToViewport} className="w-full p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors uppercase tracking-wide">
          <Maximize size={14} /> Fit Content to View
        </button>
      </Section>

      {/* Coordinate System */}
      <Section 
        title="Coordinates" 
        icon={Grid3X3}
        isOpen={activeSection === 'coordinates'}
        onToggle={() => handleSectionToggle('coordinates')}
      >
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
            <span>Ticks Density</span><span>{axisConfig.ticks}</span>
          </div>
          <input type="range" min="2" max="20" value={axisConfig.ticks} onChange={(e) => setAxisConfig(prev => ({ ...prev, ticks: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        </div>
      </Section>

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
        prev.markingAnglesMode !== next.markingAnglesMode ||
        prev.pickingMirrorMode !== next.pickingMirrorMode) return false;

    // If no selection, and no global mode change, skip render even if 'shapes' changed (e.g. background drawing)
    if (prev.selectedIds.size === 0) return true;

    // If there is a selection, we must check if the selected shape inside 'shapes' array has changed
    const prevSel = prev.shapes.find(s => prev.selectedIds.has(s.id));
    const nextSel = next.shapes.find(s => next.selectedIds.has(s.id));
    
    return prevSel === nextSel;
});