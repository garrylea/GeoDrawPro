
import React from 'react';
import { ToolType } from '../types';
import { TOOL_CONFIG } from '../constants';

interface SidebarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTool, onToolChange }) => {
  const standardTools = TOOL_CONFIG.filter(t => 
    ![ToolType.RULER, ToolType.COMPASS, ToolType.PROTRACTOR].includes(t.id)
  );
  
  const constructionTools = TOOL_CONFIG.filter(t => 
    [ToolType.RULER, ToolType.COMPASS, ToolType.PROTRACTOR].includes(t.id)
  );

  const renderToolButton = (t: typeof TOOL_CONFIG[0]) => (
    <button 
      key={t.id} 
      onClick={() => onToolChange(t.id)} 
      className={`p-2 rounded-lg transition-all ${
        activeTool === t.id 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`} 
      title={t.label}
    >
      <t.icon size={22} strokeWidth={activeTool === t.id ? 2.5 : 2} />
    </button>
  );

  return (
    <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-1 z-10 overflow-y-auto scrollbar-hide shrink-0">
      {standardTools.map(renderToolButton)}
      
      <div className="w-10 h-px bg-slate-300 my-1"></div>
      
      {constructionTools.map(renderToolButton)}
    </div>
  );
};
