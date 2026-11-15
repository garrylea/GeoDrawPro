// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SetStateAction } from 'react';
import { renderHook, act } from '@testing-library/react';
import { usePointerHandlers } from './usePointerHandlers';
import { Shape, ShapeType, ToolType, Point, Constraint, TransientState } from '../types';
import { makeShape, stubPointerCapture } from '../test/componentHelpers';

type Deps = Parameters<typeof usePointerHandlers>[0];

const apply = <T,>(v: SetStateAction<T>, prev: T): T =>
    typeof v === 'function' ? (v as (p: T) => T)(prev) : v;

/**
 * Unit seams for the pointer handlers extracted from Editor (S7).
 * State is simulated with real values + vi.fn() setters that commit into a
 * plain state object; rerendering the hook with rebuilt deps between gesture
 * phases mirrors React's render/effect cycle (shapesRef syncs on rerender).
 */
const createHarness = (initial: Partial<Deps> = {}) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Repo-wide jsdom assumption: clientX/Y == SVG coords (rect at origin).
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900, x: 0, y: 0, toJSON: () => ({}) });
    const selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    svg.appendChild(selectionRect);
    const container = document.createElement('div');
    document.body.append(svg, container);

    const state = {
        shapes: [] as Shape[],
        selectedIds: new Set<string>(),
        isDragging: false,
        isRotating: false,
        dragStartPos: null as Point | null,
        dragHandleIndex: null as number | null,
        activeShapeId: null as string | null,
        activeLineConstraints: [] as (Constraint | undefined)[],
        hoveredShapeId: null as string | null,
        rotationCenter: null as Point | null,
        isShiftPressed: false,
        isAltPressed: false,
        compassState: { center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 } as Deps['compassState'],
        compassPreviewPath: null as string | null,
        textEditing: null as Deps['textEditing'],
        angleEditing: null as Deps['angleEditing'],
        tool: ToolType.SELECT as ToolType,
        zoom: 1,
        lockBackground: true,
        pickingMirrorMode: false,
        markingAnglesMode: false,
        autoLabelMode: false,
        smartSketchMode: false,
        pressureEnabled: false,
    };
    for (const k of Object.keys(state)) {
        if (k in initial) (state as any)[k] = (initial as any)[k];
    }
    const extraOverrides = Object.fromEntries(Object.entries(initial).filter(([k]) => !(k in state)));

    const refs = {
        svgRef: { current: svg },
        containerRef: { current: container },
        selectionRectRef: { current: selectionRect },
        cursorPosRef: { current: null as Point | null },
        lastHitTestTime: { current: 0 },
        isScrollingRef: { current: false },
        lastScrollPos: { current: null as { x: number; y: number } | null },
        selectionStartRef: { current: null as Point | null },
        shapeBoundsCache: { current: new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>() },
        lastRotationMouseAngle: { current: 0 },
        transientStateRef: { current: null as TransientState | null },
        domCacheRef: { current: new Map<string, Element>() },
        initialShapeStateRef: { current: new Map<string, Shape>() },
        shapesRef: { current: state.shapes },
    };

    const spies = {
        saveHistory: vi.fn(),
        updateTransientVisuals: vi.fn(),
        refreshDomCache: vi.fn(),
        finishTextEditing: vi.fn(),
        handleFold: vi.fn(),
        setSnapIndicator: vi.fn(),
        setCursorPos: vi.fn(),
        setTool: vi.fn(),
        setTextEditing: vi.fn(),
        setCompassState: vi.fn(),
        setCompassPreviewPath: vi.fn(),
        setHoveredShapeId: vi.fn(),
    };

    const setters = {
        setShapes: vi.fn((v: SetStateAction<Shape[]>) => { state.shapes = apply(v, state.shapes); }),
        setSelectedIds: vi.fn((v: SetStateAction<Set<string>>) => { state.selectedIds = apply(v, state.selectedIds); }),
        setIsDragging: vi.fn((v: SetStateAction<boolean>) => { state.isDragging = apply(v, state.isDragging); }),
        setIsRotating: vi.fn((v: SetStateAction<boolean>) => { state.isRotating = apply(v, state.isRotating); }),
        setDragStartPos: vi.fn((v: SetStateAction<Point | null>) => { state.dragStartPos = apply(v, state.dragStartPos); }),
        setDragHandleIndex: vi.fn((v: SetStateAction<number | null>) => { state.dragHandleIndex = apply(v, state.dragHandleIndex); }),
        setActiveShapeId: vi.fn((v: SetStateAction<string | null>) => { state.activeShapeId = apply(v, state.activeShapeId); }),
        setActiveLineConstraints: vi.fn((v: SetStateAction<(Constraint | undefined)[]>) => { state.activeLineConstraints = apply(v, state.activeLineConstraints); }),
    };

    let idCounter = 0;
    const build = (): Deps => {
        refs.shapesRef.current = state.shapes; // shapesRef syncs after commit (useEffect)
        return {
            ...state,
            canvasSize: { width: 1600, height: 900 },
            svgHeight: 900,
            pixelsPerUnit: 50,
            originY: 450,
            currentStyle: { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' as const },
            axisConfig: { visible: false, ticks: 5, color: '#94a3b8', showGrid: false },
            generateId: () => `gen-${++idCounter}`,
            ...setters,
            ...spies,
            ...refs,
            ...extraOverrides,
        };
    };

    const evt = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
        button: 0, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse',
        shiftKey: false, ctrlKey: false,
        currentTarget: svg, target: svg,
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
        ...extra,
    }) as any;

    return { state, refs, spies, setters, build, evt, svg, selectionRect, container };
};

const renderHarness = (h: ReturnType<typeof createHarness>) =>
    renderHook((d: Deps) => usePointerHandlers(d), { initialProps: h.build() });

beforeEach(() => { stubPointerCapture(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('usePointerHandlers.getMousePos', () => {
    it('divides client coordinates by zoom and defaults mouse pressure to 0.5', () => {
        const h = createHarness({ zoom: 2 });
        const hook = renderHarness(h);
        const pos = hook.result.current.getMousePos(h.evt(200, 100), false);
        expect(pos).toEqual({ x: 100, y: 50, p: 0.5 });
    });

    it('keeps explicit pen pressure', () => {
        const h = createHarness();
        const hook = renderHarness(h);
        const pos = hook.result.current.getMousePos(h.evt(10, 20, { pointerType: 'pen', pressure: 0.8 }), false);
        expect(pos.p).toBe(0.8);
    });

    it('FREEHAND clears the snap indicator and returns the raw point', () => {
        const h = createHarness({ tool: ToolType.FREEHAND, shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        const pos = hook.result.current.getMousePos(h.evt(101, 101), true);
        expect(pos).toEqual({ x: 101, y: 101, p: 0.5 });
        expect(h.spies.setSnapIndicator).toHaveBeenCalledWith(null);
    });

    it('disables snapping while shift is pressed', () => {
        const h = createHarness({ isShiftPressed: true, shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        const pos = hook.result.current.getMousePos(h.evt(102, 101), true);
        expect(pos).toEqual({ x: 102, y: 101, p: 0.5 });
        expect(h.spies.setSnapIndicator).toHaveBeenLastCalledWith(null);
    });

    it('snaps to a nearby point and sets the indicator with its type', () => {
        const h = createHarness({ shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        const pos = hook.result.current.getMousePos(h.evt(103, 102), true);
        expect(pos).toEqual({ x: 100, y: 100, p: 0.5 });
        expect(h.spies.setSnapIndicator).toHaveBeenLastCalledWith({ x: 100, y: 100, type: 'endpoint' });
    });
});

describe('usePointerHandlers.bindPointToShapes (via handlePointerDown)', () => {
    it('forces points_link when creating a LINE near a POINT even if another snap wins', () => {
        // Corner of r1 at (105,100) is closer than p1, so getSnapPoint returns on_edge;
        // the isCreatingLine fallback must still force points_link (p1 within 10px).
        const h = createHarness({
            tool: ToolType.LINE,
            shapes: [
                makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]),
                makeShape('r1', ShapeType.RECTANGLE, [{ x: 105, y: 100 }, { x: 205, y: 180 }]),
            ],
        });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(104, 100)); });
        expect(h.state.activeLineConstraints[0]).toEqual({ type: 'points_link', parentId: 'p1' });
        expect(h.state.shapes[2].points[0]).toEqual({ x: 105, y: 100 }); // snapped position kept
    });

    it('rejects points_link when creating a POINT on another POINT', () => {
        const h = createHarness({ tool: ToolType.POINT, shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(100, 100)); });
        expect(h.state.shapes).toHaveLength(2);
        expect(h.state.shapes[1].points[0]).toEqual({ x: 100, y: 100 });
        expect(h.state.shapes[1].constraint).toBeUndefined();
    });

    it('returns the original position when nothing snaps', () => {
        const h = createHarness({ tool: ToolType.POINT, shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(500, 500)); });
        expect(h.state.shapes[1].points[0]).toEqual({ x: 500, y: 500 });
        expect(h.state.shapes[1].constraint).toBeUndefined();
    });
});

describe('usePointerHandlers.getHittableShapes (via SELECT handlePointerDown)', () => {
    const bg = () => makeShape('img', ShapeType.IMAGE, [{ x: 0, y: 0 }, { x: 400, y: 300 }], { isBackground: true });

    it('excludes a locked background IMAGE farther than 15px from its edge', () => {
        const h = createHarness({ shapes: [bg()], lockBackground: true });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(200, 150)); });
        // No hit -> box selection starts instead of selecting the image
        expect(h.refs.selectionStartRef.current).toEqual({ x: 200, y: 150 });
        expect(h.state.selectedIds.has('img')).toBe(false);
        expect(h.selectionRect.style.display).toBe('block');
    });

    it('includes a locked background IMAGE within 15px of its edge', () => {
        const h = createHarness({ shapes: [bg()], lockBackground: true });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(5, 150)); });
        expect(h.state.selectedIds.has('img')).toBe(true);
        expect(h.refs.selectionStartRef.current).toBeNull();
    });

    it('includes an unlocked background IMAGE anywhere', () => {
        const h = createHarness({ shapes: [bg()], lockBackground: false });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(200, 150)); });
        expect(h.state.selectedIds.has('img')).toBe(true);
    });

    it('always includes non-image shapes', () => {
        const h = createHarness({ shapes: [makeShape('r1', ShapeType.RECTANGLE, [{ x: 100, y: 100 }, { x: 200, y: 160 }])] });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(150, 130)); });
        expect(h.state.selectedIds.has('r1')).toBe(true);
    });
});

describe('usePointerHandlers LINE two-click gesture', () => {
    it('first down creates the line, sets activeShapeId and captures [startC, undefined]', () => {
        const h = createHarness({ tool: ToolType.LINE, shapes: [makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }])] });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(100, 100)); });
        expect(h.spies.saveHistory).toHaveBeenCalled();
        expect(h.state.shapes).toHaveLength(2);
        const line = h.state.shapes[1];
        expect(line.type).toBe(ShapeType.LINE);
        expect(line.points).toEqual([{ x: 100, y: 100 }, { x: 100, y: 100 }]);
        expect(h.state.activeShapeId).toBe(line.id);
        expect(h.state.activeLineConstraints).toEqual([{ type: 'points_link', parentId: 'p1' }, undefined]);
        expect(h.state.dragStartPos).toEqual({ x: 100, y: 100 });
    });

    it('second down completes the line with points_link when both ends snap to points', () => {
        const h = createHarness({
            tool: ToolType.LINE,
            shapes: [
                makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]),
                makeShape('p2', ShapeType.POINT, [{ x: 200, y: 200 }]),
            ],
        });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(100, 100)); });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerUp(h.evt(100, 100)); });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerDown(h.evt(200, 200)); });
        const line = h.state.shapes[2];
        expect(line.points).toEqual([{ x: 100, y: 100 }, { x: 200, y: 200 }]);
        expect(line.constraint).toEqual({ type: 'points_link', parents: ['p1', 'p2'] });
        expect(h.state.activeShapeId).toBeNull();
        expect(h.state.activeLineConstraints).toEqual([]);
    });
});

describe('usePointerHandlers SELECT box gesture', () => {
    const twoRects = () => [
        makeShape('r1', ShapeType.RECTANGLE, [{ x: 100, y: 100 }, { x: 200, y: 160 }]),
        makeShape('r2', ShapeType.RECTANGLE, [{ x: 240, y: 190 }, { x: 300, y: 240 }]),
    ];

    it('down on empty canvas starts the selection rect and caches bounds with ±2 padding', () => {
        const h = createHarness({ shapes: twoRects() });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(50, 50)); });
        expect(h.selectionRect.style.display).toBe('block');
        expect(h.selectionRect.getAttribute('x')).toBe('50');
        expect(h.selectionRect.getAttribute('y')).toBe('50');
        expect(h.selectionRect.getAttribute('width')).toBe('0');
        expect(h.selectionRect.getAttribute('height')).toBe('0');
        expect(h.refs.selectionStartRef.current).toEqual({ x: 50, y: 50 });
        expect(h.refs.shapeBoundsCache.current.get('r1')).toEqual({ minX: 98, minY: 98, maxX: 202, maxY: 162 });
        expect(h.refs.shapeBoundsCache.current.get('r2')).toEqual({ minX: 238, minY: 188, maxX: 302, maxY: 242 });
        expect(h.state.isDragging).toBe(true);
    });

    it('up commits containment-only selection (fully inside selected, partial not)', () => {
        const h = createHarness({ shapes: twoRects() });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(50, 50)); });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerMove(h.evt(250, 200)); });
        expect(h.selectionRect.getAttribute('width')).toBe('200');
        expect(h.selectionRect.getAttribute('height')).toBe('150');
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerUp(h.evt(250, 200)); });
        expect(h.setters.setSelectedIds).toHaveBeenLastCalledWith(new Set(['r1']));
        expect(h.state.selectedIds).toEqual(new Set(['r1']));
        expect(h.selectionRect.style.display).toBe('none');
        expect(h.refs.selectionStartRef.current).toBeNull();
        expect(h.refs.shapeBoundsCache.current.size).toBe(0);
        expect(h.state.isDragging).toBe(false);
    });
});

describe('usePointerHandlers drag commit', () => {
    it('down on selected shape -> move stages transient {dx,dy} -> up commits translation', () => {
        const h = createHarness({
            shapes: [makeShape('r1', ShapeType.RECTANGLE, [{ x: 100, y: 100 }, { x: 200, y: 160 }])],
            selectedIds: new Set(['r1']),
        });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(150, 130)); });
        expect(h.spies.refreshDomCache).toHaveBeenCalled();
        expect(h.state.isDragging).toBe(true);
        expect(h.state.dragStartPos).toEqual({ x: 150, y: 130 });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerMove(h.evt(180, 150)); });
        expect(h.refs.transientStateRef.current).toEqual({ dx: 30, dy: 20 });
        expect(h.spies.updateTransientVisuals).toHaveBeenCalledWith({ dx: 30, dy: 20 });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerUp(h.evt(180, 150)); });
        expect(h.spies.saveHistory).toHaveBeenCalled();
        expect(h.state.shapes[0].points).toEqual([{ x: 130, y: 120 }, { x: 230, y: 180 }]);
        expect(h.spies.updateTransientVisuals).toHaveBeenLastCalledWith(null);
        expect(h.refs.transientStateRef.current).toBeNull();
        expect(h.refs.domCacheRef.current.size).toBe(0);
    });
});

describe('usePointerHandlers click-default', () => {
    it('applies clickDefaultPoints when a RECTANGLE is clicked without dragging', () => {
        const h = createHarness({ tool: ToolType.RECTANGLE });
        const hook = renderHarness(h);
        act(() => { hook.result.current.handlePointerDown(h.evt(300, 300)); });
        hook.rerender(h.build());
        act(() => { hook.result.current.handlePointerUp(h.evt(300, 300)); });
        // pixelsPerUnit = 50 -> default 100x50 rectangle centered on the click
        expect(h.state.shapes[0].points).toEqual([{ x: 250, y: 275 }, { x: 350, y: 325 }]);
        expect(h.state.selectedIds).toEqual(new Set([h.state.shapes[0].id]));
        expect(h.state.activeShapeId).toBeNull();
    });
});