// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { CompassOverlay, RulerOverlay } from './ConstructionTools';
import { renderInSvg } from '../test/componentHelpers';

describe('CompassOverlay', () => {
    it('renders nothing before the needle is placed', () => {
        const { container } = renderInSvg(
            <CompassOverlay center={null} cursor={{ x: 10, y: 10 }} radiusPoint={null} isDrawing={false} />
        );
        expect(container.querySelector('svg')!.childElementCount).toBe(0);
    });

    it('spans the legs from needle to cursor and rotates toward the cursor', () => {
        const { container } = renderInSvg(
            <CompassOverlay center={{ x: 100, y: 100 }} cursor={{ x: 200, y: 100 }} radiusPoint={null} isDrawing={false} />
        );
        const group = container.querySelector('g[transform]')!;
        expect(group.getAttribute('transform')).toBe('translate(100, 100) rotate(0)');
        const legs = container.querySelectorAll('line');
        expect(legs).toHaveLength(2);
        // dist=100 -> hinge at (50, -13.395), pencil tip at (100, 0)
        expect(legs[0].getAttribute('x1')).toBe('50');
        expect(legs[0].getAttribute('x2')).toBe('0');
        expect(legs[1].getAttribute('x2')).toBe('100');
        expect(parseFloat(legs[0].getAttribute('y1')!)).toBeCloseTo(-13.395, 2);
    });

    it('locks the spread to radiusPoint while still following the cursor angle', () => {
        const { container } = renderInSvg(
            <CompassOverlay center={{ x: 0, y: 0 }} cursor={{ x: 0, y: 60 }} radiusPoint={{ x: 60, y: 0 }} isDrawing={false} />
        );
        const group = container.querySelector('g[transform]')!;
        expect(group.getAttribute('transform')).toBe('translate(0, 0) rotate(90)');
        // spread stays 60 even though the cursor is 60 away in another direction
        expect(container.querySelectorAll('line')[1].getAttribute('x2')).toBe('60');
    });

    it('shows a pulsing pencil tip only while drawing', () => {
        const { container, rerender } = renderInSvg(
            <CompassOverlay center={{ x: 0, y: 0 }} cursor={{ x: 100, y: 0 }} radiusPoint={null} isDrawing={false} />
        );
        expect(container.querySelector('.animate-ping')).toBeNull();
        rerender(
            <svg>
                <CompassOverlay center={{ x: 0, y: 0 }} cursor={{ x: 100, y: 0 }} radiusPoint={null} isDrawing={true} />
            </svg>
        );
        expect(container.querySelector('.animate-ping')).toBeTruthy();
    });

    it('clamps hinge height and stroke width for tiny radii', () => {
        const { container } = renderInSvg(
            <CompassOverlay center={{ x: 0, y: 0 }} cursor={{ x: 10, y: 0 }} radiusPoint={null} isDrawing={false} />
        );
        const legs = container.querySelectorAll('line');
        expect(legs[0].getAttribute('y1')).toBe('-12');
        expect(legs[0].getAttribute('stroke-width')).toBe('1');
    });
});

describe('RulerOverlay', () => {
    it('shows a default ruler at the cursor before placement', () => {
        const { container } = renderInSvg(
            <RulerOverlay start={null} cursor={{ x: 50, y: 60 }} end={null} />
        );
        expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe('translate(50, 60) rotate(0)');
        expect(container.querySelector('rect')!.getAttribute('width')).toBe('400');
        expect(screen.getByText('Click to Place')).toBeTruthy();
    });

    it('sizes to the start-cursor distance while aligning', () => {
        const { container } = renderInSvg(
            <RulerOverlay start={{ x: 100, y: 100 }} cursor={{ x: 200, y: 100 }} end={null} />
        );
        // distance 100 + 100 padding = 200 body, +100 rect overhang = 300
        expect(container.querySelector('rect')!.getAttribute('width')).toBe('300');
        expect(screen.getByText('Click to Align')).toBeTruthy();
    });

    it('locks to the start-end segment once aligned', () => {
        const { container } = renderInSvg(
            <RulerOverlay start={{ x: 100, y: 100 }} cursor={{ x: 999, y: 999 }} end={{ x: 300, y: 100 }} />
        );
        expect(container.querySelector('rect')!.getAttribute('width')).toBe('400');
        expect(screen.getByText('Drag along edge to draw')).toBeTruthy();
    });

    it('rotates to match the segment direction', () => {
        const { container } = renderInSvg(
            <RulerOverlay start={{ x: 0, y: 0 }} cursor={{ x: 0, y: 0 }} end={{ x: 0, y: 100 }} />
        );
        expect(container.querySelector('g[transform]')!.getAttribute('transform')).toBe('translate(0, 0) rotate(90)');
    });

    it('draws tick marks every 10px and numeric labels every 50px', () => {
        const { container } = renderInSvg(
            <RulerOverlay start={null} cursor={{ x: 0, y: 0 }} end={null} />
        );
        // body length 300 + 100 = 400 -> 40 ticks, 8 labels (0..7)
        const ticks = Array.from(container.querySelectorAll('line'));
        expect(ticks).toHaveLength(40);
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('7')).toBeTruthy();
        expect(screen.queryByText('8')).toBeNull();
    });
});