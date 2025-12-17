
import React, { useEffect, useState, useRef } from 'react';
import { X, Check, RefreshCw } from 'lucide-react';

export const SnippetOverlay = () => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [selection, setSelection] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null); // Reference to the displayed image
    
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
        if (!selection || !imageSrc || !imgRef.current)