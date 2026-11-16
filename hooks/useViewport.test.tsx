// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { useViewport } from './useViewport';
import { makeShape } from '../test/componentHelpers';
import { Shape, ShapeType } from '../types';
import { getPixelsPerUnit } from '../utils/coordinates';
import { generateQuadraticPath } from '../utils/quadraticFunction';

const setup = (ticks = 5) => {
    const setShapes = vi.fn();
    const hook = renderHook(({ ticks: t }) => useViewport({ setShapes, ticks: t }), { initialProps: { ticks } });
    return { hook, setShapes };
};

describe('useViewport derived values', () => {
    it('derives originY, svgHeight and pixelsPerUnit from page/canvas state', () => {
        const { hook } = setup();
        const v = hook.result.current;
        expect(v.canvasSize.width).toBe(1600);
        expect(v.originY).toBe(v.pageHeight / 2);
        expect(v.svgHeight).toBe(Math.max(v.canvasSize.height, v.pageCount * v.pageHeight));
        expect(v.pixelsPerUnit).toBe(getPixelsPerUnit(v.canvasSize.width, v.canvasSize.height, 5));
        act(() => { hook.result.current.setPageCount(3); });
        act(() => { hook.result.current.setPageHeight(1000); });
        const w = hook.result.current;
        expect(w.originY).toBe(500);
        expect(w.svgHeight).toBe(3000);
        hook.rerender({ ticks: 10 });
        expect(hook.result.current.pixelsPerUnit).toBe(getPixelsPerUnit(1600, hook.result.current.canvasSize.height, 10));
    });
});

describe('useViewport.handleZoomChange', () => {
    it('ignores zoom deltas smaller than 0.001', () => {
        const { hook } = setup();
        act(() => { hook.result.current.handleZoomChange(1.0005); });
        expect(hook.result.current.zoom).toBe(1);
    });

    it('updates zoom and re-centers scroll around the recorded zoom focus point', () => {
        const { hook } = setup();
        const container = { scrollLeft: 100, scrollTop: 200, clientWidth: 800, clientHeight: 600 };
        (hook.result.current.containerRef as MutableRefObject<HTMLDivElement | null>).current =
            container as unknown as HTMLDivElement;
        act(() => { hook.result.current.handleZoomChange(2); });
        expect(hook.result.current.zoom).toBe(2);
        // focus = ((100 + 800/2) / 1, (200 + 600/2) / 1) = (500, 500)
        // zoom layout effect: scroll = focus * newZoom - clientSize / 2
        expect(container.scrollLeft).toBe(600);
        expect(container.scrollTop).toBe(700);
    });

    it('updates zoom without a container attached', () => {
        const { hook } = setup();
        act(() => { hook.result.current.handleZoomChange(1.5); });
        expect(hook.result.current.zoom).toBe(1.5);
    });
});

describe('useViewport resize listener', () => {
    it('updates canvasSize.height on window resize', () => {
        const originalHeight = window.innerHeight;
        const { hook } = setup();
        try {
            act(() => {
                window.innerHeight = 500;
                window.dispatchEvent(new Event('resize'));
            });
            expect(hook.result.current.canvasSize.height).toBe(500);
        } finally {
            window.innerHeight = originalHeight;
        }
    });
});

describe('useViewport FUNCTION_GRAPH regeneration', () => {
    it('regenerates pathData through setShapes when ticks change', () => {
        const graph = makeShape('f1', ShapeType.FUNCTION_GRAPH, [], {
            formulaParams: { a: 1, b: 0, c: 0 },
            functionType: 'quadratic',
            functionForm: 'standard',
            pathData: 'stale-path'
        });
        const other = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
        const { hook, setShapes } = setup(5);
        expect(setShapes).toHaveBeenCalledTimes(1); // mount regeneration
        hook.rerender({ ticks: 10 });
        expect(setShapes).toHaveBeenCalledTimes(2);
        const updater = setShapes.mock.calls[1][0] as (prev: Shape[]) => Shape[];
        const v = hook.result.current;
        const next = updater([graph, other]);
        const expected = generateQuadraticPath(
            graph.formulaParams!, 'standard', v.canvasSize.width, v.svgHeight, v.pixelsPerUnit, 'quadratic', v.originY
        );
        expect(expected).not.toBe('');
        expect(next[0].pathData).toBe(expected);
        expect(next[0].pathData).not.toBe('stale-path');
        expect(next[1]).toBe(other);
    });
});

describe('useViewport callback stability', () => {
    it('keeps handleZoomChange stable across rerenders', () => {
        const { hook } = setup();
        const first = hook.result.current.handleZoomChange;
        hook.rerender({ ticks: 5 });
        expect(hook.result.current.handleZoomChange).toBe(first);
    });
});