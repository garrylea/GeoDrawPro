import React from 'react';
import { FunctionSquare } from 'lucide-react';
import { Shape, ShapeType } from '../../../types';
import { generateQuadraticPath, standardToVertex, vertexToStandard } from '../../../utils/quadraticFunction';
import { PropertiesSection } from './PropertiesSection';
import { NumberInput } from './NumberInput';

const PARAM_DESCRIPTIONS: Record<string, string> = {
    a: "Controls the width and direction (vertical stretch).",
    b: "Affects the horizontal position of the axis of symmetry.",
    c: "The Y-intercept (vertical shift).",
    h: "Horizontal shift of the vertex.",
    k: "Vertical shift of the vertex."
};

interface FunctionSectionProps {
  selectedShape: Shape;
  selectedIds: Set<string>;
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
  saveHistory: () => void;
  canvasSize: { width: number; height: number };
  pixelsPerUnit: number;
  originY: number;
  isOpen: boolean;
  onToggle: () => void;
}

/** Quadratic/linear parameter controls (moved verbatim from PropertiesPanel.tsx, S10). */
export const FunctionSection: React.FC<FunctionSectionProps> = ({
  selectedShape,
  selectedIds,
  setShapes,
  saveHistory,
  canvasSize,
  pixelsPerUnit,
  originY,
  isOpen,
  onToggle,
}) => {
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

  if (selectedShape.type !== ShapeType.FUNCTION_GRAPH || !selectedShape.formulaParams) return null;

  return (
    <PropertiesSection
        title={(selectedShape.functionType || 'quadratic') === 'linear' ? 'Linear Function' : 'Quadratic Function'}
        icon={FunctionSquare}
        isOpen={isOpen}
        onToggle={onToggle}
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
    </PropertiesSection>
  );
};
FunctionSection.displayName = 'FunctionSection';
