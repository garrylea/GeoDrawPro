import { describe, it, expect } from 'vitest';
import { getPixelsPerUnit, screenToMath, mathToScreen, clientToCanvas } from './coordinates';

describe('getPixelsPerUnit', () => {
    it('falls back to 40 for non-positive dimensions', () => {
        expect(getPixelsPerUnit(0, 600, 5)).toBe(40);
        expect(getPixelsPerUnit(800, -1, 5)).toBe(40);
    });

    it('targets half the smaller dimension over the tick count', () => {
        expect(getPixelsPerUnit(800, 600, 5)).toBe(60);
        expect(getPixelsPerUnit(800, 600, 0)).toBe(60);
    });

    it('clamps to the 20px minimum and half-dimension maximum', () => {
        expect(getPixelsPerUnit(100, 100, 5)).toBe(20);
        expect(getPixelsPerUnit(100, 100, 1)).toBe(50);
    });
});

describe('screenToMath / mathToScreen', () => {
    it('screenToMath returns the origin for non-positive ppu', () => {
        expect(screenToMath({ x: 100, y: 100 }, 800, 600, 0)).toEqual({ x: 0, y: 0 });
    });

    it('screenToMath and mathToScreen round-trip with a custom originY', () => {
        const screen = { x: 440, y: 160 };
        const math = screenToMath(screen, 800, 600, 40, 200);
        expect(math).toEqual({ x: 1, y: 1 });
        expect(mathToScreen(math, 800, 600, 40, 200)).toEqual(screen);
    });
});

describe('clientToCanvas', () => {
    it('maps client coordinates through the svg rect and zoom', () => {
        const svg = { getBoundingClientRect: () => ({ left: 100, top: 50 }) } as unknown as SVGSVGElement;
        expect(clientToCanvas({ clientX: 300, clientY: 250 }, svg, 2)).toEqual({ x: 100, y: 100 });
    });
});