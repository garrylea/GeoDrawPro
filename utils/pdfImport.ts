import { Shape } from '../types';
import { createImageShape } from './shapeFactory';
// Use explicit paths for pdfjs-dist to ensure Vite resolves them correctly
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

/**
 * PDF import pipeline moved verbatim from Editor.tsx (S5).
 * The two pdfjs import specifiers above must stay byte-identical:
 * Editor.test.tsx mocks these exact modules.
 */

// Initialize PDF worker locally for offline/Electron support
export const initPdfWorker = () => {
    try {
        pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
    } catch (e) {
        console.error("Failed to initialize PDF worker:", e);
    }
};

export const renderPdfToShapes = async (
    file: File,
    opts: { logicalCanvasWidth: number; generateId: () => string; onProgress: (message: string) => void }
): Promise<{ shapes: Shape[]; pageHeight: number; pageCount: number }> => {
    opts.onProgress('Loading PDF...');
    const arrayBuffer = await file.arrayBuffer();
    // Use the explicitly imported pdfjsLib
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