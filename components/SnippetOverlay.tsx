
import React, { useEffect, useState, useRef } from 'react';
import { X, Check, RefreshCw } from 'lucide-react';

export const SnippetOverlay = () => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [selection, setSelection] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
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
            
            ipcRenderer.on('CAPTURE_SCREEN', () => {
                log('EVENT RECEIVED: CAPTURE_SCREEN');
                const url = `app-screenshot://current?t=${Date.now()}`;
                setImageSrc(url);
                setSelection(null);
                setIsMouseDown(false);
                setShowToast(false); // Reset toast state
                window.focus();
            });

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
                ipcRenderer.removeAllListeners('CAPTURE_SCREEN');
                window.removeEventListener('keydown', handleGlobalKeyDown);
            }
        }
    }, []);

    const handleImageLoad = () => {
        log('Image Element Loaded (onload event)');
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.snippet-controls')) return;
        e.preventDefault();
        if (!imageSrc) return;
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
             if (w < 5 || h < 5) setSelection(null);
        }
    };

    const handleReselect = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelection(null);
    };

    const handleConfirm = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selection || !imageSrc) return;
        
        const x = Math.min(selection.start.x, selection.current.x);
        const y = Math.min(selection.start.y, selection.current.y);
        const w = Math.abs(selection.current.x - selection.start.x);
        const h = Math.abs(selection.current.y - selection.start.y);
        
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageSrc;
        
        try {
            await new Promise((resolve) => { if(img.complete) resolve(true); else img.onload = resolve; });
            const canvas = document.createElement('canvas');
            const scaleX = img.width / window.innerWidth;
            const scaleY = img.height / window.innerHeight;
            canvas.width = w * scaleX;
            canvas.height = h * scaleY;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        try {
                            // 1. Write to clipboard
                            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                            
                            // 2. Show Toast (Visual Feedback)
                            setShowToast(true);

                            // 3. Close window after 2 seconds
                            if ((window as any).require) {
                                const { ipcRenderer } = (window as any).require('electron');
                                setTimeout(() => { 
                                    ipcRenderer.send('CLOSE_SNIPPET'); 
                                    setShowToast(false);
                                }, 2000);
                            }
                        } catch (err) { console.error(err); }
                    }
                }, 'image/png');
            }
        } catch (e) { console.error(e); }
    };

    if (!imageSrc) return (
        <div className="fixed inset-0 bg-black/10 flex items-center justify-center select-none z-50 pointer-events-auto">
            <div className="bg-white text-slate-800 px-4 py-2 rounded shadow-lg flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                Initializing...
            </div>
            <button onClick={handleClose} className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg z-[60] cursor-pointer"><X size={24} /></button>
        </div>
    );

    let selectionStyle = {};
    let topRectH = 0, bottomRectTop = 0, bottomRectH = 0, leftRectTop = 0, leftRectH = 0, leftRectW = 0, rightRectLeft = 0, rightRectW = 0;
    let menuStyle: React.CSSProperties = { display: 'none' };

    if (selection) {
        const x = Math.min(selection.start.x, selection.current.x);
        const y = Math.min(selection.start.y, selection.current.y);
        const w = Math.abs(selection.current.x - selection.start.x);
        const h = Math.abs(selection.current.y - selection.start.y);

        topRectH = y;
        bottomRectTop = y + h;
        bottomRectH = window.innerHeight - (y + h);
        leftRectTop = y;
        leftRectH = h;
        leftRectW = x;
        rightRectLeft = x + w;
        rightRectW = window.innerWidth - (x + w);
        
        selectionStyle = { left: x, top: y, width: w, height: h };

        const MENU_HEIGHT = 44; 
        const MENU_WIDTH = 130; 
        let menuTop = y + h + 10;
        let menuLeft = x + w - MENU_WIDTH;

        if (menuTop + MENU_HEIGHT > window.innerHeight) {
            menuTop = y + h - MENU_HEIGHT - 10;
            if (h < MENU_HEIGHT + 20) menuTop = y - MENU_HEIGHT - 10;
        }
        if (menuLeft < 10) menuLeft = 10;
        if (menuLeft + MENU_WIDTH > window.innerWidth) menuLeft = window.innerWidth - MENU_WIDTH - 10;

        menuStyle = { display: 'flex', position: 'absolute', top: menuTop, left: menuLeft, zIndex: 100 };
    }

    return (
        <div 
            ref={containerRef} tabIndex={0}
            className="fixed inset-0 cursor-crosshair select-none z-50 overflow-hidden w-screen h-screen pointer-events-auto outline-none"
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            style={{ userSelect: 'none', WebkitUserSelect: 'none', backgroundColor: 'rgba(0, 0, 0, 0)' }}
        >
            <img src={imageSrc} className="absolute inset-0 w-full h-full object-fill pointer-events-none" onLoad={handleImageLoad} />

            <button onMouseDown={(e) => { e.stopPropagation(); handleClose(); }} className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-full shadow-lg z-[60] cursor-pointer pointer-events-auto flex items-center gap-2 px-4 transition-colors group border border-slate-700" title="Press ESC to close">
                <X size={18} />
                <span className="text-sm font-medium">Close (Esc)</span>
            </button>
            
            {/* SUCCESS TOAST POPUP */}
            {showToast && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none">
                     <div className="bg-gray-500/80 backdrop-blur-md px-12 py-8 rounded-3xl flex flex-col items-center justify-center shadow-2xl animate-in fade-in zoom-in duration-300">
                        <Check size={64} className="text-white mb-4" strokeWidth={4} />
                        <span className="text-white font-bold text-4xl tracking-wide drop-shadow-md">Copied!</span>
                     </div>
                </div>
            )}

            {selection ? (
                <>
                    <div className="absolute left-0 top-0 w-full bg-black bg-opacity-40 pointer-events-none" style={{ height: topRectH }} />
                    <div className="absolute left-0 w-full bg-black bg-opacity-40 pointer-events-none" style={{ top: bottomRectTop, height: bottomRectH }} />
                    <div className="absolute left-0 bg-black bg-opacity-40 pointer-events-none" style={{ top: leftRectTop, height: leftRectH, width: leftRectW }} />
                    <div className="absolute right-0 bg-black bg-opacity-40 pointer-events-none" style={{ top: leftRectTop, height: leftRectH, width: rightRectW }} />
                    
                    <div className="absolute border-2 border-blue-400 shadow-sm pointer-events-none box-border" style={selectionStyle}></div>
                    
                    {!showToast && (
                        <div className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded shadow pointer-events-none" style={{ left: Math.max(0, Math.min(selection.start.x, selection.current.x)), top: Math.max(0, Math.min(selection.start.y, selection.current.y) - 30) }}>
                            {Math.round(Math.abs(selection.current.x - selection.start.x))} x {Math.round(Math.abs(selection.current.y - selection.start.y))}
                        </div>
                    )}

                    {!isMouseDown && !showToast && (
                        <div className="snippet-controls flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg shadow-xl border border-slate-700 pointer-events-auto" style={menuStyle}>
                             <button onClick={handleReselect} className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Reselect (Retry)"><RefreshCw size={20} /></button>
                             <div className="w-px h-6 bg-slate-600"></div>
                             <button onClick={handleClose} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Cancel (Close)"><X size={20} /></button>
                             <button onClick={handleConfirm} className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-md transition-colors flex items-center justify-center" title="Confirm Capture"><Check size={20} /></button>
                        </div>
                    )}
                </>
            ) : (
                <div className="absolute inset-0 bg-black bg-opacity-10 pointer-events-none" />
            )}
        </div>
    );
};
