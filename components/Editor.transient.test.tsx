// @vitest-environment jsdom
// Characterization tests for the transient DOM transform engine and constraint
// propagation during gestures. These pin down behavior that Editor.test.tsx
// only checks at gesture end (mid-drag DOM state, elastic line sync, marquee
// containment) so the Editor split can be verified step by step.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Editor } from './Editor';
import { stubPointerCapture } from '../test/componentHelpers';
import { saveProject, loadProject, getLocalFilePath } from '../utils/exportUtils';

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerPort: null },
    getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({
    default: class MockPdfWorker {},
}));
vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return {
        ...actual,
        saveProject: vi.fn(),
        loadProject: vi.fn(),
        getLocalFilePath: vi.fn(() => null),
        isElectron: vi.fn(() => false),
        exportCanvas: vi.fn(),
        exportAppIcon: vi.fn(),
    };
});

const renderEditor = () => {
    const utils = render(<Editor />);
    const svg = utils.container.querySelector('svg.touch-none') as SVGSVGElement;
    return { ...utils, svg };
};
const down = (svg: Element, x: number, y: number, opts: Record<string, unknown> = {}) =>
    fireEvent.pointerDown(svg, { clientX: x, clientY: y, button: 0, pointerId: 1, ...opts });
const move = (svg: Element, x: number, y: number, opts: Record<string, unknown> = {}) =>
    fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 1, ...opts });
const up = (svg: Element, x: number, y: number, opts: Record<string, unknown> = {}) =>
    fireEvent.pointerUp(svg, { clientX: x, clientY: y, button: 0, pointerId: 1, ...opts });
const groups = (container: HTMLElement) => container.querySelectorAll('g[data-shape-id]');
const clickTool = (label: string) => fireEvent.click(screen.getByTitle(label));
const key = (k: string, opts: Record<string, unknown> = {}) => fireEvent.keyDown(window, { key: k, ...opts });
const mainRect = (g: Element) => {
    const rects = g.querySelectorAll('rect');
    return rects[rects.length - 1];
};
const drawRect = (svg: Element, x1: number, y1: number, x2: number, y2: number) => {
    down(svg, x1, y1); move(svg, x2, y2); up(svg, x2, y2);
};
const drawPoint = (svg: Element, x: number, y: number) => {
    clickTool('Point (P)'); down(svg, x, y); up(svg, x, y);
};
const drawLine = (svg: Element, x1: number, y1: number, x2: number, y2: number) => {
    clickTool('Line (L)');
    down(svg, x1, y1); up(svg, x1, y1);
    down(svg, x2, y2); up(svg, x2, y2);
};

beforeEach(() => {
    stubPointerCapture();
    vi.mocked(saveProject).mockReset();
    vi.mocked(loadProject).mockReset();
    vi.mocked(getLocalFilePath).mockReset().mockReturnValue(null);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('transient transforms during a single-shape drag', () => {
    it('applies translate to the shape and overlay mid-drag and resets after release', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg, 100, 100, 200, 160);
        key('a');
        down(svg, 150, 100);
        move(svg, 180, 120);

        const g = groups(container)[0];
        expect(g.getAttribute('transform')).toBe('translate(30 20)');
        const overlay = container.querySelector('#selection-overlay-group')!;
        expect(overlay.getAttribute('transform')).toContain('translate(30 20)');
        // Real state is untouched until release
        expect(mainRect(g).getAttribute('x')).toBe('100');

        up(svg, 180, 120);
        expect(g.getAttribute('transform')).toBe('');
        expect(overlay.getAttribute('transform')).toBe('');
        expect(mainRect(g).getAttribute('x')).toBe('130');
        expect(mainRect(g).getAttribute('y')).toBe('120');
    });
});

describe('marquee containment', () => {
    it('selects only fully contained shapes', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg, 100, 100, 200, 160);
        drawRect(svg, 300, 100, 400, 160);
        key('a');
        key('Escape');
        down(svg, 50, 50);
        move(svg, 250, 200);
        up(svg, 250, 200);
        key('Delete');
        expect(groups(container)).toHaveLength(1);
        expect(mainRect(groups(container)[0]).getAttribute('x')).toBe('300');
    });
});

describe('points_link constraint propagation', () => {
    it('dragging a free point stretches the linked line in real state mid-drag', () => {
        const { svg, container } = renderEditor();
        drawPoint(svg, 200, 200);
        drawLine(svg, 200, 200, 300, 200);
        key('a');
        // (200,193) is inside the point hit radius (10) but outside the line tolerance (6)
        down(svg, 200, 193);
        move(svg, 250, 150);

        const line = groups(container)[1].querySelector('line')!;
        expect(line.getAttribute('x1')).toBe('250');
        expect(line.getAttribute('y1')).toBe('150');
        expect(line.getAttribute('x2')).toBe('300');

        up(svg, 250, 150);
        expect(line.getAttribute('x1')).toBe('250');
        expect(line.getAttribute('y1')).toBe('150');
    });

    it('group drag elastically syncs a dependent line through the DOM engine', () => {
        const { svg, container } = renderEditor();
        drawPoint(svg, 200, 200);
        drawLine(svg, 200, 200, 100, 100);
        clickTool('Rectangle');
        drawRect(svg, 220, 220, 260, 260);
        key('a');
        // Marquee contains point + rect but not the line (its bounds reach x=100)
        down(svg, 150, 195);
        move(svg, 270, 270);
        up(svg, 270, 270);

        // Drag from the rect; both selected shapes move, the unselected line follows elastically
        down(svg, 240, 240);
        move(svg, 270, 220);

        const pointG = groups(container)[0];
        const line = groups(container)[1].querySelector('line')!;
        const rectG = groups(container)[2];
        expect(pointG.getAttribute('transform')).toBe('translate(30 -20)');
        expect(rectG.getAttribute('transform')).toBe('translate(30 -20)');
        expect(line.getAttribute('x1')).toBe('230');
        expect(line.getAttribute('y1')).toBe('180');
        expect(line.getAttribute('x2')).toBe('100');
        expect(line.getAttribute('y2')).toBe('100');
        const overlay = container.querySelector('#selection-overlay-group')!;
        expect(overlay.getAttribute('transform')).toContain('translate(30 -20)');

        up(svg, 270, 220);
        expect(pointG.getAttribute('transform')).toBe('');
        expect(line.getAttribute('x1')).toBe('230');
        expect(line.getAttribute('y1')).toBe('180');
        expect(mainRect(rectG).getAttribute('x')).toBe('250');
        expect(mainRect(rectG).getAttribute('y')).toBe('200');
    });
});