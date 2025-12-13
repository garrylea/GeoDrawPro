
export enum ToolType {
  SELECT = 'SELECT',
  POINT = 'POINT',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE',
  ELLIPSE = 'ELLIPSE',
  TRIANGLE = 'TRIANGLE',
  POLYGON = 'POLYGON', // Added
  TEXT = 'TEXT',
  FREEHAND = 'FREEHAND',
  PROTRACTOR = 'PROTRACTOR',
  FUNCTION = 'FUNCTION',
  COMPASS = 'COMPASS', // New
  RULER = 'RULER'      // New
}

export enum ShapeType {
  POINT = 'POINT',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE',
  ELLIPSE = 'ELLIPSE',
  TRIANGLE = 'TRIANGLE',
  TEXT = 'TEXT',
  FREEHAND = 'FREEHAND',
  PATH = 'PATH',
  POLYGON = 'POLYGON',
  PROTRACTOR = 'PROTRACTOR',
  RULER = 'RULER', // Added
  MARKER = 'MARKER',
  FUNCTION_GRAPH = 'FUNCTION_GRAPH'
}

export interface Point {
  x: number;
  y: number;
}

export type MarkerType = 'perpendicular' | 'parallel_arrow' | 'equal_tick' | 'angle_arc';

export interface MarkerConfig {
    type: MarkerType;
    targets: { shapeId: string; pointIndices: number[] }[]; 
}

export interface Constraint {
    type: 'on_path' | 'intersection';
    parentId?: string; // For on_path
    parents?: string[]; // For intersection (two shape IDs)
    // For function constraints, we might store the specific t-value (math X) to preserve relative position logic
    paramX?: number; 
}

export interface Shape {
  id: string;
  type: ShapeType;
  points: Point[]; 
  
  text?: string; 
  labels?: string[]; 
  fontSize?: number; 
  pathData?: string; 
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeType?: 'solid' | 'dashed' | 'dotted'; 
  rotation: number; 
  
  markerConfig?: MarkerConfig;
  constraint?: Constraint;
  isTracing?: boolean; 
  
  // Specific for Quadratic Functions: 
  // Standard: y = ax^2 + bx + c
  // Vertex: y = a(x-h)^2 + k
  functionForm?: 'standard' | 'vertex';
  formulaParams?: { a: number; b: number; c: number; h?: number; k?: number };
  
  // Flag for construction marks (drawn by compass/ruler)
  isConstruction?: boolean;
}

export interface AxisConfig {
  visible: boolean;
  ticks: number;
  color: string;
  showGrid: boolean;
}
