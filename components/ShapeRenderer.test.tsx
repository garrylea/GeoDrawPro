// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ShapeRenderer } from './ShapeRenderer';
import { ShapeType } from '../types';
import { makeShape, renderInSvg } from '../test/componentHelpers';

describe('ShapeRenderer basics', () => {
    it('renders nothing for an empty point list', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('s', ShapeType.RECTANGLE, [])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('wraps shapes in a group tagged with the shape id', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('abc', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 10, y: 10 }])} isSelected={false} />
        );
        expect(container.querySelector('g[data-shape-id="abc"]')).toBeTruthy();
    });

    it('applies a rotation transform around the shape center', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('r', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 50 }], { rotation: 45 })} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')!.getAttribute('transform')).toBe('rotate(45 50 25)');
    });

    it('renders nothing for an unknown shape type', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('u', 'banana' as ShapeType, [{ x: 0, y: 0 }])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });
});

describe('ShapeRenderer strokes and selection', () => {
    const line = makeShape('l', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);

    it('draws a line between its two points', () => {
        const { container } = renderInSvg(<ShapeRenderer shape={line} isSelected={false} />);
        const el = container.querySelector('line')!;
        expect([el.getAttribute('x1'), el.getAttribute('y1'), el.getAttribute('x2'), el.getAttribute('y2')]).toEqual(['0', '0', '100', '50']);
        expect(el.getAttribute('stroke')).toBe('#000000');
    });

    it('uses dash patterns scaled by stroke width', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={{ ...line, strokeType: 'dashed' }} isSelected={false} />
        );
        expect(container.querySelector('line')!.getAttribute('stroke-dasharray')).toBe('8,4');
    });

    it('uses a dotted pattern', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={{ ...line, strokeType: 'dotted' }} isSelected={false} />
        );
        expect(container.querySelector('line')!.getAttribute('stroke-dasharray')).toBe('2,4');
    });

    it('highlights selection in blue and drops the dash pattern', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={{ ...line, strokeType: 'dashed' }} isSelected={true} />
        );
        const lines = container.querySelectorAll('line');
        const el = lines[lines.length - 1];
        expect(el.getAttribute('stroke')).toBe('#3b82f6');
        expect(el.getAttribute('stroke-dasharray')).toBe('none');
    });

    it('adds a translucent halo behind the selected shape', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 50, y: 50 }])} isSelected={true} />
        );
        const halo = container.querySelector('g[style*="opacity: 0.3"] rect')!;
        expect(halo.getAttribute('stroke')).toBe('#60a5fa');
        expect(halo.getAttribute('stroke-width')).toBe('8');
        expect(halo.getAttribute('fill')).toBe('none');
    });

    it('does not add a halo for selected images', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('i', ShapeType.IMAGE, [{ x: 0, y: 0 }, { x: 50, y: 50 }], { imageUrl: 'data:image/png;base64,x' })} isSelected={true} />
        );
        expect(container.querySelector('g[style*="opacity: 0.3"]')).toBeNull();
    });
});

describe('ShapeRenderer geometry', () => {
    it('normalizes rectangle corners given in reverse order', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('r', ShapeType.RECTANGLE, [{ x: 110, y: 80 }, { x: 10, y: 20 }])} isSelected={false} />
        );
        const rect = container.querySelector('rect')!;
        expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['10', '20', '100', '60']);
    });

    it('renders a square as a rect', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('s', ShapeType.SQUARE, [{ x: 0, y: 0 }, { x: 40, y: 40 }])} isSelected={false} />
        );
        expect(container.querySelector('rect')!.getAttribute('width')).toBe('40');
    });

    it('uses the smaller dimension for circle radius', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('c', ShapeType.CIRCLE, [{ x: 0, y: 0 }, { x: 100, y: 60 }])} isSelected={false} />
        );
        const circle = container.querySelector('circle')!;
        expect(circle.getAttribute('r')).toBe('30');
        expect(circle.getAttribute('cx')).toBe('50');
        expect(circle.getAttribute('cy')).toBe('30');
    });

    it('renders an ellipse with independent radii', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('e', ShapeType.ELLIPSE, [{ x: 0, y: 0 }, { x: 100, y: 60 }])} isSelected={false} />
        );
        const ellipse = container.querySelector('ellipse')!;
        expect(ellipse.getAttribute('rx')).toBe('50');
        expect(ellipse.getAttribute('ry')).toBe('30');
    });

    it('renders a polygon from all points', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }])} isSelected={false} />
        );
        expect(container.querySelector('polygon')!.getAttribute('points')).toBe('0,0 100,0 50,80');
    });

    it('refuses to draw a triangle with fewer than three points', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('refuses to draw a polygon with fewer than three points', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.POLYGON, [{ x: 0, y: 0 }])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('sizes point radius from stroke width with a floor of 4', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.POINT, [{ x: 50, y: 60 }])} isSelected={false} />
        );
        expect(container.querySelector('circle')!.getAttribute('r')).toBe('4');
    });

    it('grows point radius with stroke width', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.POINT, [{ x: 50, y: 60 }], { strokeWidth: 3 })} isSelected={false} />
        );
        expect(container.querySelector('circle')!.getAttribute('r')).toBe('6');
    });

    it('rings a selected point in blue', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.POINT, [{ x: 50, y: 60 }])} isSelected={true} />
        );
        const circles = container.querySelectorAll('circle');
        const circle = circles[circles.length - 1];
        expect(circle.getAttribute('stroke')).toBe('#3b82f6');
        expect(circle.getAttribute('stroke-width')).toBe('2');
    });
});

describe('ShapeRenderer midpoints', () => {
    it('marks the center of a circle', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('c', ShapeType.CIRCLE, [{ x: 0, y: 0 }, { x: 100, y: 60 }])} isSelected={false} />
        );
        const dot = container.querySelector('.midpoints-layer circle')!;
        expect(dot.getAttribute('cx')).toBe('50');
        expect(dot.getAttribute('cy')).toBe('30');
    });

    it('marks all four edge midpoints of a rectangle', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('r', ShapeType.RECTANGLE, [{ x: 10, y: 20 }, { x: 110, y: 80 }])} isSelected={false} />
        );
        const dots = Array.from(container.querySelectorAll('.midpoints-layer circle'));
        expect(dots.map(d => [d.getAttribute('cx'), d.getAttribute('cy')])).toEqual([
            ['60', '20'], ['110', '50'], ['60', '80'], ['10', '50']
        ]);
    });

    it('marks the single midpoint of a line segment', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('l', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 50 }])} isSelected={false} />
        );
        const dots = container.querySelectorAll('.midpoints-layer circle');
        expect(dots).toHaveLength(1);
        expect(dots[0].getAttribute('cx')).toBe('50');
        expect(dots[0].getAttribute('cy')).toBe('25');
    });

    it('marks edge midpoints of a triangle', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }])} isSelected={false} />
        );
        expect(container.querySelectorAll('.midpoints-layer circle')).toHaveLength(3);
    });

    it('skips midpoints for freehand paths', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, [{ x: 0, y: 0 }, { x: 10, y: 10 }])} isSelected={false} />
        );
        expect(container.querySelector('.midpoints-layer')).toBeNull();
    });
});

describe('ShapeRenderer labels', () => {
    it('labels triangle vertices', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }], { labels: ['A', 'B', 'C'] })} isSelected={false} />
        );
        ['A', 'B', 'C'].forEach(l => expect(screen.getByText(l)).toBeTruthy());
    });

    it('labels line endpoints', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('l', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { labels: ['A', 'B'] })} isSelected={false} />
        );
        expect(screen.getByText('A')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('labels rectangle corners only when four labels are given', () => {
        const shape = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 60 }], { labels: ['A', 'B', 'C', 'D'] });
        renderInSvg(<ShapeRenderer shape={shape} isSelected={false} />);
        expect(screen.getByText('D')).toBeTruthy();
        const partial = { ...shape, labels: ['A', 'B'] };
        const { container: c2 } = renderInSvg(<ShapeRenderer shape={partial} isSelected={false} />);
        expect(c2.querySelector('text')).toBeNull();
    });

    it('labels a point', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.POINT, [{ x: 50, y: 60 }], { labels: ['P'] })} isSelected={false} />
        );
        expect(screen.getByText('P')).toBeTruthy();
    });

    it('counter-rotates labels so they stay upright', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('l', ShapeType.LINE, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { labels: ['A', 'B'], rotation: 30 })} isSelected={false} />
        );
        const label = screen.getByText('A');
        expect(label.getAttribute('transform')).toMatch(/^rotate\(-30,/);
    });
});

describe('ShapeRenderer freehand and paths', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];

    it('refuses a single-point freehand stroke', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, [{ x: 0, y: 0 }])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('draws a smooth stroked path without pressure data', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, pts)} isSelected={false} />
        );
        const path = container.querySelector('path')!;
        expect(path.getAttribute('fill')).toBe('none');
        expect(path.getAttribute('stroke')).toBe('#000000');
        expect(path.getAttribute('d')).toContain('M');
    });

    it('draws a filled variable-width path when pressure is enabled', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, pts, { usePressure: true })} isSelected={false} />
        );
        const path = container.querySelector('path')!;
        expect(path.getAttribute('fill')).toBe('#000000');
        expect(path.getAttribute('stroke')).toBe('none');
    });

    it('auto-enables pressure when any point carries non-default pressure', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, [{ x: 0, y: 0, p: 0.9 }, { x: 10, y: 10 }])} isSelected={false} />
        );
        expect(container.querySelector('path')!.getAttribute('stroke')).toBe('none');
    });

    it('ignores pressure data when usePressure is explicitly false', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, [{ x: 0, y: 0, p: 0.9 }, { x: 10, y: 10 }], { usePressure: false })} isSelected={false} />
        );
        expect(container.querySelector('path')!.getAttribute('fill')).toBe('none');
    });

    it('treats default 0.5 pressure as no pressure data', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FREEHAND, [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 10, p: 0.5 }])} isSelected={false} />
        );
        expect(container.querySelector('path')!.getAttribute('fill')).toBe('none');
    });

    it('renders a stored path only when pathData exists', () => {
        const shape = makeShape('p', ShapeType.PATH, pts);
        const { container } = renderInSvg(<ShapeRenderer shape={shape} isSelected={false} />);
        expect(container.querySelector('.shape-group')).toBeNull();
        const { container: c2 } = renderInSvg(
            <ShapeRenderer shape={{ ...shape, pathData: 'M 0 0 L 20 0' }} isSelected={false} />
        );
        expect(c2.querySelector('path')!.getAttribute('d')).toBe('M 0 0 L 20 0');
    });
});

describe('ShapeRenderer text', () => {
    it('renders plain text with the default font size', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 10, y: 20 }], { text: 'Hello' })} isSelected={false} />
        );
        const el = screen.getByText('Hello');
        expect(el.tagName.toLowerCase()).toBe('text');
        expect(el.getAttribute('font-size')).toBe('16');
        expect(el.getAttribute('x')).toBe('10');
    });

    it('honors a custom font size', () => {
        renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 0, y: 0 }], { text: 'Big', fontSize: 32 })} isSelected={false} />
        );
        expect(screen.getByText('Big').getAttribute('font-size')).toBe('32');
    });

    it('renders dollar-wrapped latex through KaTeX', async () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 0, y: 0 }], { text: '$x^2$' })} isSelected={false} />
        );
        await waitFor(() => expect(container.querySelector('.katex-html')).toBeTruthy());
        expect(container.querySelector('foreignObject')).toBeTruthy();
        expect(container.querySelector('.katex-render-container')).toBeTruthy();
        expect(container.querySelector('.katex-html')!.innerHTML).toContain('katex');
        expect(container.querySelector('text')).toBeNull();
    });

    it('renders backslash commands as latex without dollar markers', async () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 0, y: 0 }], { text: '\\frac{1}{2}' })} isSelected={false} />
        );
        await waitFor(() => expect(container.querySelector('foreignObject')).toBeTruthy());
    });

    it('falls back to plain text for invalid latex', async () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 0, y: 0 }], { text: '$\\frac{$' })} isSelected={false} />
        );
        // throwOnError:false means KaTeX still renders an error span, not a crash
        await waitFor(() => expect(container.querySelector('foreignObject')).toBeTruthy());
    });

    it('renders selected latex without crashing and keeps the KaTeX markup', async () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('t', ShapeType.TEXT, [{ x: 0, y: 0 }], { text: '$x^2$' })} isSelected={true} />
        );
        await waitFor(() => expect(container.querySelector('.katex-html')).toBeTruthy());
        expect(container.querySelectorAll('foreignObject')).toHaveLength(1);
    });
});

describe('ShapeRenderer special shapes', () => {
    it('renders nothing for a marker without path data', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('m', ShapeType.MARKER, [{ x: 0, y: 0 }])} isSelected={false} />
        );
        expect(container.querySelector('svg')!.childElementCount).toBe(0);
    });

    it('renders a marker path in red, blue when selected', () => {
        const shape = makeShape('m', ShapeType.MARKER, [{ x: 0, y: 0 }], { pathData: 'M 0 0 A 5 5 0 0 1 10 0' });
        const { container } = renderInSvg(<ShapeRenderer shape={shape} isSelected={false} />);
        const path = container.querySelector('path')!;
        expect(path.getAttribute('stroke')).toBe('#ef4444');
        expect(path.getAttribute('data-shape-id')).toBe('m');
        const { container: c2 } = renderInSvg(<ShapeRenderer shape={shape} isSelected={true} />);
        expect(c2.querySelector('path')!.getAttribute('stroke')).toBe('#3b82f6');
    });

    it('renders nothing for a function graph without path data', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('f', ShapeType.FUNCTION_GRAPH, [], { formulaParams: { a: 1, b: 0, c: 0 } })} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('renders a wide invisible hit path plus the visible curve', () => {
        const shape = makeShape('f', ShapeType.FUNCTION_GRAPH, [], { pathData: 'M 0 0 L 10 10', formulaParams: { a: 1, b: 0, c: 0 } });
        const { container } = renderInSvg(<ShapeRenderer shape={shape} isSelected={false} />);
        const paths = container.querySelectorAll('path');
        expect(paths).toHaveLength(2);
        expect(paths[0].getAttribute('stroke')).toBe('transparent');
        expect(paths[0].getAttribute('stroke-width')).toBe('15');
    });

    it('adds a glow path when the function graph is selected', () => {
        const shape = makeShape('f', ShapeType.FUNCTION_GRAPH, [], { pathData: 'M 0 0 L 10 10', formulaParams: { a: 1, b: 0, c: 0 } });
        const { container } = renderInSvg(<ShapeRenderer shape={shape} isSelected={true} />);
        const paths = container.querySelectorAll('path');
        expect(paths).toHaveLength(3);
        expect(paths[1].getAttribute('stroke')).toBe('#60a5fa');
    });

    it('renders nothing for an image without a url', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('i', ShapeType.IMAGE, [{ x: 0, y: 0 }, { x: 10, y: 10 }])} isSelected={false} />
        );
        expect(container.querySelector('.shape-group')).toBeNull();
    });

    it('renders an image stretched to its bounds', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('i', ShapeType.IMAGE, [{ x: 5, y: 5 }, { x: 105, y: 55 }], { imageUrl: 'data:image/png;base64,x' })} isSelected={false} />
        );
        const img = container.querySelector('image')!;
        expect(img.getAttribute('href')).toBe('data:image/png;base64,x');
        expect(img.getAttribute('width')).toBe('100');
        expect(img.getAttribute('preserveAspectRatio')).toBe('none');
    });

    it('draws 181 protractor ticks and labels every 15 degrees', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('p', ShapeType.PROTRACTOR, [{ x: 0, y: 0 }, { x: 300, y: 150 }])} isSelected={false} />
        );
        // 181 ticks + baseline + center marker line
        expect(container.querySelectorAll('line')).toHaveLength(183);
        expect(screen.getByText('90')).toBeTruthy();
        expect(screen.getByText('15')).toBeTruthy();
        expect(screen.getByText('165')).toBeTruthy();
        expect(screen.queryByText('180')).toBeNull();
        expect(screen.queryByText('0')).toBeNull();
    });

    it('spaces ruler ticks by pixelsPerUnit/10 and labels whole units', () => {
        const { container } = renderInSvg(
            <ShapeRenderer shape={makeShape('r', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 400, y: 40 }])} isSelected={false} pixelsPerUnit={40} />
        );
        // 400 / 4 = 100 intervals -> 101 ticks
        expect(container.querySelectorAll('line')).toHaveLength(101);
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('10')).toBeTruthy();
        expect(screen.queryByText('11')).toBeNull();
    });

    it('tints the ruler body when selected', () => {
        const shape = makeShape('r', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 400, y: 40 }]);
        const { container } = renderInSvg(<ShapeRenderer shape={shape} isSelected={true} />);
        const body = container.querySelector('rect')!;
        expect(body.getAttribute('fill')).toBe('#dbeafe');
        expect(body.getAttribute('stroke')).toBe('#3b82f6');
    });
});

describe('ShapeRenderer memoization', () => {
    it('ignores pixelsPerUnit changes while the shape reference is unchanged', () => {
        const shape = makeShape('r', ShapeType.RULER, [{ x: 0, y: 0 }, { x: 400, y: 40 }]);
        const { rerender } = renderInSvg(
            <ShapeRenderer shape={shape} isSelected={false} pixelsPerUnit={40} />
        );
        expect(screen.getByText('10')).toBeTruthy();
        rerender(
            <svg><ShapeRenderer shape={shape} isSelected={false} pixelsPerUnit={80} /></svg>
        );
        // memo comparator only checks shape identity, so the old spacing persists
        expect(screen.getByText('10')).toBeTruthy();
        rerender(
            <svg><ShapeRenderer shape={{ ...shape }} isSelected={false} pixelsPerUnit={80} /></svg>
        );
        expect(screen.queryByText('10')).toBeNull();
        expect(screen.getByText('5')).toBeTruthy();
    });
});