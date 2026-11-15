// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Editor } from './Editor';
import { ShapeType } from '../types';
import { stubPointerCapture } from '../test/componentHelpers';
import { saveProject, loadProject, getLocalFilePath } from '../utils/exportUtils';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

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
const cursorClass = (container: HTMLElement) =>
    (container.querySelector('div.overflow-x-auto') as HTMLElement).className;
const mainRect = (container: HTMLElement) => {
    const g = container.querySelector('g[data-shape-id]')!;
    const rects = g.querySelectorAll('rect');
    return rects[rects.length - 1];
};
const drawRect = (svg: Element, x1 = 100, y1 = 100, x2 = 200, y2 = 160) => {
    down(svg, x1, y1); move(svg, x2, y2); up(svg, x2, y2);
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

describe('Editor rendering and tool switching', () => {
    it('renders the canvas, sidebar and top bar with no shapes', () => {
        const { svg, container } = renderEditor();
        expect(svg).toBeTruthy();
        expect(groups(container)).toHaveLength(0);
        expect(screen.getByTitle('Select (A)')).toBeInTheDocument();
        expect(screen.getByText('Add Page')).toBeInTheDocument();
    });

    it('starts with the SELECT tool (default cursor)', () => {
        const { container } = renderEditor();
        expect(cursorClass(container)).toContain('cursor-default');
    });

    it('switches tools via keyboard shortcuts and updates the cursor', () => {
        const { container } = renderEditor();
        key('l'); expect(cursorClass(container)).toContain('cursor-crosshair');
        key('f'); expect(cursorClass(container)).toContain('cursor-pen');
        key('e'); expect(cursorClass(container)).toContain('cursor-eraser');
        key('a'); expect(cursorClass(container)).toContain('cursor-default');
    });

    it('switches tools via the sidebar', () => {
        const { container } = renderEditor();
        clickTool('Pencil (F)');
        expect(cursorClass(container)).toContain('cursor-pen');
        expect(screen.getByTitle('Pencil (F)').className).toContain('bg-blue-600');
    });

    it('Escape returns to SELECT from another tool', () => {
        const { container } = renderEditor();
        clickTool('Triangle');
        key('Escape');
        expect(cursorClass(container)).toContain('cursor-default');
    });
});

describe('Editor drawing shapes', () => {
    it('draws a rectangle by dragging', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        expect(groups(container)).toHaveLength(1);
        const r = mainRect(container);
        expect(r.getAttribute('x')).toBe('100');
        expect(r.getAttribute('width')).toBe('100');
        expect(r.getAttribute('height')).toBe('60');
    });

    it('draws a triangle with three points', () => {
        const { svg, container } = renderEditor();
        clickTool('Triangle');
        down(svg, 100, 100); move(svg, 200, 200); up(svg, 200, 200);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] polygon')).toBeTruthy();
    });

    it('draws a circle by dragging', () => {
        const { svg, container } = renderEditor();
        clickTool('Circle');
        down(svg, 100, 100); move(svg, 200, 200); up(svg, 200, 200);
        expect(container.querySelector('g[data-shape-id] circle')).toBeTruthy();
    });

    it('creates a default-sized circle on a simple click', () => {
        const { svg, container } = renderEditor();
        clickTool('Circle');
        down(svg, 300, 300); up(svg, 300, 300);
        const c = container.querySelector('g[data-shape-id] circle')!;
        expect(c.getAttribute('r')).toBe('50');
    });

    it('creates a default-sized rectangle on a simple click', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        down(svg, 300, 300); up(svg, 300, 300);
        const r = mainRect(container);
        expect(Number(r.getAttribute('width'))).toBeGreaterThan(0);
    });

    it('draws an ellipse and a square', () => {
        const { svg, container } = renderEditor();
        clickTool('Ellipse');
        down(svg, 100, 100); move(svg, 250, 200); up(svg, 250, 200);
        expect(container.querySelector('g[data-shape-id] ellipse')).toBeTruthy();
        clickTool('Square');
        down(svg, 400, 100); move(svg, 480, 180); up(svg, 480, 180);
        expect(groups(container)).toHaveLength(2);
    });

    it('draws a point', () => {
        const { svg, container } = renderEditor();
        clickTool('Point (P)');
        down(svg, 200, 200); up(svg, 200, 200);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] circle')).toBeTruthy();
    });

    it('draws a line with two clicks', () => {
        const { svg, container } = renderEditor();
        clickTool('Line (L)');
        down(svg, 100, 100); up(svg, 100, 100);
        down(svg, 200, 200); up(svg, 200, 200);
        expect(groups(container)).toHaveLength(1);
        const line = container.querySelector('g[data-shape-id] line')!;
        expect(line.getAttribute('x2')).toBe('200');
    });

    it('draws a line by drag release', () => {
        const { svg, container } = renderEditor();
        clickTool('Line (L)');
        down(svg, 100, 100); move(svg, 200, 150); up(svg, 200, 150);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] line')).toBeTruthy();
    });

    it('draws a freehand stroke accumulating points', () => {
        const { svg, container } = renderEditor();
        clickTool('Pencil (F)');
        down(svg, 100, 100);
        move(svg, 120, 110); move(svg, 140, 120); move(svg, 160, 130);
        up(svg, 160, 130);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] path')).toBeTruthy();
    });

    it('creates and commits a text shape', () => {
        const { svg, container } = renderEditor();
        clickTool('Text');
        down(svg, 300, 300);
        const input = container.querySelector('input[type="text"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.change(input, { target: { value: 'Hi' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('Hi')).toBeInTheDocument();
    });

    it('discards an empty text shape on Enter', () => {
        const { svg, container } = renderEditor();
        clickTool('Text');
        down(svg, 300, 300);
        const input = container.querySelector('input[type="text"]') as HTMLInputElement;
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(groups(container)).toHaveLength(0);
    });

    it('creates a text shape on double-click in SELECT mode', () => {
        const { svg, container } = renderEditor();
        fireEvent.doubleClick(svg, { clientX: 400, clientY: 400 });
        const input = container.querySelector('input[type="text"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.change(input, { target: { value: 'Double' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('Double')).toBeInTheDocument();
    });
});

describe('Editor selection and dragging', () => {
    it('selects a shape by clicking it and shows the overlay', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        key('Escape');
        expect(container.querySelector('#selection-overlay-group')).toBeNull();
        down(svg, 150, 100); up(svg, 150, 100);
        expect(container.querySelector('#selection-overlay-group')).toBeTruthy();
    });

    it('selects a transparent rectangle by clicking its interior', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        key('Escape');
        expect(container.querySelector('#selection-overlay-group')).toBeNull();
        down(svg, 150, 130); up(svg, 150, 130);
        expect(container.querySelector('#selection-overlay-group')).toBeTruthy();
    });

    it('drags a selected shape to a new position', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        down(svg, 150, 100);
        move(svg, 180, 120);
        up(svg, 180, 120);
        expect(mainRect(container).getAttribute('x')).toBe('130');
        expect(mainRect(container).getAttribute('y')).toBe('120');
    });

    it('selects shapes with a marquee box', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        key('Escape');
        down(svg, 50, 50);
        move(svg, 250, 200);
        up(svg, 250, 200);
        expect(container.querySelector('#selection-overlay-group')).toBeTruthy();
    });

    it('moves a selected shape with arrow keys', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('ArrowRight');
        key('ArrowDown');
        expect(mainRect(container).getAttribute('x')).toBe('101');
        expect(mainRect(container).getAttribute('y')).toBe('101');
    });

    it('selects all with Ctrl+A and copies with Ctrl+C then pastes', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a', { ctrlKey: true });
        key('c', { ctrlKey: true });
        const paste = new Event('paste');
        (paste as any).clipboardData = { items: [] };
        fireEvent(window, paste);
        expect(groups(container)).toHaveLength(2);
    });
});

describe('Editor eraser, ruler and history', () => {
    it('erases a shape with the eraser tool', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('e');
        down(svg, 150, 100); up(svg, 150, 100);
        expect(groups(container)).toHaveLength(0);
    });

    it('places a ruler and switches to SELECT', () => {
        const { svg, container } = renderEditor();
        key('r');
        down(svg, 400, 300); up(svg, 400, 300);
        expect(groups(container)).toHaveLength(1);
        expect(cursorClass(container)).toContain('cursor-default');
    });

    it('undos a drawn shape with Ctrl+Z', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        expect(groups(container)).toHaveLength(1);
        key('z', { ctrlKey: true });
        expect(groups(container)).toHaveLength(0);
    });

    it('deletes the selected shape with Delete', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('Delete');
        expect(groups(container)).toHaveLength(0);
    });

    it('clears all shapes via the top bar', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        fireEvent.click(screen.getByTitle('Clear All'));
        expect(groups(container)).toHaveLength(0);
    });
});

describe('Editor zoom and pages', () => {
    it('zooms in and out via the top bar', () => {
        renderEditor();
        expect(screen.getByText('100%')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Zoom In'));
        expect(screen.getByText('110%')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Zoom Out'));
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('adds a page and updates the button label', () => {
        renderEditor();
        fireEvent.click(screen.getByText('Add Page'));
        expect(screen.getByText('Page 2 / Add +')).toBeInTheDocument();
    });
});

describe('Editor save and load', () => {
    it('saves to the current path and shows a confirmation', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true, filePath: '/docs/drawing.geo' });
        const { svg } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        fireEvent.click(screen.getByTitle('Save'));
        expect(await screen.findByText('已保存：drawing.geo')).toBeInTheDocument();
        expect(saveProject).toHaveBeenCalledWith(expect.any(Array), { filePath: null, saveAs: false });
    });

    it('saves as a new file via the dropdown', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true, filePath: '/docs/new.geo' });
        renderEditor();
        fireEvent.click(screen.getByTitle('Save options'));
        fireEvent.click(screen.getByText('Save As...'));
        await waitFor(() => expect(saveProject).toHaveBeenCalledWith(expect.any(Array), { filePath: null, saveAs: true }));
    });

    it('shows no confirmation when saving fails', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: false, filePath: undefined });
        renderEditor();
        fireEvent.click(screen.getByTitle('Save'));
        await waitFor(() => expect(saveProject).toHaveBeenCalled());
        expect(screen.queryByText(/已保存/)).toBeNull();
    });

    it('loads shapes from a .geo file via the file input', async () => {
        const loaded = [{ id: 'loaded1', type: ShapeType.RECTANGLE, points: [{ x: 10, y: 10 }, { x: 60, y: 40 }], fill: 'transparent', stroke: '#000', strokeWidth: 2, rotation: 0 }];
        vi.mocked(loadProject).mockResolvedValue(loaded as any);
        vi.mocked(getLocalFilePath).mockReturnValue('/docs/file.geo');
        const { container } = renderEditor();
        const file = new File([JSON.stringify(loaded)], 'file.geo', { type: '' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(groups(container)).toHaveLength(1));
        expect(loadProject).toHaveBeenCalledWith(file);
    });
});

describe('Editor construction and function tools', () => {
    it('draws a compass arc', () => {
        const { svg, container } = renderEditor();
        clickTool('Compass');
        down(svg, 500, 400);
        down(svg, 550, 400);
        move(svg, 500, 450);
        up(svg, 500, 450);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] path')).toBeTruthy();
    });

    it('creates a quadratic function graph', () => {
        const { svg, container } = renderEditor();
        clickTool('Quadratic Function');
        down(svg, 800, 400); up(svg, 800, 400);
        expect(groups(container)).toHaveLength(1);
        expect(container.querySelector('g[data-shape-id] path')).toBeTruthy();
    });

    it('creates a linear function graph', () => {
        const { svg, container } = renderEditor();
        clickTool('Linear Function');
        down(svg, 800, 400); up(svg, 800, 400);
        expect(groups(container)).toHaveLength(1);
    });

    it('places a protractor', () => {
        const { svg, container } = renderEditor();
        clickTool('Protractor');
        down(svg, 500, 400); up(svg, 500, 400);
        expect(groups(container)).toHaveLength(1);
    });

    it('mirrors a selected shape across a line', () => {
        const { svg, container } = renderEditor();
        clickTool('Line (L)');
        down(svg, 100, 300); move(svg, 300, 300); up(svg, 300, 300);
        key('a'); key('Escape');
        clickTool('Rectangle');
        down(svg, 150, 100); move(svg, 250, 180); up(svg, 250, 180);
        fireEvent.click(screen.getByText('Mirror'));
        expect(screen.getByText('Select a line to mirror across')).toBeInTheDocument();
        down(svg, 200, 300); up(svg, 200, 300);
        expect(groups(container)).toHaveLength(3);
        expect(screen.queryByText('Select a line to mirror across')).toBeNull();
    });
});

describe('Editor resize, rotate and angle editing', () => {
    it('resizes a shape by dragging a corner handle', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        const handles = container.querySelectorAll('#selection-overlay-group rect[width="10"]');
        fireEvent.pointerDown(handles[2], { clientX: 200, clientY: 160, button: 0, pointerId: 1 });
        move(svg, 250, 200);
        up(svg, 250, 200);
        expect(mainRect(container).getAttribute('width')).toBe('150');
        expect(mainRect(container).getAttribute('height')).toBe('100');
    });

    it('rotates a shape by dragging the rotation handle', () => {
        const { svg, container } = renderEditor();
        clickTool('Rectangle');
        drawRect(svg);
        key('a');
        const rot = container.querySelector('#selection-overlay-group circle[style*="grab"]')!;
        fireEvent.pointerDown(rot, { clientX: 150, clientY: 70, button: 0, pointerId: 1 });
        move(svg, 200, 130);
        up(svg, 200, 130);
        expect(container.querySelector('g[data-shape-id]')!.getAttribute('transform')).toContain('rotate(90');
    });

    it('opens the angle editor on double-click and closes on Escape', () => {
        const { svg, container } = renderEditor();
        clickTool('Triangle');
        down(svg, 100, 100); move(svg, 200, 200); up(svg, 200, 200);
        fireEvent.doubleClick(screen.getByText('90°'));
        const input = container.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(container.querySelector('input[type="number"]')).toBeNull();
    });

    it('solves a triangle angle on Enter', () => {
        const { svg, container } = renderEditor();
        clickTool('Triangle');
        down(svg, 100, 100); move(svg, 200, 200); up(svg, 200, 200);
        fireEvent.doubleClick(screen.getByText('90°'));
        const input = container.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '60' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(container.querySelector('input[type="number"]')).toBeNull();
    });

    it('recognizes a freehand stroke when smart sketch is enabled', () => {
        const { svg, container } = renderEditor();
        fireEvent.click(screen.getByText('Sketch Fix'));
        clickTool('Pencil (F)');
        down(svg, 100, 100);
        move(svg, 120, 102); move(svg, 140, 98); move(svg, 160, 101);
        move(svg, 180, 99); move(svg, 200, 100);
        up(svg, 200, 100);
        expect(groups(container)).toHaveLength(1);
    });
});

describe('Editor image and PDF import', () => {
    it('pastes an image from the clipboard', async () => {
        vi.stubGlobal('Image', class {
            width = 100; height = 100; onload: (() => void) | null = null;
            set src(_v: string) { this.onload?.(); }
        });
        const { container } = renderEditor();
        const file = new File(['img'], 'img.png', { type: 'image/png' });
        const paste = new Event('paste');
        (paste as any).clipboardData = { items: [{ type: 'image/png', getAsFile: () => file }] };
        fireEvent(window, paste);
        await waitFor(() => expect(groups(container)).toHaveLength(1));
    });

    it('imports a PDF page as a background image', async () => {
        const page = {
            getViewport: () => ({ width: 100, height: 200 }),
            render: () => ({ promise: Promise.resolve() }),
        };
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve(page) }) } as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x');
        const { container } = renderEditor();
        const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(groups(container)).toHaveLength(1));
        expect(screen.queryByText('Importing PDF')).toBeNull();
    });

    it('alerts when a PDF fails to load', async () => {
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) } as any);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = renderEditor();
        const file = new File(['%PDF'], 'bad.pdf', { type: 'application/pdf' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Failed to load PDF file.'));
        errSpy.mockRestore();
    });
});