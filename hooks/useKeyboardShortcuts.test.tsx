// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { makeShape } from '../test/componentHelpers';
import { Shape, ShapeType, ToolType } from '../types';

type Deps = Parameters<typeof useKeyboardShortcuts>[0];

const emptyCompass = { center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 };

const makeParams = (overrides: Partial<Deps> = {}): Deps => ({
    selectedIds: new Set<string>(),
    setSelectedIds: vi.fn(),
    shapes: [],
    setShapes: vi.fn(),
    saveHistory: vi.fn(),
    undo: vi.fn(),
    deleteSelected: vi.fn(),
    clipboard: [],
    setClipboard: vi.fn(),
    history: [],
    tool: ToolType.SELECT,
    setTool: vi.fn(),
    textEditing: null,
    angleEditing: null,
    finishTextEditing: vi.fn(),
    cancelTextEditing: vi.fn(),
    activeShapeId: null,
    setActiveShapeId: vi.fn(),
    setIsDragging: vi.fn(),
    pickingMirrorMode: false,
    setPickingMirrorMode: vi.fn(),
    markingAnglesMode: false,
    setMarkingAnglesMode: vi.fn(),
    compassState: emptyCompass,
    setCompassState: vi.fn(),
    setCompassPreviewPath: vi.fn(),
    setIsAltPressed: vi.fn(),
    setIsShiftPressed: vi.fn(),
    ...overrides,
});

const setup = (overrides: Partial<Deps> = {}) => {
    const params = makeParams(overrides);
    const hook = renderHook(() => useKeyboardShortcuts(params));
    return { hook, params };
};

const press = (key: string, opts: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, ...opts });
    act(() => { window.dispatchEvent(e); });
    return e;
};

const release = (key: string) => {
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key })); });
};

// Applies the first setShapes argument (updater or direct value) to prev.
const appliedShapes = (setShapes: Deps['setShapes'], prev: Shape[]): Shape[] => {
    const arg = vi.mocked(setShapes).mock.calls[0][0];
    return typeof arg === 'function' ? arg(prev) : arg;
};

const rect = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
const rect2 = makeShape('r2', ShapeType.RECTANGLE, [{ x: 10, y: 10 }, { x: 60, y: 40 }]);
const graph = makeShape('g1', ShapeType.FUNCTION_GRAPH, [{ x: 0, y: 0 }]);
const triangle = makeShape('tri', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]);

describe('useKeyboardShortcuts tool keys', () => {
    it.each([
        ['a', ToolType.SELECT], ['A', ToolType.SELECT],
        ['l', ToolType.LINE], ['L', ToolType.LINE],
        ['p', ToolType.POINT], ['f', ToolType.FREEHAND],
        ['e', ToolType.ERASER], ['r', ToolType.RULER],
    ])('pressing %s switches to %s', (key, expected) => {
        const { params } = setup();
        press(key);
        expect(params.setTool).toHaveBeenCalledWith(expected);
    });

    it('ignores tool keys while a text editor is open', () => {
        const { params } = setup({ textEditing: { id: 't1', x: 0, y: 0, text: 'hi' } });
        press('l');
        expect(params.setTool).not.toHaveBeenCalled();
    });

    it('ignores tool keys while an angle editor is open', () => {
        const { params } = setup({ angleEditing: { id: 'tri', index: 0, x: 0, y: 0, value: '60' } });
        press('l');
        expect(params.setTool).not.toHaveBeenCalled();
    });

    it('ignores keys dispatched from an INPUT element', () => {
        const { params } = setup();
        const input = document.createElement('input');
        document.body.appendChild(input);
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true })); });
        expect(params.setTool).not.toHaveBeenCalled();
        input.remove();
    });

    it('CHARACTERIZATION: still tracks Alt pressed from an INPUT before the guard runs', () => {
        const { params } = setup();
        const input = document.createElement('input');
        document.body.appendChild(input);
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true })); });
        expect(params.setIsAltPressed).toHaveBeenCalledWith(true);
        expect(params.setTool).not.toHaveBeenCalled();
        input.remove();
    });
});

describe('useKeyboardShortcuts modifier tracking', () => {
    it('sets Alt true on keydown and false on keyup', () => {
        const { params } = setup();
        press('Alt');
        expect(params.setIsAltPressed).toHaveBeenCalledWith(true);
        release('Alt');
        expect(params.setIsAltPressed).toHaveBeenCalledWith(false);
    });

    it('sets Shift true on keydown and false on keyup', () => {
        const { params } = setup();
        press('Shift');
        expect(params.setIsShiftPressed).toHaveBeenCalledWith(true);
        release('Shift');
        expect(params.setIsShiftPressed).toHaveBeenCalledWith(false);
    });
});

describe('useKeyboardShortcuts arrow-key nudging', () => {
    it.each([
        ['ArrowRight', 1, 0], ['ArrowLeft', -1, 0],
        ['ArrowDown', 0, 1], ['ArrowUp', 0, -1],
    ])('%s translates selected points by (%d, %d) and saves history', (key, dx, dy) => {
        const shapes = [rect, graph, rect2];
        const { params } = setup({ shapes, selectedIds: new Set(['r1']) });
        const e = press(key);
        expect(e.defaultPrevented).toBe(true);
        expect(params.saveHistory).toHaveBeenCalledTimes(1);
        const next = appliedShapes(params.setShapes, shapes);
        expect(next[0].points).toEqual(rect.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p })));
        // FUNCTION_GRAPH and unselected shapes pass through untouched.
        expect(next[1]).toBe(graph);
        expect(next[2]).toBe(rect2);
    });

    it('recalculates MARKERs attached to a moved shape (two-stage map)', () => {
        const marker = makeShape('m1', ShapeType.MARKER, [{ x: 0, y: 0 }], {
            pathData: 'stale',
            markerConfig: { type: 'angle_arc', targets: [{ shapeId: 'tri', pointIndices: [0, 1, 2] }] },
        });
        const shapes = [triangle, marker];
        const { params } = setup({ shapes, selectedIds: new Set(['tri']) });
        press('ArrowRight');
        const next = appliedShapes(params.setShapes, shapes);
        expect(next[0].points).toEqual(triangle.points.map(p => ({ x: p.x + 1, y: p.y, p: p.p })));
        // Marker anchor recomputed from the moved triangle: p2=(101,0), towards p1=(1,0), len 20.
        expect(next[1].points).toEqual([{ x: 81, y: 0 }]);
        expect(next[1].pathData).not.toBe('stale');
    });

    it('does nothing for arrow keys without a selection', () => {
        const { params } = setup({ shapes: [rect] });
        press('ArrowRight');
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(params.setShapes).not.toHaveBeenCalled();
    });
});

describe('useKeyboardShortcuts clipboard and history shortcuts', () => {
    it('Ctrl+C copies the selection as a deep copy', () => {
        const { params } = setup({ shapes: [rect, rect2], selectedIds: new Set(['r1']) });
        press('c', { ctrlKey: true });
        expect(params.setClipboard).toHaveBeenCalledTimes(1);
        const copy = vi.mocked(params.setClipboard).mock.calls[0][0] as Shape[];
        expect(copy).toEqual([rect]);
        expect(copy[0]).not.toBe(rect);
        copy[0].points[0].x = 999;
        expect(rect.points[0].x).toBe(0);
    });

    it('Meta+C also copies', () => {
        const { params } = setup({ shapes: [rect], selectedIds: new Set(['r1']) });
        press('c', { metaKey: true });
        expect(params.setClipboard).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+C with an empty selection does not copy', () => {
        const { params } = setup({ shapes: [rect] });
        press('c', { ctrlKey: true });
        expect(params.setClipboard).not.toHaveBeenCalled();
    });

    it('Ctrl+Z undoes and prevents default', () => {
        const { params } = setup();
        const e = press('z', { ctrlKey: true });
        expect(params.undo).toHaveBeenCalledTimes(1);
        expect(e.defaultPrevented).toBe(true);
    });

    it('CHARACTERIZATION: Ctrl+A is shadowed by the plain "a" tool key, so select-all never runs', () => {
        const { params } = setup({ shapes: [rect, rect2] });
        const e = press('a', { ctrlKey: true });
        // The tool-key branch matches first and returns; the Ctrl+A select-all
        // branch later in the handler is dead code (kept verbatim).
        expect(params.setTool).toHaveBeenCalledWith(ToolType.SELECT);
        expect(params.setSelectedIds).not.toHaveBeenCalled();
        expect(e.defaultPrevented).toBe(false);
    });
});

describe('useKeyboardShortcuts Escape cascade', () => {
    it('exits pickingMirrorMode first', () => {
        const { params } = setup({ pickingMirrorMode: true });
        press('Escape');
        expect(params.setPickingMirrorMode).toHaveBeenCalledWith(false);
        expect(params.setTool).not.toHaveBeenCalled();
        expect(params.setSelectedIds).not.toHaveBeenCalled();
    });

    it('exits markingAnglesMode when not picking a mirror', () => {
        const { params } = setup({ markingAnglesMode: true });
        press('Escape');
        expect(params.setMarkingAnglesMode).toHaveBeenCalledWith(false);
        expect(params.setTool).not.toHaveBeenCalled();
    });

    it('removes the active shape, stops dragging and returns to SELECT', () => {
        const shapes = [rect, rect2];
        const { params } = setup({ shapes, activeShapeId: 'r2' });
        press('Escape');
        expect(appliedShapes(params.setShapes, shapes)).toEqual([rect]);
        expect(params.setActiveShapeId).toHaveBeenCalledWith(null);
        expect(params.setIsDragging).toHaveBeenCalledWith(false);
        expect(params.setTool).toHaveBeenCalledWith(ToolType.SELECT);
    });

    it('resets the compass when its center is set', () => {
        const { params } = setup({
            tool: ToolType.COMPASS,
            compassState: { center: { x: 1, y: 2 }, radiusPoint: { x: 3, y: 4 }, startAngle: 10, accumulatedRotation: 20, lastMouseAngle: 30 },
        });
        press('Escape');
        expect(params.setCompassState).toHaveBeenCalledWith(emptyCompass);
        expect(params.setCompassPreviewPath).toHaveBeenCalledWith(null);
        expect(params.setTool).not.toHaveBeenCalled();
    });

    it('clears the selection when nothing higher-priority is active', () => {
        const { params } = setup({ selectedIds: new Set(['r1']) });
        press('Escape');
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set());
        expect(params.setTool).not.toHaveBeenCalled();
    });

    it('returns a non-SELECT tool to SELECT as the last rung', () => {
        const { params } = setup({ tool: ToolType.LINE });
        press('Escape');
        expect(params.setTool).toHaveBeenCalledWith(ToolType.SELECT);
    });

    it('does nothing on SELECT with no pending state', () => {
        const { params } = setup();
        press('Escape');
        expect(params.setTool).not.toHaveBeenCalled();
        expect(params.setSelectedIds).not.toHaveBeenCalled();
        expect(params.deleteSelected).not.toHaveBeenCalled();
    });

    it('honors rung priority: pickingMirrorMode beats an active shape', () => {
        const { params } = setup({ pickingMirrorMode: true, activeShapeId: 'r1', shapes: [rect] });
        press('Escape');
        expect(params.setPickingMirrorMode).toHaveBeenCalledWith(false);
        expect(params.setActiveShapeId).not.toHaveBeenCalled();
        expect(params.setShapes).not.toHaveBeenCalled();
    });

    it('CHARACTERIZATION: the Escape-cancelTextEditing branch is dead while an editor is open', () => {
        const { params } = setup({ textEditing: { id: 't1', x: 0, y: 0, text: 'hi' } });
        press('Escape');
        // The early return for open editors fires before the Escape cascade.
        expect(params.cancelTextEditing).not.toHaveBeenCalled();
        expect(params.finishTextEditing).not.toHaveBeenCalled();
    });
});

describe('useKeyboardShortcuts remaining keys', () => {
    it.each(['Delete', 'Backspace'])('%s deletes the selection', (key) => {
        const { params } = setup({ selectedIds: new Set(['r1']) });
        press(key);
        expect(params.deleteSelected).toHaveBeenCalledTimes(1);
    });

    it('Enter finishes text editing', () => {
        const { params } = setup();
        press('Enter');
        expect(params.finishTextEditing).toHaveBeenCalledTimes(1);
    });
});