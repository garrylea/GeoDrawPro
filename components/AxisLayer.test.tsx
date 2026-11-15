// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AxisLayer } from './AxisLayer';
import { AxisConfig } from '../types';
import { renderInSvg } from '../test/componentHelpers';

const baseConfig: AxisConfig = { visible: false, ticks: 5, color: '#94a3b8', showGrid: false };

const renderLayer = (config: Partial<AxisConfig> = {}, props: Partial<{ width: number; height: number; pixelsPerUnit: number; overrideOrigin: { x: number; y: number }; pageCount: number; pageHeight: number }> = {}) =>
    renderInSvg(
        <AxisLayer
            config={{ ...baseConfig, ...config }}
            width={props.width ?? 400}
            height={props.height ?? 400}
            pixelsPerUnit={props.pixelsPerUnit ?? 100}
            overrideOrigin={props.overrideOrigin}
            pageCount={props.pageCount}
            pageHeight={props.pageHeight}
        />
    );

describe('AxisLayer', () => {
    it('renders nothing when axes and grid are hidden', () => {
        const { container } = renderLayer();
        expect(container.querySelector('.axis-layer')!.childElementCount).toBe(0);
    });

    it('draws both axes with arrow markers and an origin label when visible', () => {
        const { container } = renderLayer({ visible: true });
        const axes = container.querySelectorAll('line[marker-end="url(#arrow)"]');
        expect(axes).toHaveLength(2);
        // horizontal axis at vertical center, vertical axis at horizontal center
        expect(axes[0].getAttribute('y1')).toBe('200');
        expect(axes[1].getAttribute('x1')).toBe('200');
        expect(container.querySelector('marker#arrow')).toBeTruthy();
        expect(screen.getByText('0')).toBeTruthy();
    });

    it('labels integer ticks in both directions', () => {
        renderLayer({ visible: true });
        // ppu=100, center=200, width=400 -> x ticks at 100/300 (±1) and 0/400 (±2)
        ['1', '2', '-1', '-2'].forEach(label => {
            expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
        });
        const twos = screen.getAllByText('2');
        expect(twos).toHaveLength(2); // one on x axis, one on y axis
    });

    it('uses the configured axis color', () => {
        const { container } = renderLayer({ visible: true, color: '#ff0000' });
        const axis = container.querySelector('line[marker-end="url(#arrow)"]')!;
        expect(axis.getAttribute('stroke')).toBe('#ff0000');
        expect(screen.getByText('0').getAttribute('fill')).toBe('#ff0000');
    });

    it('draws grid lines without axes when only showGrid is on', () => {
        const { container } = renderLayer({ showGrid: true });
        const gridLines = container.querySelectorAll('line[stroke="#e5e7eb"]');
        expect(gridLines.length).toBeGreaterThan(0);
        expect(container.querySelectorAll('line[marker-end="url(#arrow)"]')).toHaveLength(0);
        expect(container.querySelector('marker#arrow')).toBeNull();
    });

    it('skips the center grid lines when axes are also visible', () => {
        const { container } = renderLayer({ showGrid: true, visible: true });
        const gridLines = Array.from(container.querySelectorAll('line[stroke="#e5e7eb"]'));
        // no vertical grid line at x=200 and no horizontal grid line at y=200
        expect(gridLines.some(l => l.getAttribute('x1') === '200' && l.getAttribute('x2') === '200')).toBe(false);
        expect(gridLines.some(l => l.getAttribute('y1') === '200' && l.getAttribute('y2') === '200')).toBe(false);
    });

    it('keeps the center grid lines when axes are hidden', () => {
        const { container } = renderLayer({ showGrid: true, visible: false });
        const gridLines = Array.from(container.querySelectorAll('line[stroke="#e5e7eb"]'));
        expect(gridLines.some(l => l.getAttribute('x1') === '200' && l.getAttribute('x2') === '200')).toBe(true);
    });

    it('honors overrideOrigin for the axis center', () => {
        const { container } = renderLayer({ visible: true }, { overrideOrigin: { x: 100, y: 200 } });
        const verticalAxis = container.querySelectorAll('line[marker-end="url(#arrow)"]')[1];
        expect(verticalAxis.getAttribute('x1')).toBe('100');
    });

    it('renders one axis system per page centered in each page', () => {
        const { container } = renderLayer({ visible: true }, { pageCount: 2, pageHeight: 400, height: 800 });
        const horizontalAxes = Array.from(container.querySelectorAll('line[marker-end="url(#arrow)"]'))
            .filter(l => l.getAttribute('x1') === '0' && l.getAttribute('x2') === '400');
        expect(horizontalAxes.map(l => l.getAttribute('y1'))).toEqual(['200', '600']);
        expect(screen.getAllByText('0')).toHaveLength(2);
    });

    it('treats the full height as one page when pageHeight is omitted', () => {
        const { container } = renderLayer({ visible: true }, { height: 600 });
        const horizontalAxis = container.querySelector('line[marker-end="url(#arrow)"]')!;
        expect(horizontalAxis.getAttribute('y1')).toBe('300');
    });
});