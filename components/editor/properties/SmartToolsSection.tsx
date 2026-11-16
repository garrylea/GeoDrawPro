import React from 'react';
import { CaseUpper, Fingerprint, FoldHorizontal, Lock, Maximize, Radius, Sparkles, Wand2 } from 'lucide-react';
import { PropertiesSection } from './PropertiesSection';

interface SmartToolsSectionProps {
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
  onFitToViewport: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Smart-tool toggles and fit-to-view action (moved verbatim from PropertiesPanel.tsx, S10). */
export const SmartToolsSection: React.FC<SmartToolsSectionProps> = ({
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
  onFitToViewport,
  isOpen,
  onToggle,
}) => {
  return (
    <PropertiesSection
      title="Smart Tools"
      icon={Sparkles}
      isOpen={isOpen}
      onToggle={onToggle}
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
        <button onClick={() => setLockBackground(!lockBackground)} className={`p-2 rounded text-xs font-medium border flex flex-col items-center gap-1 transition-colors ${lockBackground ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          <Lock size={16} /> Lock BG
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
    </PropertiesSection>
  );
};
SmartToolsSection.displayName = 'SmartToolsSection';
