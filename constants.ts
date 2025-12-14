
import { ToolType } from './types';
import { MousePointer2, Dot, Minus, Square, Circle, Triangle, Egg, Maximize, Type, Pencil, Gauge, FunctionSquare, Ruler, Compass, Image as ImageIcon } from 'lucide-react';

export const COLORS = [
  'transparent', '#000000', '#ffffff', 
  '#ef4444', '#f97316', '#f59e0b', 
  '#84cc16', '#10b981', '#06b6d4', 
  '#3b82f6', '#6366f1', '#8b5cf6', 
  '#d946ef', '#f43f5e', '#71717a'
];

export const MATH_SYMBOLS = [
    'α', 'β', 'γ', 'θ', 'φ', 'Δ', 'π', 'Ω', 'Σ', '°', '∞', '≈'
];

export const TOOL_CONFIG = [
  { id: ToolType.SELECT, label: 'Select', icon: MousePointer2 },
  { id: ToolType.FREEHAND, label: 'Pencil', icon: Pencil },
  { id: ToolType.COMPASS, label: 'Compass', icon: Compass }, // New
  { id: ToolType.RULER, label: 'Ruler', icon: Ruler },       // New
  { id: ToolType.FUNCTION, label: 'Function', icon: FunctionSquare },
  { id: ToolType.IMAGE, label: 'Image', icon: ImageIcon },   // New
  { id: ToolType.POINT, label: 'Point', icon: Dot },
  { id: ToolType.LINE, label: 'Line', icon: Minus },
  { id: ToolType.RECTANGLE, label: 'Rectangle', icon: Maximize },
  { id: ToolType.SQUARE, label: 'Square', icon: Square },
  { id: ToolType.CIRCLE, label: 'Circle', icon: Circle },
  { id: ToolType.ELLIPSE, label: 'Ellipse', icon: Egg },
  { id: ToolType.TRIANGLE, label: 'Triangle', icon: Triangle },
  { id: ToolType.PROTRACTOR, label: 'Protractor', icon: Gauge },
  { id: ToolType.TEXT, label: 'Text', icon: Type },
];

export const DEFAULT_SHAPE_PROPS = {
  fill: 'transparent',
  stroke: '#000000',
  strokeWidth: 2,
  strokeType: 'solid' as const,
};
