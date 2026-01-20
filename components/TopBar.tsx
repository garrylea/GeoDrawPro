import React, { useState } from 'react';
import { 
  Spline, Box, ChevronDown, Apple, Monitor, Terminal, 
  Image as ImageIcon, FolderOpen, Save, Undo, Trash2, 
  Eraser, Download 
} from 'lucide-react';
import { Shape } from '../types';
import { exportCanvas, exportAppIcon, isElectron } from '../utils/exportUtils';

interface TopBarProps {
  shapes: Shape[];
  svgRef: React.RefObject<SVGSVGElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  undo: () => void;
  deleteSelected: () => void;
  clearAll: () => void;
  selectedIds: Set<string>;
  onSave: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  shapes,
  svgRef,
  imageInputRef,
  fileInputRef,
  undo,
  deleteSelected,
  clearAll,
  selectedIds,
  onSave,
}) => {
  const [showIconDropdown, setShowIconDropdown] = useState(false);

  return (
    <div className="hidden lg:flex bg-white border-b border-slate-200 px-4 py-2 items-center justify-between shadow-sm z-20 shrink-0 h-14">
      <div className="flex items-center space-x-2">
        <div className="bg-blue-600 text-white p-1 rounded-lg">
          <Spline size={20} />
        </div>
        <h1 className="font-bold text-lg text-slate-800 tracking-tight">GeoDraw Pro</h1>
      </div>

      <div className="flex items-center space-x-2 relative">
        {/* App Icon Export Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowIconDropdown(!showIconDropdown)} 
            className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1.5 text-sm font-semibold transition-colors" 
            title="Export Icons from icon.svg"
          >
            <Box size={18} className="text-blue-600" /> Icon <ChevronDown size={14} />
          </button>
          
          {showIconDropdown && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
              <button 
                onClick={() => { setShowIconDropdown(false); exportAppIcon('icon.svg', 'icns'); }} 
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
              >
                <Apple size={16} className="text-slate-400" /> <span className="flex-1">MacOS</span>
              </button>
              <button 
                onClick={() => { setShowIconDropdown(false); exportAppIcon('icon.svg', 'ico'); }} 
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
              >
                <Monitor size={16} className="text-slate-400" /> <span className="flex-1">Windows</span>
              </button>
              <button 
                onClick={() => { setShowIconDropdown(false); exportAppIcon('icon.svg', 'png'); }} 
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
              >
                <Terminal size={16} className="text-slate-400" /> <span className="flex-1">Linux</span>
              </button>
            </div>
          )}
        </div>

        <button 
          onClick={() => imageInputRef.current?.click()} 
          className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" 
          title="Import Image"
        >
          <ImageIcon size={18}/> Image
        </button>

        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" 
          title="Open"
        >
          <FolderOpen size={18}/> Open
        </button>

        <button 
          onClick={onSave} 
          className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" 
          title="Save"
        >
          <Save size={18}/> Save
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1"></div>

        <button 
          onClick={undo} 
          className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 text-sm font-medium" 
          title="Undo"
        >
          <Undo size={18}/> Undo
        </button>

        <button 
          onClick={deleteSelected} 
          className={`p-2 rounded flex items-center gap-1 text-sm font-medium transition-colors ${selectedIds.size > 0 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'}`} 
          title="Delete"
          disabled={selectedIds.size === 0}
        >
          <Trash2 size={18}/> Delete
        </button>

        <button 
          onClick={clearAll} 
          className="p-2 text-red-500 hover:bg-red-50 rounded flex items-center gap-1 text-sm font-medium" 
          title="Clear All"
        >
          <Eraser size={18}/> Clear All
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1"></div>

        <button 
          onClick={() => svgRef.current && exportCanvas(svgRef.current, 'png', 'drawing')} 
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 hover:bg-blue-700 shadow-sm transition-all"
        >
          <Download size={16}/> Export
        </button>
      </div>
    </div>
  );
};