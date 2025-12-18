
import React from 'react';
import { Shape, ShapeType, AxisConfig } from '../types';
import { COLORS } from '../constants';
import { recalculateMarker, generateQuadraticPath } from '../utils/mathUtils';
import { 
  Radius, FunctionSquare, Grid3X3, Sparkles, CaseUpper, 
  Wand2, FoldHorizontal, Maximize, Minus, Plus 
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
  onFitToViewport: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedShape,
  shapes,
  setShapes,
  selectedIds,
  axisConfig,
  setAxisConfig,
  autoLabelMode,
  setAutoLabelMode,
  smartSketchMode,
  setSmartSketchMode,
  markingAnglesMode,
  setMarkingAnglesMode,
  pickingMirrorMode,
  setPickingMirrorMode,
  currentStyle,
  setCurrentStyle,
  canvasSize,
  pixelsPerUnit,
  onFitToViewport,
}) => {
  const toggleFunctionForm = (newForm: 'standard' | 'vertex') => {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    setShapes(prev => prev.map(s => 
      (s.id === id && s.formulaParams) 
        ? { 
            ...s, 
            functionForm: newForm, 
            pathData: generateQuadraticPath(s.formulaParams, newForm, canvasSize.width, canvasSize.height, pixelsPerUnit) 
          } 
        : s
    ));
  };

  const updateShapeColor = (color: string) => {
    setCurrentStyle(p => ({ ...p, stroke: color }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, stroke: color } : s));
    }
  };

  const updateStrokeWidth = (width: number) => {
    setCurrentStyle(p => ({ ...p, strokeWidth: width }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, strokeWidth: width } : s));
    }
  };

  const updateStrokeType = (type: 'solid' | 'dashed' | 'dotted') => {
    setCurrentStyle(p => ({ ...p, strokeType: type }));
    if (selectedIds.size > 0) {
      setShapes(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, strokeType: type } : s));
    }
  };

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto shadow-2xl custom-scrollbar">
      {/* Contextual Shape Properties */}
      {selectedShape?.type === ShapeType.MARKER && selectedShape.markerConfig && (
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm uppercase tracking-wide">
            <Radius size={16} /> Marker Type
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setShapes(ps => ps.map(s => (s.id === selectedShape.id && s.markerConfig) ? (recalculateMarker({ ...s, markerConfig: { ...s.markerConfig, type: 'angle_arc' } }, ps) || s) : s))} 
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${selectedShape.markerConfig?.type === 'angle_arc' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Arc
            </button>
            <button 
              onClick={() => setShapes(ps => ps.map(s => (s.id === selectedShape.id && s.markerConfig) ? (recalculateMarker({ ...s, markerConfig: { ...s.markerConfig, type: 'perpendicular' } }, ps) || s) : s))} 
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
            {(selectedShape.functionForm === 'standard' ? ['a', 'b', 'c'] : ['h', 'k']).map(p => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-6 font-bold text-slate-500">{p}</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={selectedShape.formulaParams![p as keyof typeof selectedShape.formulaParams] || 0} 
                  onChange={(e) => { 
                    const v = parseFloat(e.target.value) || 0; 
                    setShapes(prev => prev.map(s => (s.id === selectedShape.id && s.formulaParams) ? { ...s, formulaParams: { ...s.formulaParams, [p]: v }, pathData: generateQuadraticPath({ ...s.formulaParams, [p]: v }, s.functionForm || 'standard', canvasSize.width, canvasSize.height, pixelsPerUnit) } : s)); 
                  }} 
                  className="flex-1 bg-slate-50 border rounded px-2 py-1 text-sm" 
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Config Sections */}
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
            <span>Ticks Density</span><span>{axisConfig.ticks}</span>
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
        <button onClick={onFitToViewport} className="w-full p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors uppercase tracking-wide">
          <Maximize size={14} /> Fit Content to View
        </button>
      </div>

      <div className="p-5 border-b border-slate-100">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Colors</label>
        <div className="grid grid-cols-5 gap-2">
          {COLORS.map(c => (
            <button 
              key={c} 
              onClick={() => updateShapeColor(c)} 
              className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform active:scale-95 ${currentStyle.stroke === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} 
              style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}
            >
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
          <div className="text-slate-400"><Minus size={14} /></div>
          <input type="range" min="1" max="10" value={currentStyle.strokeWidth} onChange={(e) => updateStrokeWidth(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="text-slate-400"><Plus size={14} /></div>
        </div>
      </div>

      <div className="p-5">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Line Style</label>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {['solid', 'dashed', 'dotted'].map(t => (
            <button 
              key={t} 
              onClick={() => updateStrokeType(t as any)} 
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${currentStyle.strokeType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
