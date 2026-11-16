import { Shape } from '../types';
import { createImageShape } from './shapeFactory';

// pdfjs is loaded lazily so the worker chunk stays out of the initial bundle.
// The two dynamic import specifiers below must stay byte-identical:
// Editor.test.tsx / Editor.transient.test.tsx / useProjectFiles.test.tsx mock these exact modules.

type PdfjsModule = typeof import('pdfjs-dist/build/pdf.mjs');

let readyPromise: Promise<PdfjsModule> | null = null;

export const ensurePdfReady = (): Promise<PdfjsModule> => {
    if (!readyPromise) {
        readyPromise = (async () => {
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            try {
                // @ts-ignore
                const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.mjs?worker');
                pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
            } catch (e) {
                console.error('Failed to initialize PDF worker:', e);
            }
            return pdfjsLib;
        })().catch(e => {
            // Module import failed (e.g. flaky network / stale chunk): reset the
            // cache so the next call retries instead of replaying the rejection.
            readyPromise = null;
            throw e;
        });
    }
    return readyPromise;
};

export const renderPdfToShapes = async (
    file: File,
    opts: { logicalCanvasWidth: number; generateId: () => string; onProgress: (message: string) => void }
): Promise<{ shapes: Shape[]; pageHeight: number; pageCount: number }> => {
    opts.onProgress('Loading PDF...');
    const pdfjsLib = await ensurePdfReady();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const newShapes: Shape[] = [];
    let firstPageHeight = 0;

    for (let i = 1; i <= numPages; i++) {
        opts.onProgress(`Processing page ${i} of ${numPages}...`);
        // Yield to main thread to allow UI update
        await new Promise(resolve => setTimeout(resolve, 0));

        const page = await pdf.getPage(i);
        // Use a higher scale for better resolution, can be adjusted
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = { canvasContext: context, viewport: viewport };
        await page.render(renderContext).promise;
        const imgUrl = canvas.toDataURL('image/png');

        const pageIndex = i - 1;
        const centerX = opts.logicalCanvasWidth / 2;

        // NEW: Fit to 80% of logical width while maintaining aspect ratio
        const targetWidth = opts.logicalCanvasWidth * 0.8;
        const aspectRatio = viewport.height / viewport.width;
        const displayWidth = targetWidth;
        const displayHeight = targetWidth * aspectRatio;

        // Synchronize editor page height with PDF page height on the first page
        if (i === 1) {
            firstPageHeight = displayHeight;
        }

        // Use the calculated displayHeight for consistent positioning
        const pageTopY = pageIndex * displayHeight;
        const pageCenterY = pageTopY + (displayHeight / 2);

        const shapeId = opts.generateId();

        const newShape = createImageShape(shapeId, [
            { x: centerX - displayWidth / 2, y: pageCenterY - displayHeight / 2 },
            { x: centerX + displayWidth / 2, y: pageCenterY + displayHeight / 2 }
        ], imgUrl, { isBackground: true });
        newShapes.push(newShape);
    }

    return { shapes: newShapes, pageHeight: firstPageHeight, pageCount: numPages };
};