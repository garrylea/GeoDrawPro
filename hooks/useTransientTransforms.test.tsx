// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderInSvg, makeShape } from '../test/componentHelpers';
import { useTransientTransforms } from './useTransientTransforms';
import { getShapeCenter } from '../utils/shapeGeometry';
import { Shape, ShapeType, ToolType } from '../types';

const setup = (shapes: Shape[], selectedIds: Set<string>, tool: ToolType = ToolType.SELECT) => {
    const { container } = renderInSvg(
        <>
            {shapes.map(s => {
                // ShapeRenderer always renders a transform attribute on the shape group
                // (persistent rotation, or '' when unrotated); mirror that so the engine
                // operates on the same DOM contract as in the real app.
                const center = getShapeCenter(s.points, s.type);
                const rotationTransform = s.rotation ? `rotate(${s.rotation} ${center.x} ${center.y})` : '';
                return (
                    <g key={s.id} data-shape-id={s.id} transform={rotationTransform}>
                        {s.type === ShapeType.LINE && (
                            <line x1={s.points[0].x} y1={s.points[0].y} x2={s.points[1].x} y2={s.points[1].y} />
                        )}
                    </g>
                );
            })}
            <g id="selection-overlay-group" />
        </>
    );
    const svgRef = { current: container.querySelector('svg') as SVGSVGElement };
    const shapesRef = { current: shapes };
    const hook = renderHook(() => useTransientTransforms({ shapesRef, selectedIds, svgRef, tool }));
    const g = (id: string) => container.querySelector(`g[data-shape-id="${id}"]`) as Element;
    const line = (id: string) => g(id).querySelector('line') as Element;
    const overlay = () => document.getElementById('selection-overlay-group') as Element;
    return { hook, container, shapesRef, g, line, overlay };
};

const point = makeShape('p1', ShapeType.POINT, [{ x: 100, y: 100 }]);
const linkedLine = makeShape('l1', ShapeType.LINE, [{ x: 100, y: 100 }, { x: 200, y: 200 }], {
    constraint: { type: 'points_link', parents: ['p1', null] }
});
const rect = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);

describe('useTransientTransforms.refreshDomCache', () => {
    it('caches selected shapes, their dependents, and the overlay', () => {
        const { hook } = setup([point, linkedLine, rect], new Set(['p1']));
        hook.result.current.refreshDomCache();
        const cache = hook.result.current.domCacheRef.current;
        expect(cache.has('p1')).toBe(true);
        expect(cache.has('l1')).toBe(true);
        expect(cache.has('selection-overlay-group')).toBe(true);
        expect(cache.has('r1')).toBe(false);
        expect(hook.result.current.initialShapeStateRef.current.has('l1')).toBe(true);
    });

    it('honors an explicit id override', () => {
        const { hook } = setup([point, linkedLine, rect], new Set(['p1']));
        hook.result.current.refreshDomCache(new Set(['r1']));
        const cache = hook.result.current.domCacheRef.current;
        expect(cache.has('r1')).toBe(true);
        expect(cache.has('p1')).toBe(false);
    });

    it('stays empty for drawing tools', () => {
        const { hook } = setup([point, rect], new Set(['p1']), ToolType.LINE);
        hook.result.current.refreshDomCache();
        expect(hook.result.current.domCacheRef.current.size).toBe(0);
    });
});

describe('useTransientTransforms.updateTransientVisuals', () => {
    it('translates the dragged shape and elastically stretches its linked line', () => {
        const { hook, g, line } = setup([point, linkedLine], new Set(['p1']));
        hook.result.current.refreshDomCache();
        hook.result.current.updateTransientVisuals({ dx: 30, dy: -20 });
        expect(g('p1').getAttribute('transform')).toBe('translate(30 -20)');
        expect(line('l1').getAttribute('x1')).toBe('130');
        expect(line('l1').getAttribute('y1')).toBe('80');
        expect(line('l1').getAttribute('x2')).toBe('200');
        expect(line('l1').getAttribute('y2')).toBe('200');
        expect(g('l1').getAttribute('transform')).toBe('');
    });

    it('applies the same translation to a directly selected line (rigid, not elastic)', () => {
        const { hook, g, line } = setup([point, linkedLine], new Set(['p1', 'l1']));
        hook.result.current.refreshDomCache();
        hook.result.current.updateTransientVisuals({ dx: 30, dy: -20 });
        expect(g('l1').getAttribute('transform')).toBe('translate(30 -20)');
        expect(line('l1').getAttribute('x1')).toBe('100');
    });

    it('includes the persistent rotation of the single selected shape in the overlay', () => {
        const rotated = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 30 });
        const { hook, overlay } = setup([rotated], new Set(['r1']));
        hook.result.current.refreshDomCache();
        hook.result.current.updateTransientVisuals({ dx: 10, dy: 5 });
        expect(overlay().getAttribute('transform')).toBe('translate(10 5) rotate(30 50 25)');
    });

    it('treats the overlay as a plain rigid body for multi-selection', () => {
        const { hook, overlay } = setup([point, rect], new Set(['p1', 'r1']));
        hook.result.current.refreshDomCache();
        hook.result.current.updateTransientVisuals({ dx: 10, dy: 5 });
        expect(overlay().getAttribute('transform')).toBe('translate(10 5)');
    });

    it('resets transforms to persistent rotation and line endpoints on null', () => {
        const rotated = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 30 });
        const { hook, g, line } = setup([point, linkedLine, rotated], new Set(['p1', 'r1']));
        hook.result.current.refreshDomCache();
        hook.result.current.updateTransientVisuals({ dx: 30, dy: -20 });
        hook.result.current.updateTransientVisuals(null);
        expect(g('r1').getAttribute('transform')).toBe('rotate(30 50 25)');
        expect(g('p1').getAttribute('transform')).toBe('');
        expect(line('l1').getAttribute('x1')).toBe('100');
        expect(line('l1').getAttribute('y1')).toBe('100');
    });

    it('re-queries cached elements that were disconnected by a re-render', () => {
        const { hook, container, g } = setup([rect], new Set(['r1']));
        hook.result.current.refreshDomCache();
        const stale = g('r1');
        stale.remove();
        const fresh = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        fresh.setAttribute('data-shape-id', 'r1');
        container.querySelector('svg')!.appendChild(fresh);
        hook.result.current.updateTransientVisuals({ dx: 5 });
        expect(fresh.getAttribute('transform')).toBe('translate(5 0)');
        expect(hook.result.current.domCacheRef.current.get('r1')).toBe(fresh);
    });
});