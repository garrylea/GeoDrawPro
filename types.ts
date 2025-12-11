
export enum ToolType {
  SELECT = 'SELECT',
  POINT = 'POINT',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE',
  ELLIPSE = 'ELLIPSE',
  TRIANGLE = 'TRIANGLE',
  TEXT = 'TEXT',
  FREEHAND = 'FREEHAND',
  PROTRACTOR = 'PROTRACTOR'
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
  PROTRACTOR = 'PROTRACTOR',
  MARKER = 'MARKER' // New: Smart Geometric Marker
}

export interface Point {
  x: number;
  y: number;
}

export type MarkerType = 'perpendicular' | 'parallel_arrow' | 'equal_tick' | 'angle_arc';

export interface MarkerConfig {
    type: MarkerType;
    // Stores references to the parent shapes.
    // e.g. For a perpendicular mark between two lines:
    // targets: [{ shapeId: 'line1', pointIndices: [0,1] }, { shapeId: 'line2', pointIndices: [0,1] }]
    // For a tick mark on a triangle edge:
    // targets: [{ shapeId: 'tri1', pointIndices: [1,2] }]
    targets: { shapeId: string; pointIndices: number[] }[]; 
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
  
  // New: Configuration for Smart Markers
  markerConfig?: MarkerConfig;
}

export interface AxisConfig {
  visible: boolean;
  ticks: number;
  color: string;
  showGrid: boolean;
}
