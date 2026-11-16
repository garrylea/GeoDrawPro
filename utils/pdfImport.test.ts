// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShapeType } from '../types';

// Exact specifiers — must match Editor.test.tsx / Editor.transient.test.tsx / useProjectFiles.test.tsx.
vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerPort: null },
    getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({
    default: class MockPdfWorker {
        static failNext = false;
        constructor() {
            if (MockPdfWorker.failNext) {
                MockPdfWorker.failNext = false;
                throw new Error('worker construction failed');
            }
        }
    },
}));

let pdfjsLib: typeof import('pdfjs-dist/build/pdf.mjs');
let PdfWorker: any;
let ensurePdfReady: typeof import('./pdfImport').ensurePdfReady;
let renderPdfToShapes: typeof import('./pdfImport').renderPdfToShapes;

const pdfFile = () => new File(['%PDF-1.4 test'], 'doc.pdf', { type: 'application/pdf' });

const makePage = (width: number, height: number) => ({
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
});

const mockPdf = (pages: ReturnType<typeof makePage>[]) => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve({
            numPages: pages.length,
            getPage: vi.fn((i: number) => Promise.resolve(pages[i - 1])),
        }),
    } as any);
};

const makeOpts = () => {
    let n = 0;
    return {
        logicalCanvasWidth: 1000,
        generateId: vi.fn(() => `pdf-shape-${++n}`),
        onProgress: vi.fn(),
    };
};

// resetModules 让 pdfImport 的模块级 readyPromise 每个测试重新初始化；
// mock 工厂随之重新执行，GlobalWorkerOptions 与 failNext 也是全新状态。
beforeEach(async () => {
    vi.resetModules();
    pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
    // @ts-ignore
    PdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?worker')).default;
    ({ ensurePdfReady, renderPdfToShapes } = await import('./pdfImport'));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,page');
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('ensurePdfReady', () => {
    it('assigns workerPort and resolves the pdfjs module', async () => {
        const mod = await ensurePdfReady();
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeInstanceOf(PdfWorker);
        expect(mod.getDocument).toBe(pdfjsLib.getDocument);
    });
    it('constructs the worker once across repeated calls', async () => {
        await ensurePdfReady();
        const first = pdfjsLib.GlobalWorkerOptions.workerPort;
        await ensurePdfReady();
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBe(first);
    });
    it('logs and swallows worker construction errors', async () => {
        PdfWorker.failNext = true;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(ensurePdfReady()).resolves.toBeDefined();
        expect(errSpy).toHaveBeenCalledWith('Failed to initialize PDF worker:', expect.any(Error));
    });
});

describe('renderPdfToShapes', () => {
    it('renders one background IMAGE shape per PDF page', async () => {
        mockPdf([makePage(100, 200), makePage(100, 200)]);
        const result = await renderPdfToShapes(pdfFile(), makeOpts());
        expect(result.shapes).toHaveLength(2);
        expect(result.pageCount).toBe(2);
        for (const s of result.shapes) {
            expect(s.type).toBe(ShapeType.IMAGE);
            expect(s.isBackground).toBe(true);
            expect(s.imageUrl).toBe('data:image/png;base64,page');
        }
        expect(result.shapes[0].id).toBe('pdf-shape-1');
        expect(result.shapes[1].id).toBe('pdf-shape-2');
    });

    it('fits pages to 80% of the logical canvas width, horizontally centered', async () => {
        mockPdf([makePage(100, 200)]);
        const result = await renderPdfToShapes(pdfFile(), makeOpts());
        const [tl, br] = result.shapes[0].points;
        expect(br.x - tl.x).toBe(800);
        expect((tl.x + br.x) / 2).toBe(500);
    });

    it('returns the first page display height as pageHeight', async () => {
        mockPdf([makePage(100, 200), makePage(100, 100)]);
        const result = await renderPdfToShapes(pdfFile(), makeOpts());
        // Page 1 viewport at scale 2 is 200x400 → aspect 2 → 800 * 2 = 1600.
        // Page 2 would yield 800; the first page must win.
        expect(result.pageHeight).toBe(1600);
    });

    it('stacks pages vertically (pageTopY = pageIndex * displayHeight)', async () => {
        mockPdf([makePage(100, 200), makePage(100, 200)]);
        const result = await renderPdfToShapes(pdfFile(), makeOpts());
        const [first, second] = result.shapes;
        expect(first.points[0].y).toBe(0);
        expect(first.points[1].y).toBe(1600);
        expect(second.points[0].y).toBe(1600);
        expect(second.points[1].y).toBe(3200);
    });

    it('reports progress for the load and for every page', async () => {
        mockPdf([makePage(100, 200), makePage(100, 200)]);
        const opts = makeOpts();
        await renderPdfToShapes(pdfFile(), opts);
        expect(opts.onProgress).toHaveBeenCalledTimes(3);
        expect(opts.onProgress).toHaveBeenNthCalledWith(1, 'Loading PDF...');
        expect(opts.onProgress).toHaveBeenNthCalledWith(2, 'Processing page 1 of 2...');
        expect(opts.onProgress).toHaveBeenNthCalledWith(3, 'Processing page 2 of 2...');
    });

    it('renders at scale 2.0 from the file bytes', async () => {
        const page = makePage(100, 200);
        mockPdf([page]);
        const file = pdfFile();
        await renderPdfToShapes(file, makeOpts());
        expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 });
        expect(page.render).toHaveBeenCalledWith({
            canvasContext: expect.anything(),
            viewport: { width: 200, height: 400 },
        });
        const arg = vi.mocked(pdfjsLib.getDocument).mock.calls[0][0] as { data: ArrayBuffer };
        expect(Array.from(new Uint8Array(arg.data))).toEqual(Array.from(new Uint8Array(await file.arrayBuffer())));
    });

    it('skips pages whose 2d context is unavailable', async () => {
        mockPdf([makePage(100, 200), makePage(100, 200)]);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null).mockReturnValue({} as any);
        const result = await renderPdfToShapes(pdfFile(), makeOpts());
        expect(result.shapes).toHaveLength(1);
        expect(result.pageCount).toBe(2);
    });

    it('propagates PDF errors to the caller (no internal catch)', async () => {
        vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) } as any);
        await expect(renderPdfToShapes(pdfFile(), makeOpts())).rejects.toThrow('bad pdf');
    });
});