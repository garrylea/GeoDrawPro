import React from 'react';
import { Radius } from 'lucide-react';
import { Shape, ShapeType } from '../../../types';
import { recalculateMarker } from '../../../utils/markerEditing';
import { PropertiesSection } from './PropertiesSection';

interface MarkerSectionProps {
  selectedShape: Shape;
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
  saveHistory: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Marker type controls (moved verbatim from PropertiesPanel.tsx, S10). */
export const MarkerSection: React.FC<MarkerSectionProps> = ({ selectedShape, setShapes, saveHistory, isOpen, onToggle }) => {
  if (selectedShape.type !== ShapeType.MARKER || !selectedShape.markerConfig) return null;

  return (
    <PropertiesSection
        title="Marker Type"
        icon={Radius}
        isOpen={isOpen}
        onToggle={onToggle}
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
    </PropertiesSection>
  );
};
MarkerSection.displayName = 'MarkerSection';
