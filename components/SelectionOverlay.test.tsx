// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SelectionOverlay } from './SelectionOverlay';
import { ShapeType } from '../types';
import { makeShape, renderInSvg } from '../test/componentHelpers';

type Props = React.ComponentProps<typeof SelectionOverlay>;

const setup = (shape: Props['shape'], overrides: Partial<Props> = {}) => {
    const props: Props = {
        shape,
        isSelected: true,
        pivotIndex: 'center',
        isAltPressed: false,
        isMarkingAngles: false,
        isDragging: false,
        onResizeStart: vi.fn(),
        onRotateStart: vi.fn(),
        onSetPivot: vi.fn(),
        onMarkAngle: vi.fn(),
        onAngleChange: vi.fn(),
        onAngleDoubleClick: vi.fn(),
        ...overrides,
    };
    const utils = renderInSvg(<SelectionOverlay {...props} />);
    return { props, ...utils };
};

const handles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('rect[width="10"]'));

const rect = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 60 }]);
const triangle = makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);

describe('SelectionOverlay structure', () => {
    it('renders nothing for function graphs', () => {
        const { container } = setup(makeShape('f', ShapeType.FUNCTION_GRAPH, [], { pathData: 'M 0 0' }));
        expect(container.querySelector('#selection-overlay-group')).toBeNull();
    });

    it('draws a dashed bounding box with four corner handles for a rectangle', () => {
        const { container } = setup(rect);
        const box = container.querySelector('rect[stroke-dasharray="4,4"]')!;
        expect([box.getAttribute('x'), box.getAttribute('y'), box.getAttribute('width'), box.getAttribute('height')]).toEqual(['0', '0', '100', '60']);
        const hs = handles(container);
        expect(hs).toHaveLength(4);
        expect(hs.map(h => [h.getAttribute('x'), h.getAttribute('y')])).toEqual([
            ['-5', '-5'], ['95', '-5'], ['95', '55'], ['-5', '55']
        ]);
    });

    it('places the rotation handle above the top edge center', () => {
        const { container } = setup(rect);
        const rot = container.querySelector('circle[cursor="grab"], circle[style*="grab"]')!;
        expect(rot.getAttribute('cx')).toBe('50');
        expect(rot.getAttribute('cy')).toBe('-30');
    });

    it('shows a blue center pivot by default', () => {
        const { container } = setup(rect);
        const pivot = container.querySelector('circle[fill="#3b82f6"]')!;
        expect(pivot.getAttribute('cx')).toBe('50');
        expect(pivot.getAttribute('cy')).toBe('30');
    });

    it('moves the pivot to a corner when pivotIndex is numeric', () => {
        const { container } = setup(rect, { pivotIndex: 1 });
        const pivot = container.querySelector('circle[fill="#ef4444"]')!;
        expect(pivot.getAttribute('cx')).toBe('100');
        expect(pivot.getAttribute('cy')).toBe('0');
    });

    it('uses vertex handles instead of a bounding box for triangles', () => {
        const { container } = setup(triangle);
        expect(container.querySelector('rect[stroke-dasharray="4,4"]')).toBeNull();
        const hs = handles(container);
        expect(hs).toHaveLength(3);
        expect(hs[1].getAttribute('x')).toBe('95');
        expect(hs[1].getAttribute('y')).toBe('-5');
    });

    it('limits triangle vertex handles to three even with extra points', () => {
        const { container } = setup(makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 50 }]));
        expect(handles(container)).toHaveLength(3);
    });

    it('renders one handle per line endpoint', () => {
        const { container } = setup(makeShape('l', ShapeType.LINE, [{ x: 10, y: 20 }, { x: 30, y: 40 }]));
        expect(handles(container)).toHaveLength(2);
    });

    it('falls back to a bounding box for polygons with more than 20 points', () => {
        const pts = Array.from({ length: 25 }, (_, i) => ({ x: i * 4, y: (i % 2) * 10 }));
        const { container } = setup(makeShape('p', ShapeType.POLYGON, pts));
        expect(container.querySelector('rect[stroke-dasharray="4,4"]')).toBeTruthy();
        expect(handles(container)).toHaveLength(4);
    });

    it('estimates text bounds from font size and content length', () => {
        const { container } = setup(makeShape('txt', ShapeType.TEXT, [{ x: 10, y: 20 }], { text: 'Hello', fontSize: 16 }));
        const box = container.querySelector('rect[stroke-dasharray="4,4"]')!;
        // w = 5 * 16 * 0.8 = 64, h = 16 * 1.2 = 19.2, minY = 20 - 1.6
        expect(box.getAttribute('width')).toBe('64');
        expect(box.getAttribute('height')).toBe('19.2');
        expect(box.getAttribute('y')).toBe('18.4');
    });

    it('applies the shape rotation to the whole overlay', () => {
        const { container } = setup({ ...rect, rotation: 30 });
        expect(container.querySelector('#selection-overlay-group')!.getAttribute('transform')).toBe('rotate(30 50 30)');
    });

    it('darkens and fades the overlay while dragging', () => {
        const { container } = setup(rect, { isDragging: true });
        const group = container.querySelector('#selection-overlay-group') as SVGElement;
        expect(group.style.opacity).toBe('0.5');
        expect(container.querySelector('rect[stroke-dasharray="4,4"]')!.getAttribute('stroke')).toBe('#475569');
    });
});

describe('SelectionOverlay interactions', () => {
    it('reports the corner index when a resize handle is pressed', () => {
        const { props, container } = setup(rect);
        fireEvent.pointerDown(handles(container)[2]);
        expect(props.onResizeStart).toHaveBeenCalledWith(2, expect.anything());
    });

    it('reports the vertex index for polygon handles', () => {
        const { props, container } = setup(triangle);
        fireEvent.pointerDown(handles(container)[1]);
        expect(props.onResizeStart).toHaveBeenCalledWith(1, expect.anything());
    });

    it('starts rotation from the rotation handle', () => {
        const { props, container } = setup(rect);
        const rot = container.querySelector('circle[style*="grab"]')!;
        fireEvent.pointerDown(rot);
        expect(props.onRotateStart).toHaveBeenCalledTimes(1);
    });
});

describe('SelectionOverlay angle UI', () => {
    it('shows computed angles for a right triangle', () => {
        setup(triangle);
        expect(screen.getByText('90°')).toBeTruthy();
        expect(screen.getAllByText('45°')).toHaveLength(2);
    });

    it('shows four right angles for a rectangle', () => {
        setup(rect);
        expect(screen.getAllByText('90°')).toHaveLength(4);
    });

    it('hides angle targets until marking mode is on', () => {
        const { container } = setup(triangle);
        expect(container.querySelectorAll('circle[r="15"]')).toHaveLength(0);
        const { container: c2 } = setup(triangle, { isMarkingAngles: true });
        expect(c2.querySelectorAll('circle[r="15"]')).toHaveLength(3);
    });

    it('marks an angle when a target is pressed', () => {
        const { props, container } = setup(triangle, { isMarkingAngles: true });
        fireEvent.pointerDown(container.querySelectorAll('circle[r="15"]')[1]);
        expect(props.onMarkAngle).toHaveBeenCalledWith(1);
    });

    it('opens angle editing on double click', () => {
        const { props } = setup(triangle);
        fireEvent.doubleClick(screen.getByText('90°'));
        expect(props.onAngleDoubleClick).toHaveBeenCalledWith(0, expect.anything());
    });
});

describe('SelectionOverlay pivot picking', () => {
    it('offers corner and center pivots while Alt is held', () => {
        const { container } = setup(rect, { isAltPressed: true });
        expect(container.querySelectorAll('g[style*="crosshair"]')).toHaveLength(5);
    });

    it('sets the chosen pivot index', () => {
        const { props, container } = setup(rect, { isAltPressed: true });
        fireEvent.pointerDown(container.querySelectorAll('g[style*="crosshair"]')[3]);
        expect(props.onSetPivot).toHaveBeenCalledWith(3);
        fireEvent.pointerDown(container.querySelectorAll('g[style*="crosshair"]')[4]);
        expect(props.onSetPivot).toHaveBeenCalledWith('center');
    });

    it('offers vertex pivots plus center for triangles', () => {
        const { props, container } = setup(triangle, { isAltPressed: true });
        const targets = container.querySelectorAll('g[style*="crosshair"]');
        expect(targets).toHaveLength(4);
        fireEvent.pointerDown(targets[2]);
        expect(props.onSetPivot).toHaveBeenCalledWith(2);
    });

    it('offers start/center/end pivots for rulers', () => {
        const ruler = makeShape('ru', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 400, y: 40 }]);
        const { props, container } = setup(ruler, { isAltPressed: true });
        const targets = container.querySelectorAll('g[style*="crosshair"]');
        expect(targets).toHaveLength(3);
        fireEvent.pointerDown(targets[0]);
        expect(props.onSetPivot).toHaveBeenCalledWith(0);
        fireEvent.pointerDown(targets[1]);
        expect(props.onSetPivot).toHaveBeenCalledWith('center');
        fireEvent.pointerDown(targets[2]);
        expect(props.onSetPivot).toHaveBeenCalledWith(1);
    });

    it('anchors the ruler pivot indicator to an end', () => {
        const ruler = makeShape('ru', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 400, y: 40 }]);
        const { container } = setup(ruler, { pivotIndex: 1 });
        const pivot = container.querySelector('circle[fill="#ef4444"]')!;
        expect(pivot.getAttribute('cx')).toBe('400');
        expect(pivot.getAttribute('cy')).toBe('0');
    });
});