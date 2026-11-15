// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { useInteractionSession } from './useInteractionSession';

const emptyCompass = { center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 };

describe('useInteractionSession initial values', () => {
    it('starts with default gesture state', () => {
        const { result } = renderHook(() => useInteractionSession());
        expect(result.current.isDragging).toBe(false);
        expect(result.current.isRotating).toBe(false);
        expect(result.current.dragStartPos).toBeNull();
        expect(result.current.dragHandleIndex).toBeNull();
        expect(result.current.activeShapeId).toBeNull();
        expect(result.current.activeLineConstraints).toEqual([]);
        expect(result.current.snapIndicator).toBeNull();
        expect(result.current.cursorPos).toBeNull();
        expect(result.current.hoveredShapeId).toBeNull();
        expect(result.current.pivotIndex).toBe('center');
        expect(result.current.rotationCenter).toBeNull();
        expect(result.current.isAltPressed).toBe(false);
        expect(result.current.isShiftPressed).toBe(false);
        expect(result.current.compassState).toEqual(emptyCompass);
        expect(result.current.compassPreviewPath).toBeNull();
    });

    it('starts with null/zero/empty refs', () => {
        const { result } = renderHook(() => useInteractionSession());
        expect(result.current.cursorPosRef.current).toBeNull();
        expect(result.current.lastHitTestTime.current).toBe(0);
        expect(result.current.isScrollingRef.current).toBe(false);
        expect(result.current.lastScrollPos.current).toBeNull();
        expect(result.current.selectionRectRef.current).toBeNull();
        expect(result.current.selectionStartRef.current).toBeNull();
        expect(result.current.shapeBoundsCache.current).toEqual(new Map());
        expect(result.current.dragHistorySaved.current).toBe(false);
        expect(result.current.lastRotationMouseAngle.current).toBe(0);
    });
});

describe('useInteractionSession.resetSession', () => {
    it('hides and zeroes a real selection rect and clears the transient session state', () => {
        const { result } = renderHook(() => useInteractionSession());
        const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectEl.setAttribute('width', '40');
        rectEl.setAttribute('height', '30');
        rectEl.style.display = 'block';
        document.body.appendChild(rectEl);
        act(() => {
            // useRef<SVGRectElement>(null) yields a readonly RefObject; the cast is test-only.
            (result.current.selectionRectRef as MutableRefObject<SVGRectElement | null>).current = rectEl;
            result.current.selectionStartRef.current = { x: 9, y: 9 };
            result.current.setSnapIndicator({ x: 5, y: 6, type: 'endpoint' });
            result.current.setCursorPos({ x: 1, y: 2 });
            result.current.setActiveShapeId('s1');
            result.current.setHoveredShapeId('s2');
            result.current.setCompassState({ center: { x: 1, y: 1 }, radiusPoint: { x: 2, y: 2 }, startAngle: 30, accumulatedRotation: 45, lastMouseAngle: 75 });
            result.current.setCompassPreviewPath('M 0 0 L 10 10');
        });
        act(() => { result.current.resetSession(); });
        expect(rectEl.style.display).toBe('none');
        expect(rectEl.getAttribute('width')).toBe('0');
        expect(rectEl.getAttribute('height')).toBe('0');
        expect(result.current.selectionStartRef.current).toBeNull();
        expect(result.current.snapIndicator).toBeNull();
        expect(result.current.cursorPos).toBeNull();
        expect(result.current.activeShapeId).toBeNull();
        expect(result.current.hoveredShapeId).toBeNull();
        expect(result.current.compassState).toEqual(emptyCompass);
        expect(result.current.compassPreviewPath).toBeNull();
        rectEl.remove();
    });

    it('still clears state when no selection rect is attached', () => {
        const { result } = renderHook(() => useInteractionSession());
        act(() => {
            result.current.setSnapIndicator({ x: 5, y: 6 });
            result.current.setCursorPos({ x: 1, y: 2 });
            result.current.setActiveShapeId('s1');
            result.current.setHoveredShapeId('s2');
            result.current.setCompassPreviewPath('M 0 0');
            result.current.selectionStartRef.current = { x: 3, y: 4 };
        });
        act(() => { result.current.resetSession(); });
        expect(result.current.selectionRectRef.current).toBeNull();
        expect(result.current.snapIndicator).toBeNull();
        expect(result.current.cursorPos).toBeNull();
        expect(result.current.activeShapeId).toBeNull();
        expect(result.current.hoveredShapeId).toBeNull();
        expect(result.current.compassPreviewPath).toBeNull();
        expect(result.current.selectionStartRef.current).toBeNull();
    });

    it('CHARACTERIZATION: does not touch gesture state that handleToolChange never reset', () => {
        const { result } = renderHook(() => useInteractionSession());
        act(() => {
            result.current.setIsDragging(true);
            result.current.setIsRotating(true);
            result.current.setDragStartPos({ x: 3, y: 4 });
            result.current.setDragHandleIndex(2);
            result.current.setActiveLineConstraints([{ type: 'points_link', parentId: 'p1' }, undefined]);
            result.current.setPivotIndex(1);
            result.current.setRotationCenter({ x: 7, y: 8 });
            result.current.setIsAltPressed(true);
            result.current.setIsShiftPressed(true);
            result.current.cursorPosRef.current = { x: 11, y: 12 };
            result.current.lastHitTestTime.current = 1234;
            result.current.isScrollingRef.current = true;
            result.current.lastScrollPos.current = { x: 5, y: 6 };
            result.current.shapeBoundsCache.current.set('s1', { minX: 0, minY: 0, maxX: 1, maxY: 1 });
            result.current.dragHistorySaved.current = true;
            result.current.lastRotationMouseAngle.current = 90;
        });
        act(() => { result.current.resetSession(); });
        expect(result.current.isDragging).toBe(true);
        expect(result.current.isRotating).toBe(true);
        expect(result.current.dragStartPos).toEqual({ x: 3, y: 4 });
        expect(result.current.dragHandleIndex).toBe(2);
        expect(result.current.activeLineConstraints).toEqual([{ type: 'points_link', parentId: 'p1' }, undefined]);
        expect(result.current.pivotIndex).toBe(1);
        expect(result.current.rotationCenter).toEqual({ x: 7, y: 8 });
        expect(result.current.isAltPressed).toBe(true);
        expect(result.current.isShiftPressed).toBe(true);
        expect(result.current.cursorPosRef.current).toEqual({ x: 11, y: 12 });
        expect(result.current.lastHitTestTime.current).toBe(1234);
        expect(result.current.isScrollingRef.current).toBe(true);
        expect(result.current.lastScrollPos.current).toEqual({ x: 5, y: 6 });
        expect(result.current.shapeBoundsCache.current.get('s1')).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
        expect(result.current.dragHistorySaved.current).toBe(true);
        expect(result.current.lastRotationMouseAngle.current).toBe(90);
    });
});