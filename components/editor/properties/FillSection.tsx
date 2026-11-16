import React from 'react';
import { PaintBucket } from 'lucide-react';
import { COLORS } from '../../../constants';
import { PropertiesSection } from './PropertiesSection';

interface FillSectionProps {
  effectiveFill: string;
  onColorChange: (color: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Fill color controls (moved verbatim from PropertiesPanel.tsx, S10). */
export const FillSection: React.FC<FillSectionProps> = ({ effectiveFill, onColorChange, isOpen, onToggle }) => {
  return (
    <PropertiesSection
      title="Fill"
      icon={PaintBucket}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="grid grid-cols-5 gap-2">
          <button 
              onClick={() => onColorChange('transparent')}
              className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110 active:scale-95 ${effectiveFill === 'transparent' ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
              style={{ backgroundColor: '#ffffff' }}
              title="No Fill"
          >
              <div className="absolute inset-0 bg-red-500 w-[1px] h-full left-1/2 -translate-x-1/2 rotate-45" />
          </button>
          {COLORS.filter(c => c !== 'transparent').map(c => (
              <button 
              key={c} 
              onClick={() => onColorChange(c)} 
              className={`w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110 active:scale-95 ${effectiveFill === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} 
              style={{ backgroundColor: c }}
              title={c}
              />
          ))}
      </div>
    </PropertiesSection>
  );
};
FillSection.displayName = 'FillSection';
