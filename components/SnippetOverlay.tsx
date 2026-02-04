import React, { useEffect, useState, useRef } from 'react';
import { X, Check, RefreshCw } from 'lucide-react';

export const SnippetOverlay = () => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [selection, setSelection] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    
    // Helper to log to main process terminal and console
    const log = (msg: string, ...args: any[]) => {
        console.log(`[SnippetOverlay] ${msg}`, ...args);
        if ((window as any).require) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                const argStr = args.length ? JSON.stringify(args) : '';
                ipcRenderer.send('RENDERER_LOG', `${msg} ${argStr}`);
            } catch (e) { /* ignore */ }
        }
    };

    const handleClose = () => {
        log('Manual close triggered via UI/ESC');
        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('CLOSE_SNIPPET');
        }
    };

    useEffect(() => {
        log('COMPONENT MOUNTED - Waiting for Capture Signal');
        window.focus();
        if (containerRef.current) containerRef.current.focus();

        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            
            const handleCapture = (_: any, _data: any) => {
                log('EVENT RECEIVED: CAPTURE_SCREEN');
                // Force reload image by adding timestamp to url to bypass cache
                const url = `app-screenshot://current?t=${Date.now()}`;
                setImageSrc(url);
                setSelection(null);
                setIsMouseDown(false);
                setShowToast(false);
                setTimeout(() => window.focus(), 50);
            };

            ipcRenderer.on('CAPTURE_SCREEN', handleCapture);

            const handleGlobalKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClose();
                }
            };
            
            window.addEventListener('keydown', handleGlobalKeyDown);
            ipcRenderer.send('SNIPPET_READY');

            return () => {
                ipcRenderer.removeListener('CAPTURE_SCREEN', handleCapture);
                window.removeEventListener('keydown', handleGlobalKeyDown);
            }
        }
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.snippet-controls')) return;
        e.preventDefault();
        // Only allow left click
        if (e.button !== 0) return;
        
        setIsMouseDown(true);
        setSelection({
            start: { x: e.clientX, y: e.clientY },
            current: { x: e.clientX, y: e.clientY }
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isMouseDown || !selection) return;
        setSelection(prev => ({
            ...prev!,
            current: { x: e.clientX, y: e.clientY }
        }));
    };

    const handleMouseUp = () => {
        if (!isMouseDown) return;
        setIsMouseDown(false);
        if (selection) {
             const w = Math.abs(selection.current.x - selection.start.x);
             const h = Math.abs(selection.current.y - selection.start.y);
             // Prevent tiny accidental clicks
             if (w < 5 || h < 5) setSelection(null);
        }
    };

    const handleReselect = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelection(null);
    };

    const handleConfirm = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selection || !imageSrc || !imgRef.current) return;

        try {
            const img = imgRef.current;
            const canvas = document.createElement('canvas');
            
            // Coordinates in CSS pixels (relative to viewport)
            const selX = Math.min(selection.start.x, selection.current.x);
            const selY = Math.min(selection.start.y, selection.current.y);
            const selW = Math.abs(selection.current.x - selection.start.x);
            const selH = Math.abs(selection.current.y - selection.start.y);

            // High DPI scaling calculation:
            // img.naturalWidth is the actual screenshot resolution (e.g. 2x on Retina)
            // img.clientWidth is the window size in CSS pixels
            const scaleX = img.naturalWidth / img.clientWidth;
            const scaleY = img.naturalHeight / img.clientHeight;

            // Set canvas to match the high-res crop size
            canvas.width = selW * scaleX;
            canvas.height = selH * scaleY;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Draw crop using source coordinates
                ctx.drawImage(
                    img, 
                    selX * scaleX, selY * scaleY, selW * scaleX, selH * scaleY, // Source Rect
                    0, 0, canvas.width, canvas.height // Dest Rect
                );
                
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        try {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            setShowToast(true);
                            setTimeout(() => handleClose(), 1500);
                        } catch (err) {
                            console.error('Clipboard write failed', err);
                            // Even if clipboard fails, close overlay
                            handleClose();
                        }
                    }
                }, 'image/png');
            }
        } catch (error) {
            console.error(error);
            handleClose();
        }
    };

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 z-[9999] overflow-hidden bg-black/20 cursor-crosshair select-none outline-none" 
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            tabIndex={-1}
        >
            {imageSrc && (
                <img 
                    ref={imgRef}
                    src={imageSrc} 
                    alt="Screen Capture" 
                    className="absolute inset-0 w-full h-full object-fill pointer-events-none" 
                />
            )}

            {/* Selection Box & Darkened Surroundings Effect (Simulated via box-shadow) */}
            {selection && (
                <div 
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none"
                    style={{
                        left: Math.min(selection.start.x, selection.current.x),
                        top: Math.min(selection.start.y, selection.current.y),
                        width: Math.abs(selection.current.x - selection.start.x),
                        height: Math.abs(selection.current.y - selection.start.y),
                    }}
                >
                    {/* Floating Controls */}
                    <div className="absolute -bottom-14 right-0 flex gap-3 pointer-events-auto snippet-controls">
                        <button onMouseDown={handleReselect} className="bg-white text-slate-700 p-2.5 rounded-full shadow-lg hover:bg-slate-100 transition-transform hover:scale-105" title="Reset"><RefreshCw size={20} /></button>
                        <button onMouseDown={handleClose} className="bg-white text-red-600 p-2.5 rounded-full shadow-lg hover:bg-red-50 transition-transform hover:scale-105" title="Cancel"><X size={20} /></button>
                        <button onMouseDown={handleConfirm} className="bg-blue-600 text-white p-2.5 rounded-full shadow-lg hover:bg-blue-700 transition-transform hover:scale-105" title="Confirm"><Check size={20} /></button>
                    </div>
                </div>
            )}
            
            {/* Helper Text */}
            {!selection && !showToast && (
                <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/60 text-white px-5 py-2 rounded-full text-sm font-medium pointer-events-none backdrop-blur-sm border border-white/20 shadow-lg">
                    Click and drag to capture
                </div>
            )}

            {/* Success Toast */}
            {showToast && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-2 animate-bounce z-50 font-bold border border-emerald-400">
                    <Check size={22} /> Copied to Clipboard
                </div>
            )}
        </div>
    );
};