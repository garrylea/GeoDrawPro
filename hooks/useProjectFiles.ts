import { useState, useRef, useEffect, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { Shape, Point, ToolType } from '../types';
import { saveProject } from '../utils/exportUtils';
import { createImageShape } from '../utils/shapeFactory';
import { sanitizeLoadedShapes } from '../utils/mathUtils';
import { LOGICAL_CANVAS_WIDTH } from './useViewport';
import { initPdfWorker, renderPdfToShapes } from '../utils/pdfImport';

interface UseProjectFilesDeps {
    shapes: Shape[];
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    setTool: Dispatch<SetStateAction<ToolType>>;
    saveHistory: () => void;
    clipboard: Shape[];
    isDirty: boolean;
    setIsDirty: Dispatch<SetStateAction<boolean>>;
    currentFilePathRef: MutableRefObject<string | null>;
    canvasWidth: number;
    originY: number;
    pageHeight: number;
    setPageHeight: Dispatch<SetStateAction<number>>;
    setPageCount: Dispatch<SetStateAction<number>>;
    setLockBackground: Dispatch<SetStateAction<boolean>>;
    cursorPosRef: MutableRefObject<Point | null>;
    generateId: () => string;
}

/**
 * Project file I/O: save/load, image/PDF import and clipboard paste.
 * Moved verbatim from Editor.tsx (S5); `canvasSize.width` became the
 * `canvasWidth` input (identical value) — the only dependency-array change.
 * The PDF render pipeline lives in utils/pdfImport.
 */
export const useProjectFiles = ({
    shapes, setShapes, setSelectedIds, setTool, saveHistory, clipboard, isDirty, setIsDirty,
    currentFilePathRef, canvasWidth, originY, pageHeight, setPageHeight, setPageCount,
    setLockBackground, cursorPosRef, generateId
}: UseProjectFilesDeps) => {
    const [loadingState, setLoadingState] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize PDF worker locally for offline/Electron support
    useEffect(() => {
        initPdfWorker();
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const persistProject = useCallback(async (shapesToSave: Shape[], saveAs = false) => {
        const { success, filePath } = await saveProject(shapesToSave, { filePath: currentFilePathRef.current, saveAs });
        if (success) {
            if (filePath) currentFilePathRef.current = filePath;
            setIsDirty(false);
            const name = filePath ? filePath.split(/[\\/]/).pop() : null;
            setSaveMessage(name ? `已保存：${name}` : '文件保存成功！');
            setTimeout(() => setSaveMessage(null), 3000);
        }
        return success;
    }, []);

    const handleSave = () => persistProject(shapes);
    const handleSaveAs = () => persistProject(shapes, true);

    const processImageFile = useCallback((file: File, position?: Point) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const url = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
                saveHistory();
                const id = generateId();
                const width = img.width; const height = img.height; const maxDim = 300; let finalW = width; let finalH = height;
                if (width > maxDim || height > maxDim) { const ratio = width / height; if (width > height) { finalW = maxDim; finalH = maxDim / ratio; } else { finalH = maxDim; finalW = maxDim * ratio; } }
                const centerX = position ? position.x : canvasWidth / 2; const centerY = position ? position.y : originY;
                const newShape = createImageShape(id, [{x: centerX - finalW/2, y: centerY - finalH/2}, {x: centerX + finalW/2, y: centerY + finalH/2}], url);
                setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setTool(ToolType.SELECT);
            }
            img.src = url;
        };
        reader.readAsDataURL(file);
    }, [canvasWidth, originY, saveHistory]);

    const processPdfFile = useCallback(async (file: File) => {
        try {
            const result = await renderPdfToShapes(file, {
                logicalCanvasWidth: LOGICAL_CANVAS_WIDTH,
                generateId,
                onProgress: (message) => setLoadingState({ active: true, message })
            });
            // 0 means no page rendered; the original only set height inside the first-page branch
            if (result.pageHeight > 0) setPageHeight(result.pageHeight);
            saveHistory();
            // Append new shapes (PDF pages) to existing shapes
            setShapes(prev => [...prev, ...result.shapes]);
            // Ensure canvas is tall enough
            setPageCount(prev => Math.max(prev, result.pageCount));
            setLockBackground(true);
        } catch (err) {
            console.error("Error processing PDF:", err);
            alert("Failed to load PDF file.");
        } finally {
            setLoadingState({ active: false, message: '' });
        }
    }, [canvasWidth, saveHistory]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            let imageFound = false;
            if (e.clipboardData?.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    const item = e.clipboardData.items[i];
                    if (item.type.indexOf('image') !== -1) { const file = item.getAsFile(); if (file) { e.preventDefault(); processImageFile(file, cursorPosRef.current || undefined); imageFound = true; } }
                }
            }
            if (!imageFound && clipboard.length > 0) {
                e.preventDefault(); saveHistory(); const offset = 20; const newShapes: Shape[] = []; const newIds = new Set<string>();
                clipboard.forEach(s => { const newId = generateId(); newIds.add(newId); const newShape = { ...s, id: newId }; if (newShape.points) newShape.points = newShape.points.map(p => ({ x: p.x + offset, y: p.y + offset, p: p.p })); delete newShape.constraint; delete newShape.markerConfig; newShapes.push(newShape); });
                setShapes(prev => [...prev, ...newShapes]); setSelectedIds(newIds); setTool(ToolType.SELECT);
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processImageFile, clipboard, saveHistory]);

    const handleFileLoad = useCallback((content: string, filePath: string | null = null) => {
        try {
            const loadedShapes = JSON.parse(content);
            if (Array.isArray(loadedShapes)) {
                saveHistory();
                const shapesArray = loadedShapes as any[];
                const sanitized: Shape[] = sanitizeLoadedShapes(shapesArray);
                let maxY = 0;
                sanitized.forEach((s: Shape) => { if (s.points) { s.points.forEach((p: Point) => { if(p.y > maxY) maxY = p.y; }); } });
                const requiredPages = Math.ceil(maxY / pageHeight);
                setPageCount(Math.max(1, requiredPages));
                setShapes(sanitized);
                setSelectedIds(new Set());
                setIsDirty(false);
                currentFilePathRef.current = filePath;
            }
        } catch(e) { console.error("Load Failed", e); }
    }, [saveHistory, pageHeight]);

    return { loadingState, saveMessage, fileInputRef, persistProject, handleSave, handleSaveAs, processImageFile, processPdfFile, handleFileLoad };
};