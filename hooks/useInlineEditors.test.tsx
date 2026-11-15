// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInlineEditors } from './useInlineEditors';
import { makeShape } from '../test/componentHelpers';
import { Shape, ShapeType } from '../types';
import { applyAngleEdit } from '../utils/angleEditing';

type Deps = Parameters<typeof useInlineEditors>[0];

const makeParams = (overrides: Partial<Deps> = {}): Deps => ({
    shapes: [],
    setShapes: vi.fn(),
    setSelectedIds: vi.fn(),
    saveHistory: vi.fn(),
    ...overrides,
});

const setup = (overrides: Partial<Deps> = {}) => {
    const params = makeParams(overrides);
    const hook = renderHook(() => useInlineEditors(params));
    return { hook, params };
};

// Applies the first setShapes argument (updater or direct value) to prev.
const appliedShapes = (setShapes: Deps['setShapes'], prev: Shape[]): Shape[] => {
    const arg = vi.mocked(setShapes).mock.calls[0][0];
    return typeof arg === 'function' ? arg(prev) : arg;
};

const rect = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
const bareText = makeShape('t1', ShapeType.TEXT, [{ x: 10, y: 20 }]);
const triangle = makeShape('tri', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]);

describe('useInlineEditors initial values', () => {
    it('starts with no active editor and detached input refs', () => {
        const { hook } = setup();
        expect(hook.result.current.textEditing).toBeNull();
        expect(hook.result.current.angleEditing).toBeNull();
        expect(hook.result.current.inputRef.current).toBeNull();
        expect(hook.result.current.angleInputRef.current).toBeNull();
    });
});

describe('useInlineEditors.finishTextEditing', () => {
    it('removes the shape and clears selection when the text is whitespace-only', () => {
        const { hook, params } = setup({ shapes: [bareText, rect] });
        act(() => { hook.result.current.setTextEditing({ id: 't1', x: 10, y: 20, text: '   ' }); });
        act(() => { hook.result.current.finishTextEditing(); });
        expect(appliedShapes(params.setShapes, [bareText, rect])).toEqual([rect]);
        expect(hook.result.current.textEditing).toBeNull();
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set());
    });

    it('writes real text onto the shape and clears selection', () => {
        const { hook, params } = setup({ shapes: [bareText, rect] });
        act(() => { hook.result.current.setTextEditing({ id: 't1', x: 10, y: 20, text: 'hello' }); });
        act(() => { hook.result.current.finishTextEditing(); });
        const next = appliedShapes(params.setShapes, [bareText, rect]);
        expect(next[0]).toEqual({ ...bareText, text: 'hello' });
        expect(next[1]).toBe(rect);
        expect(hook.result.current.textEditing).toBeNull();
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set());
    });

    it('is a no-op when no text editor is active', () => {
        const { hook, params } = setup({ shapes: [bareText] });
        act(() => { hook.result.current.finishTextEditing(); });
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.setSelectedIds).not.toHaveBeenCalled();
    });
});

describe('useInlineEditors.cancelTextEditing', () => {
    it('removes a shape that has no committed text and clears the editor', () => {
        const { hook, params } = setup({ shapes: [bareText, rect] });
        act(() => { hook.result.current.setTextEditing({ id: 't1', x: 10, y: 20, text: 'draft' }); });
        act(() => { hook.result.current.cancelTextEditing(); });
        expect(appliedShapes(params.setShapes, [bareText, rect])).toEqual([rect]);
        expect(hook.result.current.textEditing).toBeNull();
        // Cancelling must not touch the selection (unlike finishing).
        expect(params.setSelectedIds).not.toHaveBeenCalled();
    });

    it('keeps a shape that already has text and clears the editor', () => {
        const committed = makeShape('t1', ShapeType.TEXT, [{ x: 10, y: 20 }], { text: 'kept' });
        const { hook, params } = setup({ shapes: [committed, rect] });
        act(() => { hook.result.current.setTextEditing({ id: 't1', x: 10, y: 20, text: 'draft' }); });
        act(() => { hook.result.current.cancelTextEditing(); });
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(hook.result.current.textEditing).toBeNull();
    });

    it('is a no-op when no text editor is active', () => {
        const { hook, params } = setup({ shapes: [bareText] });
        act(() => { hook.result.current.cancelTextEditing(); });
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(hook.result.current.textEditing).toBeNull();
    });
});

describe('useInlineEditors.commitAngleEdit', () => {
    it('saves history and maps the target triangle through applyAngleEdit for a valid value', () => {
        const { hook, params } = setup({ shapes: [triangle, rect] });
        act(() => { hook.result.current.setAngleEditing({ id: 'tri', index: 0, x: 0, y: 0, value: '60' }); });
        act(() => { hook.result.current.commitAngleEdit(); });
        expect(params.saveHistory).toHaveBeenCalledTimes(1);
        const next = appliedShapes(params.setShapes, [triangle, rect]);
        // Real geometry: the moved vertex must actually change coordinates.
        expect(next[0].points[2]).not.toEqual(triangle.points[2]);
        expect(next[0]).toEqual(applyAngleEdit(triangle, 0, 60));
        expect(next[1]).toBe(rect);
        expect(hook.result.current.angleEditing).toBeNull();
    });

    it.each(['abc', '0', '180', '-5'])('ignores invalid value %s and keeps the editor open', (value) => {
        const { hook, params } = setup({ shapes: [triangle] });
        act(() => { hook.result.current.setAngleEditing({ id: 'tri', index: 0, x: 0, y: 0, value }); });
        act(() => { hook.result.current.commitAngleEdit(); });
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(hook.result.current.angleEditing).toEqual({ id: 'tri', index: 0, x: 0, y: 0, value });
    });

    it('is a no-op when no angle editor is active', () => {
        const { hook, params } = setup({ shapes: [triangle] });
        act(() => { hook.result.current.commitAngleEdit(); });
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(params.setShapes).not.toHaveBeenCalled();
    });
});