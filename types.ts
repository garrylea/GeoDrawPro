
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
  FREEHAND = 'FREEHAND'
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
  PATH = 'PATH' // For generic SVG paths like Angle Arcs
}

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  id: string;
  type: ShapeType;
  points: Point[]; // Replaces x,y,width,height. 
  // Point: [p1]
  // Line: [p1, p2]
  // Triangle: [p1, p2, p3]
  // Rect/Circle: [p1 (top-left), p2 (bottom-right)]
  // Text: [p1 (position)]
  // Freehand: [p1, p2, p3, ..., pn]
  // Path: [p1 (position for bounding box calc or just empty if purely pathData dependent)]
  
  text?: string; // For ShapeType.TEXT
  pathData?: string; // For ShapeType.PATH
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeType?: 'solid' | 'dashed' | 'dotted'; // New property for line style
  rotation: number; // In degrees
}

export interface AxisConfig {
  visible: boolean;
  ticks: number;
  color: string;
  showGrid: boolean;
}
