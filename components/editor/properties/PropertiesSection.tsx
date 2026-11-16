import React from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

export interface PropertiesSectionProps {
  title: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

/** Accordion section shared by all PropertiesPanel blocks (moved verbatim from PropertiesPanel.tsx, S10). */
export const PropertiesSection: React.FC<PropertiesSectionProps> = ({ title, icon: Icon, children, isOpen, onToggle }) => {
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
PropertiesSection.displayName = 'PropertiesSection';
