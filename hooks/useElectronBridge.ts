import { useEffect, MutableRefObject } from 'react';
import { Shape } from '../types';
import { isElectron } from '../utils/exportUtils';

interface UseElectronBridgeDeps {
    persistProject: (shapes: Shape[], saveAs?: boolean) => Promise<boolean>;
    handleFileLoad: (content: string, filePath?: string | null) => void;
    isDirtyRef: MutableRefObject<boolean>;
    shapesRef: MutableRefObject<Shape[]>;
}

/**
 * Electron IPC bridge: unsaved-check / save / main-process log and
 * open-file-from-OS. Moved verbatim from Editor.tsx (S5); pure effects,
 * no return value.
 */
export const useElectronBridge = ({ persistProject, handleFileLoad, isDirtyRef, shapesRef }: UseElectronBridgeDeps) => {
    useEffect(() => {
        if (isElectron()) {
            const { ipcRenderer } = (window as any).require('electron');
            const handleCheckUnsaved = () => { ipcRenderer.send('UNSAVED_CHECK_RESULT', isDirtyRef.current); };
            const handleActionSave = async () => { const success = await persistProject(shapesRef.current); if (success) ipcRenderer.send('SAVE_COMPLETE'); };
            const handleMainLog = (_: any, msg: string) => { console.log(msg); };

            ipcRenderer.on('CHECK_UNSAVED', handleCheckUnsaved);
            ipcRenderer.on('ACTION_SAVE', handleActionSave);
            ipcRenderer.on('MAIN_PROCESS_LOG', handleMainLog);

            return () => {
                ipcRenderer.removeListener('CHECK_UNSAVED', handleCheckUnsaved);
                ipcRenderer.removeListener('ACTION_SAVE', handleActionSave);
                ipcRenderer.removeListener('MAIN_PROCESS_LOG', handleMainLog);
            };
        }
    }, [persistProject]);

    useEffect(() => {
        if (isElectron()) {
            const { ipcRenderer } = (window as any).require('electron');
            const handleOpenFileFromOS = (_: any, filePath: string) => {
                try {
                    const fs = (window as any).require('fs');
                    // Check if file exists
                    if (fs.existsSync(filePath)) {
                        const data = fs.readFileSync(filePath, 'utf-8');
                        handleFileLoad(data, filePath);
                    }
                } catch (e) {
                    console.error("Failed to load file from OS:", e);
                }
            };

            ipcRenderer.on('OPEN_FILE_FROM_OS', handleOpenFileFromOS);
            return () => { ipcRenderer.removeListener('OPEN_FILE_FROM_OS', handleOpenFileFromOS); };
        }
    }, [handleFileLoad]);
};