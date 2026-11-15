import { useState, useRef } from 'react';
import { Point, Constraint } from '../types';

export interface CompassState {
    center: Point | null;
    radiusPoint: Point | null;
    startAngle: number | null;
    accumulatedRotation: number;
    lastMouseAngle: number;
}

/**
 * Gesture/session state: drag/rotate/selection gesture flags, snapping and
 * hover indicators, compass construction state and rotation tracking.
 * Moved verbatim from Editor.tsx (S6); resetSession() reproduces exactly the
 * subset of resets that handleToolChange performed inline.
 */
export const useInteractionSession = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
    const [dragHandleIndex, setDragHandleIndex] = useState<number | null>(null);
    const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
    const [activeLineConstraints, setActiveLineConstraints] = useState<(Constraint | undefined)[]>([]);
    const [snapIndicator, setSnapIndicator] = useState<(Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' }) | null>(null);
    const [cursorPos, setCursorPos] = useState<Point | null>(null);
    const cursorPosRef = useRef<Point | null>(null);

    // PERFORMANCE: Hit test throttling
    const lastHitTestTime = useRef<number>(0);

    const isScrollingRef = useRef(false);
    const lastScrollPos = useRef<{x: number, y: number} | null>(null);

    const selectionRectRef = useRef<SVGRectElement>(null);
    const selectionStartRef = useRef<Point | null>(null);
    const shapeBoundsCache = useRef<Map<string, { minX: number, minY: number, maxX: number, maxY: number }>>(new Map());

    const dragHistorySaved = useRef(false);

    const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);

    const [pivotIndex, setPivotIndex] = useState<number | 'center'>('center');
    const [rotationCenter, setRotationCenter] = useState<Point | null>(null);
    const [isAltPressed, setIsAltPressed] = useState(false);
    const [isShiftPressed, setIsShiftPressed] = useState(false);

    const [compassState, setCompassState] = useState<CompassState>({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 });
    const [compassPreviewPath, setCompassPreviewPath] = useState<string | null>(null);

    const lastRotationMouseAngle = useRef<number>(0);

    const resetSession = () => {
        setSnapIndicator(null); setCursorPos(null);
        if (selectionRectRef.current) { selectionRectRef.current.style.display = 'none'; selectionRectRef.current.setAttribute('width', '0'); selectionRectRef.current.setAttribute('height', '0'); }
        selectionStartRef.current = null;
        setActiveShapeId(null); setHoveredShapeId(null);
        setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null);
    };

    return {
        isDragging, setIsDragging, isRotating, setIsRotating,
        dragStartPos, setDragStartPos, dragHandleIndex, setDragHandleIndex,
        activeShapeId, setActiveShapeId, activeLineConstraints, setActiveLineConstraints,
        snapIndicator, setSnapIndicator, cursorPos, setCursorPos, cursorPosRef,
        lastHitTestTime, isScrollingRef, lastScrollPos,
        selectionRectRef, selectionStartRef, shapeBoundsCache, dragHistorySaved,
        hoveredShapeId, setHoveredShapeId, pivotIndex, setPivotIndex,
        rotationCenter, setRotationCenter, isAltPressed, setIsAltPressed,
        isShiftPressed, setIsShiftPressed,
        compassState, setCompassState, compassPreviewPath, setCompassPreviewPath,
        lastRotationMouseAngle, resetSession
    };
};