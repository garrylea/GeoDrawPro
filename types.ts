
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
  
  // Specific for Functions
  // functionType defaults to 'quadratic' if undefined
  functionType?: 'quadratic' | 'linear'; 
  functionForm?: 'standard' | 'vertex';
  // Quadratic: a, b, c, h, k
  // Linear: k (slope), b (intercept) -> reusing k and b, or explicit mapping
  // We will map Linear Slope -> k, Linear Intercept -> b (using the same keys for simplicity in storage, interpreted differently based on functionType)
  // Actually, to avoid confusion with Vertex 'k', let's stick to using 'k' key for slope in linear, 
  // but we must be careful in the UI to read the right field.
  // Ideally: Linear uses m (slope) and b (intercept).
  // Let's allow generic keys in formulaParams.
  formulaParams?: { 
      a?: number; b?: number; c?: number; // Quadratic Standard
      h?: number; k?: number;             // Quadratic Vertex OR Linear Slope (k) + Intercept (b)??
      // To avoid ambiguity, let's explicit:
      // Linear: uses 'k' (slope) and 'b' (intercept). 
      // Note: 'b' is also in quadratic standard. 'k' is also in quadratic vertex.
      // This is fine as long as we check functionType.
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
