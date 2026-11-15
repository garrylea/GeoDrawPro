// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SnapIndicator } from './SnapIndicator';
import { renderInSvg } from '../../test/componentHelpers';

describe('SnapIndicator', () => {
    it('renders a triangle path for midpoint snaps', () => {
        const { container } = renderInSvg(<SnapIndicator indicator={{ x: 10, y: 20, type: 'midpoint' }} />);
        const path = container.querySelector('path')!;
        expect(path.getAttribute('d')).toBe('M -6 4 L 0 -7 L 6 4 Z');
        expect(path.getAttribute('stroke')).toBe('#fbbf24');
        expect(path.getAttribute('fill')).toBe('none');
        expect(container.querySelectorAll('circle')).toHaveLength(0);
    });

    it('renders a circle with crosshair lines for center snaps', () => {
        const { container } = renderInSvg(<SnapIndicator indicator={{ x: 0, y: 0, type: 'center' }} />);
        const circles = container.querySelectorAll('circle');
        expect(circles).toHaveLength(1);
        expect(circles[0].getAttribute('r')).toBe('5');
        const lines = container.querySelectorAll('line');
        expect(lines).toHaveLength(2);
        expect(lines[0].getAttribute('x1')).toBe('-8');
        expect(lines[0].getAttribute('x2')).toBe('8');
        expect(lines[1].getAttribute('y1')).toBe('-8');
        expect(lines[1].getAttribute('y2')).toBe('8');
        expect(container.querySelector('path')).toBeNull();
    });

    it('renders a single circle for endpoint snaps', () => {
        const { container } = renderInSvg(<SnapIndicator indicator={{ x: 1, y: 2, type: 'endpoint' }} />);
        const circles = container.querySelectorAll('circle');
        expect(circles).toHaveLength(1);
        expect(circles[0].getAttribute('r')).toBe('5');
        expect(circles[0].getAttribute('stroke')).toBe('#fbbf24');
        expect(container.querySelectorAll('line')).toHaveLength(0);
        expect(container.querySelector('path')).toBeNull();
    });

    it('renders a single circle when type is undefined or on_edge', () => {
        const { container } = renderInSvg(<SnapIndicator indicator={{ x: 3, y: 4 }} />);
        expect(container.querySelectorAll('circle')).toHaveLength(1);
        expect(container.querySelectorAll('line')).toHaveLength(0);
        const { container: edge } = renderInSvg(<SnapIndicator indicator={{ x: 3, y: 4, type: 'on_edge' }} />);
        expect(edge.querySelectorAll('circle')).toHaveLength(1);
        expect(edge.querySelectorAll('line')).toHaveLength(0);
    });

    it('translates the group to the indicator coordinates', () => {
        const { container } = renderInSvg(<SnapIndicator indicator={{ x: 123.5, y: -42, type: 'endpoint' }} />);
        expect(container.querySelector('g')!.getAttribute('transform')).toBe('translate(123.5, -42)');
    });
});