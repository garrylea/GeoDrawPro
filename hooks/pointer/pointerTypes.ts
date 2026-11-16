import { Dispatch, SetStateAction, MutableRefObject, RefObject } from 'react';
import { Shape, Point, Constraint, AxisConfig, TransientState, ToolType } from '../../types';
import type { CompassState } from '../useInteractionSession';

export interface UsePointerHandlersDeps {
    // useInteractionSession
    isDragging: boolean;
    setIsDragging: Dispatch<SetStateAction<boolean>>;
    isRotating: boolean;
    setIsRotating: Dispatch<SetStateAction<boolean>>;
    dragStartPos: Point | null;
    setDragStartPos: Dispatch<SetStateAction<Point | null>>;
    dragHandleIndex: number | null;
    setDragHandleIndex: Dispatch<SetStateAction<number | null>>;
    activeShapeId: string | null;
    setActiveShapeId: Dispatch<SetStateAction<string | null>>;
    activeLineConstraints: (Constraint | undefined)[];
    setActiveLineConstraints: Dispatch<SetStateAction<(Constraint | undefined)[]>>;
    setSnapIndicator: Dispatch<SetStateAction<(Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' }) | null>>;
    setCursorPos: Dispatch<SetStateAction<Point | null>>;
    cursorPosRef: MutableRefObject<Point | null>;
    lastHitTestTime: MutableRefObject<number>;
    isScrollingRef: MutableRefObject<boolean>;
    lastScrollPos: MutableRefObject<{ x: number; y: number } | null>;
    selectionRectRef: RefObject<SVGRectElement>;
    selectionStartRef: MutableRefObject<Point | null>;
    shapeBoundsCache: MutableRefObject<Map<string, { minX: number; minY: number; maxX: number; maxY: number }>>;
    hoveredShapeId: string | null;
    setHoveredShapeId: Dispatch<SetStateAction<string | null>>;
    rotationCenter: Point | null;
    isShiftPressed: boolean;
    isAltPressed: boolean;
    compassState: CompassState;
    setCompassState: Dispatch<SetStateAction<CompassState>>;
    compassPreviewPath: string | null;
    setCompassPreviewPath: Dispatch<SetStateAction<string | null>>;
    lastRotationMouseAngle: MutableRefObject<number>;
    // useDocument
    shapes: Shape[];
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    shapesRef: MutableRefObject<Shape[]>;
    saveHistory: () => void;
    selectedIds: Set<string>;
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    // useViewport
    zoom: number;
    canvasSize: { width: number; height: number };
    svgHeight: number;
    pixelsPerUnit: number;
    originY: number;
    containerRef: RefObject<HTMLDivElement>;
    // useTransientTransforms
    transientStateRef: MutableRefObject<TransientState | null>;
    domCacheRef: MutableRefObject<Map<string, Element>>;
    initialShapeStateRef: MutableRefObject<Map<string, Shape>>;
    updateTransientVisuals: (state: TransientState | null) => void;
    refreshDomCache: (idsOverride?: Set<string>) => void;
    // useInlineEditors
    textEditing: { id: string; x: number; y: number; text: string } | null;
    angleEditing: { id: string; index: number; x: number; y: number; value: string } | null;
    finishTextEditing: () => void;
    setTextEditing: Dispatch<SetStateAction<{ id: string; x: number; y: number; text: string } | null>>;
    // Editor locals
    svgRef: RefObject<SVGSVGElement>;
    tool: ToolType;
    setTool: Dispatch<SetStateAction<ToolType>>;
    currentStyle: { fill: string; stroke: string; strokeWidth: number; strokeType: 'solid' | 'dashed' | 'dotted' };
    axisConfig: AxisConfig;
    lockBackground: boolean;
    pickingMirrorMode: boolean;
    markingAnglesMode: boolean;
    autoLabelMode: boolean;
    smartSketchMode: boolean;
    pressureEnabled: boolean;
    generateId: () => string;
    handleFold: (lineId: string) => void;
}
