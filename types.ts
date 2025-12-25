
export enum ToolType {
  SELECT = 'SELECT',
  ERASER = 'ERASER',
  POINT = 'POINT',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE',
  ELLIPSE = 'ELLIPSE',
  TRIANGLE = 'TRIANGLE',
  POLYGON = 'POLYGON',
  TEXT = 'TEXT',
  FREEHAND = 'FREEHAND',
  PROTRACTOR = 'PROTRACTOR',
  FUNCTION = 'FUNCTION',
  LINEAR_FUNCTION = 'LINEAR_FUNCTION', // New
  COMPASS = 'COMPASS',
  RULER = 'RULER',
  IMAGE = 'IMAGE'
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
  RULER = 'RULER',
  MARKER = 'MARKER',
  FUNCTION_GRAPH = 'FUNCTION_GRAPH',
  IMAGE = 'IMAGE'
}

export interface Point {
  x: number;
  y: number;
  p?: number; // Pressure sensitivity (0.0 to 1.0)
}

export interface TransientState {
  dx?: number;
  dy?: number;
  rotation?: number;
  rotationCenter?: Point;
  scale?: { x: number; y: number }; // Added for resize optimization
  scaleCenter?: Point;
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
  
  // Pressure sensitivity metadata
  usePressure?: boolean;

  // Geometric Constraints
  lockedAngles?: number[]; // Indices of angles that are fixed/locked by user input
  lastModifiedAngleIndex?: number; // Tracks the last angle index modified by the user

  // Specific for Functions
  functionType?: 'quadratic' | 'linear'; 
  functionForm?: 'standard' | 'vertex';
  formulaParams?: { 
      a?: number; b?: number; c?: number; 
      h?: number; k?: number;             
  };
  
  isConstruction?: boolean;
  imageUrl?: string;
}

export interface AxisConfig {
  visible: boolean;
  ticks: number;
  color: string;
  showGrid: boolean;
}