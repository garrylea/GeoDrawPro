import React from 'react';
import { Grid3X3 } from 'lucide-react';
import { AxisConfig } from '../../../types';
import { PropertiesSection } from './PropertiesSection';

interface CoordinatesSectionProps {
  axisConfig: AxisConfig;
  setAxisConfig: React.Dispatch<React.SetStateAction<AxisConfig>>;
  isOpen: boolean;
  onToggle: () => void;
}

/** Coordinate axes/grid controls (moved verbatim from PropertiesPanel.tsx, S10). */
export const CoordinatesSection: React.FC<CoordinatesSectionProps> = ({ axisConfig, setAxisConfig, isOpen, onToggle }) => {
  return (
    <PropertiesSection
      title="Coordinates"
      icon={Grid3X3}
      isOpen={isOpen}
      onToggle={onToggle}
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
    </PropertiesSection>
  );
};
CoordinatesSection.displayName = 'CoordinatesSection';
