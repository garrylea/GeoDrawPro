// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocument } from './useDocument';
import { makeShape } from '../test/componentHelpers';
import { ShapeType } from '../types';

const setup = () => {
    const setPivotIndex = vi.fn();
    const setActiveShapeId = vi.fn();
    const hook = renderHook(() => useDocument({ setPivotIndex, setActiveShapeId }));
    return { hook, setPivotIndex, setActiveShapeId };
};

const rect = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
const point = makeShape('p1', ShapeType.POINT, [{ x: 10, y: 10 }]);
const ruler = makeShape('ruler1', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 200, y: 0 }]);

describe('useDocument.saveHistory', () => {
    it('appends a snapshot of the current shapes and marks the document dirty', () => {
        const { hook } = setup();
        act(() => { hook.result.current.setShapes([rect]); });
        act(() => { hook.result.current.saveHistory(); });
        expect(hook.result.current.isDirty).toBe(true);
        // The snapshot must capture shapes at save time, not later mutations.
        act(() => { hook.result.current.setShapes([rect, point]); });
        act(() => { hook.result.current.undo(); });
        expect(hook.result.current.shapes).toEqual([rect]);
    });
});

describe('useDocument.undo', () => {
    it('restores the previous state, clears selection, resets the active shape and marks dirty', () => {
        const { hook, setActiveShapeId } = setup();
        act(() => { hook.result.current.setShapes([rect]); });
        act(() => { hook.result.current.saveHistory(); });
        act(() => { hook.result.current.setShapes([rect, point]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['r1'])); });
        act(() => { hook.result.current.setIsDirty(false); });
        setActiveShapeId.mockClear();
        act(() => { hook.result.current.undo(); });
        expect(hook.result.current.shapes).toEqual([rect]);
        expect(hook.result.current.selectedIds.size).toBe(0);
        expect(setActiveShapeId).toHaveBeenCalledWith(null);
        expect(hook.result.current.isDirty).toBe(true);
    });

    it('is a no-op when history is empty', () => {
        const { hook, setActiveShapeId } = setup();
        act(() => { hook.result.current.setShapes([rect]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['r1'])); });
        setActiveShapeId.mockClear();
        act(() => { hook.result.current.undo(); });
        expect(hook.result.current.shapes).toEqual([rect]);
        expect(hook.result.current.selectedIds).toEqual(new Set(['r1']));
        expect(setActiveShapeId).not.toHaveBeenCalled();
        expect(hook.result.current.isDirty).toBe(false);
    });
});

describe('useDocument.deleteSelected', () => {
    it('cascades to shapes constrained to the deleted parent and clears selection', () => {
        const { hook } = setup();
        const linked = makeShape('l1', ShapeType.LINE, [{ x: 10, y: 10 }, { x: 50, y: 50 }], {
            constraint: { type: 'points_link', parentId: 'p1' }
        });
        act(() => { hook.result.current.setShapes([point, linked, rect]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['p1'])); });
        act(() => { hook.result.current.deleteSelected(); });
        expect(hook.result.current.shapes).toEqual([rect]);
        expect(hook.result.current.selectedIds.size).toBe(0);
        expect(hook.result.current.isDirty).toBe(true);
        // saveHistory ran before deletion, so undo restores everything.
        act(() => { hook.result.current.undo(); });
        expect(hook.result.current.shapes).toEqual([point, linked, rect]);
    });

    it('is a no-op with an empty selection', () => {
        const { hook } = setup();
        act(() => { hook.result.current.setShapes([rect]); });
        act(() => { hook.result.current.deleteSelected(); });
        expect(hook.result.current.shapes).toEqual([rect]);
        expect(hook.result.current.isDirty).toBe(false);
    });
});

describe('useDocument.clearAll', () => {
    it('empties shapes and history so a later undo is a no-op', () => {
        const { hook } = setup();
        act(() => { hook.result.current.setShapes([rect]); });
        act(() => { hook.result.current.saveHistory(); });
        act(() => { hook.result.current.clearAll(); });
        expect(hook.result.current.shapes).toEqual([]);
        act(() => { hook.result.current.undo(); });
        expect(hook.result.current.shapes).toEqual([]);
    });
});

describe('useDocument.setSelectedIds pivot side effects', () => {
    it('sets pivot to 0 when a single RULER is selected', () => {
        const { hook, setPivotIndex } = setup();
        act(() => { hook.result.current.setShapes([ruler, rect]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['ruler1'])); });
        expect(setPivotIndex).toHaveBeenCalledWith(0);
    });

    it('applies the same side effects through functional updaters', () => {
        const { hook, setPivotIndex } = setup();
        act(() => { hook.result.current.setShapes([ruler]); });
        act(() => { hook.result.current.setSelectedIds(prev => new Set([...prev, 'ruler1'])); });
        expect(hook.result.current.selectedIds).toEqual(new Set(['ruler1']));
        expect(setPivotIndex).toHaveBeenCalledWith(0);
    });

    it('sets pivot to center for a single non-ruler shape', () => {
        const { hook, setPivotIndex } = setup();
        act(() => { hook.result.current.setShapes([rect, ruler]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['r1'])); });
        expect(setPivotIndex).toHaveBeenCalledWith('center');
        expect(setPivotIndex).not.toHaveBeenCalledWith(0);
    });

    it('sets pivot to center for multi-selection and empty selection', () => {
        const { hook, setPivotIndex } = setup();
        act(() => { hook.result.current.setShapes([ruler, rect]); });
        act(() => { hook.result.current.setSelectedIds(new Set(['ruler1', 'r1'])); });
        expect(setPivotIndex).toHaveBeenLastCalledWith('center');
        act(() => { hook.result.current.setSelectedIds(new Set()); });
        expect(setPivotIndex).toHaveBeenLastCalledWith('center');
    });
});

describe('useDocument ref synchronization', () => {
    it('keeps shapesRef and isDirtyRef in sync with state after rerender', () => {
        const { hook } = setup();
        expect(hook.result.current.shapesRef.current).toEqual([]);
        expect(hook.result.current.isDirtyRef.current).toBe(false);
        act(() => {
            hook.result.current.setShapes([rect]);
            hook.result.current.setIsDirty(true);
        });
        hook.rerender();
        expect(hook.result.current.shapesRef.current).toEqual([rect]);
        expect(hook.result.current.isDirtyRef.current).toBe(true);
    });
});

describe('useDocument callback stability', () => {
    it('keeps action references stable across rerenders without state changes', () => {
        const { hook } = setup();
        const first = hook.result.current;
        hook.rerender();
        expect(hook.result.current.undo).toBe(first.undo);
        expect(hook.result.current.deleteSelected).toBe(first.deleteSelected);
        expect(hook.result.current.clearAll).toBe(first.clearAll);
        expect(hook.result.current.setSelectedIds).toBe(first.setSelectedIds);
    });
});
describe('useDocument.clipboard invalidation', () => {
    it('drops the internal shape clipboard when the window loses focus', () => {
        const { hook } = setup();
        act(() => { hook.result.current.setClipboard([rect]); });
        expect(hook.result.current.clipboard).toEqual([rect]);
        // Leaving the app to copy something else must not let the old shapes win the next paste.
        act(() => { window.dispatchEvent(new Event('blur')); });
        expect(hook.result.current.clipboard).toEqual([]);
    });

    it('keeps the clipboard while the window stays focused', () => {
        const { hook } = setup();
        act(() => { hook.result.current.setClipboard([rect, point]); });
        act(() => { window.dispatchEvent(new Event('focus')); });
        expect(hook.result.current.clipboard).toEqual([rect, point]);
    });
});
