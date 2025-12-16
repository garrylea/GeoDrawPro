
import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';

export const SnippetOverlay = () => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [selection, setSelection] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Helper to log to main process terminal and console
    const log = (msg: string, ...args: any[]) => {
        // Log to the overlay's devtools
        console.log(`[SnippetOverlay] ${msg}`, ...args);
        
        // Log to the terminal via IPC
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
        
        // Aggressively request focus
        window.focus();
        if (containerRef.current) containerRef.current.focus();

        if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            
            // Listen for screenshot signal
            ipcRenderer.on('CAPTURE_SCREEN', () => {
                log('EVENT RECEIVED: CAPTURE_SCREEN');
                // Use a timestamp to bust cache
                const url = `app-screenshot://current?t=${Date.now()}`;
                setImageSrc(url);
                setSelection(null);
                setIsMouseDown(false);
                // Refocus again when image arrives
                window.focus();
            });

            // Global ESC key handler (Escape Route)
            const handleGlobalKeyDown = (e: KeyboardEvent) => {
                log(`Key Pressed: ${e.code} (${e.key})`);
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleClose();
                }
            };
            
            window.addEventListener('keydown', handleGlobalKeyDown);

            // Notify main process we are ready (optional but good for sync)
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

    const playShutterSound = async () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            const bufferSize = ctx.sampleRate * 0.1; 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1000;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start();
        } catch (e) {
            console.error("Audio error", e);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        log('MOUSE DOWN DETECTED', { x: e.clientX, y: e.clientY });

        if (!imageSrc) {
            log('Mouse down ignored: No image source yet');
            return;
        }
        if (e.button !== 0) return;
        
        setIsMouseDown(true);
        setSelection({
            start: { x: e.clientX, y: e.clientY },
            current: { x: e.clientX, y: e.clientY }
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isMouseDown || !selection) return;
        // Optional: throttle logs
        // log('Mouse Move', { x: e.clientX, y: e.clientY }); 
        setSelection(prev => ({
            ...prev!,
            current: { x: e.clientX, y: e.clientY }
        }));
    };

    const handleMouseUp = async () => {
        log('MOUSE UP DETECTED');
        setIsMouseDown(false);
        if (!selection || !imageSrc) return;
        
        const x = Math.min(selection.start.x, selection.current.x);
        const y = Math.min(selection.start.y, selection.current.y);
        const w = Math.abs(selection.current.x - selection.start.x);
        const h = Math.abs(selection.current.y - selection.start.y);

        if (w < 5 || h < 5) {
             log('Selection too small, ignoring');
             setSelection(null);
             return;
        }

        log(`Processing Capture: x=${x} y=${y} w=${w} h=${h}`);
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageSrc;
        
        try {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
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
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            await playShutterSound();
                            log('SUCCESS: Copied to clipboard');
                            
                            if ((window as any).require) {
                                const { ipcRenderer } = (window as any).require('electron');
                                setTimeout(() => {
                                    ipcRenderer.send('CLOSE_SNIPPET');
                                    setSelection(null); 
                                }, 300);
                            }
                        } catch (err) {
                            console.error('Clipboard failed', err);
                            log('ERROR: Clipboard write failed', err);
                        }
                    }
                }, 'image/png');
            }
        } catch (e) {
            log('ERROR: Processing image capture', e);
        }
    };

    // If waiting for image, show loader
    if (!imageSrc) return (
        <div className="fixed inset-0 bg-black/10 flex items-center justify-center select-none z-50 pointer-events-auto">
            <div className="bg-white text-slate-800 px-4 py-2 rounded shadow-lg flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                Initializing...
            </div>
            <button 
                onClick={handleClose}
                className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg z-[60] cursor-pointer"
            >
                <X size={24} />
            </button>
        </div>
    );

    // Geometry for UI
    let selectionStyle = {};
    let topRectH = 0, bottomRectTop = 0, bottomRectH = 0, leftRectTop = 0, leftRectH = 0, leftRectW = 0, rightRectLeft = 0, rightRectW = 0;

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
    }

    return (
        <div 
            ref={containerRef}
            tabIndex={0}
            className="fixed inset-0 cursor-crosshair select-none z-50 overflow-hidden w-screen h-screen pointer-events-auto outline-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ 
                userSelect: 'none', 
                WebkitUserSelect: 'none',
                backgroundColor: 'rgba(0, 0, 0, 0)' // Fully transparent, relying on index.html body pointer-events for clicks
            }}
        >
            {/* Background Image */}
            <img 
                src={imageSrc} 
                className="absolute inset-0 w-full h-full object-fill pointer-events-none" 
                onLoad={handleImageLoad}
            />

            {/* Safety Close Button (Top Right) */}
            <button 
                onMouseDown={(e) => { e.stopPropagation(); handleClose(); }}
                className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-full shadow-lg z-[60] cursor-pointer pointer-events-auto flex items-center gap-2 px-4 transition-colors group"
                title="Press ESC to close"
            >
                <X size={18} />
                <span className="text-sm font-medium">Close (Esc)</span>
            </button>

            {selection ? (
                <>
                    {/* Darkened areas outside selection */}
                    <div className="absolute left-0 top-0 w-full bg-black bg-opacity-40 pointer-events-none" style={{ height: topRectH }} />
                    <div className="absolute left-0 w-full bg-black bg-opacity-40 pointer-events-none" style={{ top: bottomRectTop, height: bottomRectH }} />
                    <div className="absolute left-0 bg-black bg-opacity-40 pointer-events-none" style={{ top: leftRectTop, height: leftRectH, width: leftRectW }} />
                    <div className="absolute right-0 bg-black bg-opacity-40 pointer-events-none" style={{ top: leftRectTop, height: leftRectH, width: rightRectW }} />
                    
                    {/* Selection Border */}
                    <div className="absolute border-2 border-blue-400 shadow-sm pointer-events-none box-border" style={selectionStyle}></div>
                    
                    {/* Size Label */}
                    <div className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded shadow pointer-events-none" style={{ 
                        left: Math.max(0, Math.min(selection.start.x, selection.current.x)), 
                        top: Math.max(0, Math.min(selection.start.y, selection.current.y) - 30) 
                    }}>
                        {Math.round(Math.abs(selection.current.x - selection.start.x))} x {Math.round(Math.abs(selection.current.y - selection.start.y))}
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 bg-black bg-opacity-10 pointer-events-none" />
            )}
        </div>
    );
};
