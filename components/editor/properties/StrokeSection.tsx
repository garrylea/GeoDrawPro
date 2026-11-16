import React from 'react';
import { Minus, PenTool, Plus } from 'lucide-react';
import { COLORS } from '../../../constants';
import { PropertiesSection } from './PropertiesSection';

interface StrokeSectionProps {
  effectiveStroke: string;
  effectiveStrokeWidth: number;
  effectiveStrokeType: 'solid' | 'dashed' | 'dotted';
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onTypeChange: (type: 'solid' | 'dashed' | 'dotted') => void;
  saveHistory: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Stroke color/width/pattern controls (moved verbatim from PropertiesPanel.tsx, S10). */
export const StrokeSection: React.FC<StrokeSectionProps> = ({
  effectiveStroke,
  effectiveStrokeWidth,
  effectiveStrokeType,
  onColorChange,
  onWidthChange,
  onTypeChange,
  saveHistory,
  isOpen,
  onToggle,
}) => {
  return (
    <PropertiesSection
      title="Stroke"
      icon={PenTool}
      isOpen={isOpen}
      onToggle={onToggle}
    >
       <div className="mb-4">
          <div className="grid grid-cols-5 gap-2 mb-3">
              {COLORS.map(c => (
                  <button 
                  key={c} 
                  onClick={() => onColorChange(c)} 
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
                  onChange={(e) => onWidthChange(parseInt(e.target.value))} 
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
              />
              <div className="text-slate-400"><Plus size={14} /></div>
          </div>

          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Pattern</label>
          <div className="flex bg-slate-100 p-1 rounded-lg">
              {['solid', 'dashed', 'dotted'].map(t => (
                  <button 
                  key={t} 
                  onClick={() => onTypeChange(t as any)} 
                  className={`flex-1 py-1 text-xs font-bold uppercase rounded-md transition-all ${effectiveStrokeType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                  >
                  {t}
                  </button>
              ))}
          </div>
       </div>
    </PropertiesSection>
  );
};
StrokeSection.displayName = 'StrokeSection';
