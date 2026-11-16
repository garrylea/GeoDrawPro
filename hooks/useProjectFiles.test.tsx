// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, fireEvent, waitFor } from '@testing-library/react';
import { useProjectFiles } from './useProjectFiles';
import { saveProject } from '../utils/exportUtils';
import { convertHeicToPngDataUrl, HeicImportError } from '../utils/heicImport';
import { makeShape } from '../test/componentHelpers';
import { Shape, ShapeType, ToolType } from '../types';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

// Exact specifiers — must match Editor.test.tsx's mocks byte-for-byte.
vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerPort: null },
    getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({
    default: class MockPdfWorker {},
}));
vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return { ...actual, saveProject: vi.fn() };
});
vi.mock('../utils/heicImport', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/heicImport')>();
    return { ...actual, convertHeicToPngDataUrl: vi.fn() };
});

type Deps = Parameters<typeof useProjectFiles>[0];

const makeParams = (overrides: Partial<Deps> = {}): Deps => {
    let idCounter = 0;
    return {
        shapes: [],
        setShapes: vi.fn(),
        setSelectedIds: vi.fn(),
        setTool: vi.fn(),
        saveHistory: vi.fn(),
        clipboard: [],
        isDirty: false,
        setIsDirty: vi.fn(),
        currentFilePathRef: { current: null },
        canvasWidth: 1600,
        originY: 700,
        pageHeight: 1400,
        setPageHeight: vi.fn(),
        setPageCount: vi.fn(),
        setLockBackground: vi.fn(),
        cursorPosRef: { current: null },
        generateId: () => `gen-${++idCounter}`,
        ...overrides,
    };
};

const setup = (overrides: Partial<Deps> = {}) => {
    const params = makeParams(overrides);
    const hook = renderHook(() => useProjectFiles(params));
    return { hook, params };
};

// Applies the first setShapes argument (updater or direct value) to prev.
const appliedShapes = (setShapes: Deps['setShapes'], prev: Shape[]): Shape[] => {
    const arg = vi.mocked(setShapes).mock.calls[0][0];
    return typeof arg === 'function' ? arg(prev) : arg;
};

const rect = makeShape('r1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
const pdfFile = () => new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

const stubImage = (width: number, height: number) => {
    vi.stubGlobal('Image', class {
        width = width; height = height; onload: (() => void) | null = null;
        set src(_v: string) { this.onload?.(); }
    });
};

beforeEach(() => {
    vi.mocked(saveProject).mockReset();
    vi.mocked(pdfjsLib.getDocument).mockReset();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useProjectFiles mount effects', () => {
    it('does not initialize the PDF worker on mount and exposes a file input ref', () => {
        const { hook } = setup();
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeNull();
        expect(hook.result.current.fileInputRef.current).toBeNull();
        expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
        expect(hook.result.current.saveMessage).toBeNull();
    });

    it('blocks beforeunload while the document is dirty', () => {
        setup({ isDirty: true });
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
    });

    it('allows beforeunload when the document is clean', () => {
        setup({ isDirty: false });
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(false);
    });
});

describe('useProjectFiles.persistProject', () => {
    it('saves to the current path, updates the ref, clears dirty and shows the file name', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true, filePath: '/docs/drawing.geo' });
        const { hook, params } = setup({ currentFilePathRef: { current: '/docs/old.geo' } });
        let success = false;
        await act(async () => { success = await hook.result.current.persistProject([rect]); });
        expect(saveProject).toHaveBeenCalledWith([rect], { filePath: '/docs/old.geo', saveAs: false });
        expect(success).toBe(true);
        expect(params.currentFilePathRef.current).toBe('/docs/drawing.geo');
        expect(params.setIsDirty).toHaveBeenCalledWith(false);
        expect(hook.result.current.saveMessage).toBe('已保存：drawing.geo');
    });

    it('shows a generic confirmation when the save returns no path', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true });
        const { hook, params } = setup();
        await act(async () => { await hook.result.current.persistProject([rect]); });
        expect(hook.result.current.saveMessage).toBe('文件保存成功！');
        expect(params.currentFilePathRef.current).toBeNull();
    });

    it('returns false and changes nothing when the save fails', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: false });
        const { hook, params } = setup({ currentFilePathRef: { current: '/docs/old.geo' } });
        let success = true;
        await act(async () => { success = await hook.result.current.persistProject([rect]); });
        expect(success).toBe(false);
        expect(params.currentFilePathRef.current).toBe('/docs/old.geo');
        expect(params.setIsDirty).not.toHaveBeenCalled();
        expect(hook.result.current.saveMessage).toBeNull();
    });

    it('clears the save confirmation after 3 seconds', async () => {
        vi.useFakeTimers();
        vi.mocked(saveProject).mockResolvedValue({ success: true, filePath: '/docs/drawing.geo' });
        const { hook } = setup();
        await act(async () => { await hook.result.current.persistProject([rect]); });
        expect(hook.result.current.saveMessage).toBe('已保存：drawing.geo');
        act(() => { vi.advanceTimersByTime(3000); });
        expect(hook.result.current.saveMessage).toBeNull();
    });
});

describe('useProjectFiles.handleSave / handleSaveAs', () => {
    it('handleSave persists the current shapes without saveAs', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true });
        const { hook } = setup({ shapes: [rect] });
        await act(async () => { await hook.result.current.handleSave(); });
        expect(saveProject).toHaveBeenCalledWith([rect], { filePath: null, saveAs: false });
    });

    it('handleSaveAs persists the current shapes with saveAs: true', async () => {
        vi.mocked(saveProject).mockResolvedValue({ success: true, filePath: '/docs/new.geo' });
        const { hook } = setup({ shapes: [rect] });
        await act(async () => { await hook.result.current.handleSaveAs(); });
        expect(saveProject).toHaveBeenCalledWith([rect], { filePath: null, saveAs: true });
    });
});

describe('useProjectFiles.handleFileLoad', () => {
    const loaded = [{
        id: 'l1', type: ShapeType.RECTANGLE,
        points: [{ x: 0, y: 0 }, { x: 50, y: 2900 }],
        fill: '', stroke: '', strokeWidth: 0, rotation: 0,
    }];

    it('replaces shapes, clears selection, resets dirty and sizes pages from maxY', () => {
        const { hook, params } = setup({ pageHeight: 1400 });
        act(() => { hook.result.current.handleFileLoad(JSON.stringify(loaded), '/docs/file.geo'); });
        expect(params.saveHistory).toHaveBeenCalled();
        const next = appliedShapes(params.setShapes, [rect]);
        expect(next).toHaveLength(1);
        expect(next[0].id).toBe('l1');
        expect(next[0].fill).toBe('transparent'); // sanitizeLoadedShapes default
        expect(next[0].points[1]).toEqual({ x: 50, y: 2900 });
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set());
        expect(params.setIsDirty).toHaveBeenCalledWith(false);
        expect(params.setPageCount).toHaveBeenCalledWith(3); // ceil(2900 / 1400)
        expect(params.currentFilePathRef.current).toBe('/docs/file.geo');
    });

    it('defaults the file path to null', () => {
        const { hook, params } = setup({ currentFilePathRef: { current: '/docs/old.geo' } });
        act(() => { hook.result.current.handleFileLoad(JSON.stringify(loaded)); });
        expect(params.currentFilePathRef.current).toBeNull();
    });

    it('is a no-op for invalid JSON', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { hook, params } = setup();
        act(() => { hook.result.current.handleFileLoad('{not json'); });
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(params.setPageCount).not.toHaveBeenCalled();
        expect(params.setIsDirty).not.toHaveBeenCalled();
        expect(errSpy).toHaveBeenCalledWith('Load Failed', expect.anything());
    });

    it('is a no-op when the JSON is not an array', () => {
        const { hook, params } = setup();
        act(() => { hook.result.current.handleFileLoad('{"id":"x"}'); });
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
    });
});

describe('useProjectFiles paste effect', () => {
    it('pastes clipboard shapes with a 20px offset, new ids and stripped constraint/markerConfig', () => {
        const clip = makeShape('c1', ShapeType.RECTANGLE, [{ x: 10, y: 20 }, { x: 30, y: 40 }], {
            constraint: { type: 'points_link', parentId: 'p9' },
            markerConfig: { type: 'angle_arc', targets: [{ shapeId: 'c1', pointIndices: [0] }] },
        });
        const { params } = setup({ clipboard: [clip] });
        const paste = new Event('paste', { cancelable: true });
        (paste as any).clipboardData = { items: [] };
        act(() => { fireEvent(window, paste); });
        expect(paste.defaultPrevented).toBe(true);
        expect(params.saveHistory).toHaveBeenCalled();
        const next = appliedShapes(params.setShapes, [rect]);
        expect(next).toHaveLength(2);
        const copied = next[1];
        expect(copied.id).not.toBe('c1');
        expect(copied.points).toEqual([{ x: 30, y: 40 }, { x: 50, y: 60 }]);
        expect(copied.constraint).toBeUndefined();
        expect(copied.markerConfig).toBeUndefined();
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set([copied.id]));
        expect(params.setTool).toHaveBeenCalledWith(ToolType.SELECT);
        // The clipboard source shape must not be mutated.
        expect(clip.points[0]).toEqual({ x: 10, y: 20 });
        expect(clip.constraint).toBeDefined();
    });

    it('does nothing when the clipboard is empty and no image is present', () => {
        const { params } = setup({ clipboard: [] });
        const paste = new Event('paste', { cancelable: true });
        (paste as any).clipboardData = { items: [] };
        act(() => { fireEvent(window, paste); });
        expect(paste.defaultPrevented).toBe(false);
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
    });

    it('routes image clipboard items to processImageFile at the cursor position', async () => {
        stubImage(100, 100);
        const { params } = setup({ cursorPosRef: { current: { x: 42, y: 84 } } });
        const file = new File(['img'], 'img.png', { type: 'image/png' });
        const paste = new Event('paste', { cancelable: true });
        (paste as any).clipboardData = { items: [{ type: 'image/png', getAsFile: () => file }] };
        act(() => { fireEvent(window, paste); });
        await waitFor(() => expect(params.setShapes).toHaveBeenCalled());
        expect(paste.defaultPrevented).toBe(true);
        expect(params.saveHistory).toHaveBeenCalled();
        const next = appliedShapes(params.setShapes, []);
        expect(next).toHaveLength(1);
        expect(next[0].type).toBe(ShapeType.IMAGE);
        expect(next[0].points).toEqual([{ x: -8, y: 34 }, { x: 92, y: 134 }]);
        expect(params.setSelectedIds).toHaveBeenCalledWith(new Set([next[0].id]));
        expect(params.setTool).toHaveBeenCalledWith(ToolType.SELECT);
    });
});

describe('useProjectFiles.processImageFile', () => {
    it('centers at canvasWidth/2 and originY, capping the longest side at 300', async () => {
        stubImage(600, 300);
        const { hook, params } = setup({ canvasWidth: 1600, originY: 700 });
        const file = new File(['img'], 'big.png', { type: 'image/png' });
        act(() => { hook.result.current.processImageFile(file); });
        await waitFor(() => expect(params.setShapes).toHaveBeenCalled());
        const next = appliedShapes(params.setShapes, []);
        // 600x300 → 300x150 centered at (800, 700)
        expect(next[0].points).toEqual([{ x: 650, y: 625 }, { x: 950, y: 775 }]);
        expect(next[0].imageUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('keeps small images at their natural size at the given position', async () => {
        stubImage(80, 60);
        const { hook, params } = setup();
        const file = new File(['img'], 'small.png', { type: 'image/png' });
        act(() => { hook.result.current.processImageFile(file, { x: 200, y: 300 }); });
        await waitFor(() => expect(params.setShapes).toHaveBeenCalled());
        const next = appliedShapes(params.setShapes, []);
        expect(next[0].points).toEqual([{ x: 160, y: 270 }, { x: 240, y: 330 }]);
    });
});

describe('useProjectFiles.processImageFile (HEIC)', () => {
    const heicFile = () => new File(['heic'], 'photo.heic', { type: '' });

    it('converts HEIC to PNG and inserts the image at the drop point', async () => {
        stubImage(400, 200);
        vi.mocked(convertHeicToPngDataUrl).mockResolvedValue('data:image/png;base64,AAA');
        const { hook, params } = setup({ canvasWidth: 1600, originY: 700 });

        await act(async () => {
            await hook.result.current.processImageFile(heicFile(), { x: 200, y: 300 });
        });

        expect(convertHeicToPngDataUrl).toHaveBeenCalledTimes(1);
        const next = appliedShapes(params.setShapes, []);
        expect(next).toHaveLength(1);
        expect(next[0].type).toBe(ShapeType.IMAGE);
        expect(next[0].imageUrl).toBe('data:image/png;base64,AAA');
        // 400x200 → 300x150, centered at (200, 300)
        expect(next[0].points).toEqual([{ x: 50, y: 225 }, { x: 350, y: 375 }]);
    });

    it('shows the loading overlay while converting and hides it afterwards', async () => {
        stubImage(100, 100);
        let resolveConvert!: (value: string) => void;
        vi.mocked(convertHeicToPngDataUrl).mockReturnValue(
            new Promise<string>((resolve) => { resolveConvert = resolve; }),
        );
        const { hook } = setup();

        let pending: Promise<void> | undefined;
        act(() => { pending = hook.result.current.processImageFile(heicFile()); });
        expect(hook.result.current.loadingState.active).toBe(true);
        expect(hook.result.current.loadingState.title).toBe('Importing Image');

        await act(async () => {
            resolveConvert('data:image/png;base64,BBB');
            await pending;
        });
        expect(hook.result.current.loadingState.active).toBe(false);
        expect(hook.result.current.loadingState.message).toBe('');
    });

    it('reports a conversion failure without touching shapes or history', async () => {
        vi.mocked(convertHeicToPngDataUrl).mockRejectedValue(
            new HeicImportError('当前平台暂不支持 HEIC 转换（仅 macOS）'),
        );
        const { hook, params } = setup();

        await act(async () => {
            await hook.result.current.processImageFile(heicFile());
        });

        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(hook.result.current.importError).toBe('当前平台暂不支持 HEIC 转换（仅 macOS）');
        expect(hook.result.current.loadingState.active).toBe(false);
    });

    it('reports a decode failure instead of failing silently', async () => {
        vi.stubGlobal('Image', class {
            width = 0; height = 0;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) { this.onerror?.(); }
        });
        const { hook, params } = setup();

        await act(async () => {
            await hook.result.current.processImageFile(new File(['x'], 'broken.png', { type: 'image/png' }));
        });

        await waitFor(() => expect(hook.result.current.importError).toBe('无法解码转换后的图片'));
        expect(params.setShapes).not.toHaveBeenCalled();
    });
});

describe('useProjectFiles.processPdfFile', () => {
    const mockPdfPages = (numPages: number) => {
        const page = {
            getViewport: () => ({ width: 200, height: 400 }),
            render: () => ({ promise: Promise.resolve() }),
        };
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({
            promise: Promise.resolve({ numPages, getPage: () => Promise.resolve(page) }),
        } as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x');
    };

    it('appends rendered pages, grows the page count, locks the background and syncs page height', async () => {
        mockPdfPages(2);
        const { hook, params } = setup();
        await act(async () => { await hook.result.current.processPdfFile(pdfFile()); });
        expect(params.saveHistory).toHaveBeenCalled();
        const next = appliedShapes(params.setShapes, [rect]);
        expect(next).toHaveLength(3); // existing shape + 2 pages
        expect(next[1].type).toBe(ShapeType.IMAGE);
        expect(next[1].isBackground).toBe(true);
        expect(next[2].isBackground).toBe(true);
        // LOGICAL_CANVAS_WIDTH 1600 → targetWidth 1280, aspect 2 → displayHeight 2560
        expect(params.setPageHeight).toHaveBeenCalledWith(2560);
        const countArg = vi.mocked(params.setPageCount).mock.calls[0][0];
        expect(typeof countArg === 'function' ? countArg(1) : countArg).toBe(2);
        expect(typeof countArg === 'function' ? countArg(5) : countArg).toBe(5);
        expect(params.setLockBackground).toHaveBeenCalledWith(true);
        expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
    });

    it('shows per-page progress while importing and hides the overlay when done', async () => {
        const page = {
            getViewport: () => ({ width: 200, height: 400 }),
            render: () => ({ promise: Promise.resolve() }),
        };
        let resolvePage!: (p: typeof page) => void;
        const pagePromise = new Promise<typeof page>(res => { resolvePage = res; });
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({
            promise: Promise.resolve({ numPages: 1, getPage: () => pagePromise }),
        } as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x');
        const { hook } = setup();
        let done!: Promise<void>;
        // First act: let the import run until it parks on the deferred page.
        // Exiting act flushes the in-flight loadingState update.
        await act(async () => {
            done = hook.result.current.processPdfFile(pdfFile());
            await new Promise(r => setTimeout(r, 10));
        });
        expect(hook.result.current.loadingState).toEqual({ active: true, message: 'Processing page 1 of 1...' });
        await act(async () => { resolvePage(page); await done; });
        expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
    });

    it('leaves pageHeight untouched when no page rendered, but still commits the shell state', async () => {
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({
            promise: Promise.resolve({ numPages: 0, getPage: vi.fn() }),
        } as any);
        const { hook, params } = setup();
        await act(async () => { await hook.result.current.processPdfFile(pdfFile()); });
        expect(params.setPageHeight).not.toHaveBeenCalled();
        expect(params.saveHistory).toHaveBeenCalled();
        expect(params.setLockBackground).toHaveBeenCalledWith(true);
        expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
    });

    it('initializes the PDF worker lazily during import', async () => {
        mockPdfPages(1);
        const { hook } = setup();
        await act(async () => { await hook.result.current.processPdfFile(pdfFile()); });
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeInstanceOf(PdfWorker);
    });

    it('alerts and clears the overlay when the PDF fails to load', async () => {
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) } as any);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { hook, params } = setup();
        await act(async () => { await hook.result.current.processPdfFile(pdfFile()); });
        expect(alertSpy).toHaveBeenCalledWith('Failed to load PDF file.');
        expect(errSpy).toHaveBeenCalledWith('Error processing PDF:', expect.any(Error));
        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
    });
});

describe('useProjectFiles callback stability', () => {
    it('keeps save handlers stable across rerenders with unchanged shapes', () => {
        const { hook } = setup();
        const first = hook.result.current;
        hook.rerender();
        expect(hook.result.current.handleSave).toBe(first.handleSave);
        expect(hook.result.current.handleSaveAs).toBe(first.handleSaveAs);
    });
});