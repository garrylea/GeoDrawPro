import { useEffect, Dispatch, SetStateAction } from 'react';
import { ToolType, Shape, ShapeType } from '../types';
import { recalculateMarker } from '../utils/mathUtils';
import { CompassState } from './useInteractionSession';

interface UseKeyboardShortcutsDeps {
    selectedIds: Set<string>;
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    shapes: Shape[];
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    saveHistory: () => void;
    undo: () => void;
    deleteSelected: () => void;
    clipboard: Shape[];
    setClipboard: Dispatch<SetStateAction<Shape[]>>;
    history: Shape[][];
    tool: ToolType;
    setTool: Dispatch<SetStateAction<ToolType>>;
    textEditing: { id: string; x: number; y: number; text: string } | null;
    angleEditing: { id: string; index: number; x: number; y: number; value: string } | null;
    finishTextEditing: () => void;
    cancelTextEditing: () => void;
    activeShapeId: string | null;
    setActiveShapeId: Dispatch<SetStateAction<string | null>>;
    setIsDragging: Dispatch<SetStateAction<boolean>>;
    pickingMirrorMode: boolean;
    setPickingMirrorMode: Dispatch<SetStateAction<boolean>>;
    markingAnglesMode: boolean;
    setMarkingAnglesMode: Dispatch<SetStateAction<boolean>>;
    compassState: CompassState;
    setCompassState: Dispatch<SetStateAction<CompassState>>;
    setCompassPreviewPath: Dispatch<SetStateAction<string | null>>;
    setIsAltPressed: Dispatch<SetStateAction<boolean>>;
    setIsShiftPressed: Dispatch<SetStateAction<boolean>>;
}

/**
 * Global keyboard shortcuts effect. Moved verbatim from Editor.tsx (S6),
 * including the original 12-item dependency array and its quirks:
 * the open-editor early return makes the Escape→cancelTextEditing branch
 * dead code, and Alt/Shift tracking runs before the INPUT guard.
 */
export const useKeyboardShortcuts = ({
    selectedIds, setSelectedIds, shapes, setShapes, saveHistory, undo, deleteSelected,
    clipboard, setClipboard, history, tool, setTool, textEditing, angleEditing,
    finishTextEditing, cancelTextEditing, activeShapeId, setActiveShapeId, setIsDragging,
    pickingMirrorMode, setPickingMirrorMode, markingAnglesMode, setMarkingAnglesMode,
    compassState, setCompassState, setCompassPreviewPath, setIsAltPressed, setIsShiftPressed
}: UseKeyboardShortcutsDeps) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setIsAltPressed(true); if (e.key === 'Shift') setIsShiftPressed(true);
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT') return;
            if (textEditing || angleEditing) return;
            if (selectedIds.size > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault(); const step = 1;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0; const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                saveHistory();
                setShapes(prev => {
                    const movedShapes = prev.map(s => { if (selectedIds.has(s.id)) { if (s.type === ShapeType.FUNCTION_GRAPH) return s; const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p })); return { ...s, points: newPoints }; } return s; });
                    return movedShapes.map(s => { if (s.type === ShapeType.MARKER && s.markerConfig) { const targetId = s.markerConfig.targets[0].shapeId; const updatedTarget = movedShapes.find(ms => ms.id === targetId); if (updatedTarget) return recalculateMarker(s, movedShapes) || s; } return s; });
                }); return;
            }
            if (e.key === 'a' || e.key === 'A') { setTool(ToolType.SELECT); return; }
            if (e.key === 'l' || e.key === 'L') { setTool(ToolType.LINE); return; }
            if (e.key === 'p' || e.key === 'P') { setTool(ToolType.POINT); return; }
            if (e.key === 'f' || e.key === 'F') { setTool(ToolType.FREEHAND); return; }
            if (e.key === 'e' || e.key === 'E') { setTool(ToolType.ERASER); return; }
            if (e.key === 'r' || e.key === 'R') { setTool(ToolType.RULER); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { const selected = shapes.filter(s => selectedIds.has(s.id)); if (selected.length > 0) setClipboard(JSON.parse(JSON.stringify(selected))); return; }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelectedIds(new Set(shapes.map(s => s.id))); return; }
            if (e.key === 'Enter') { finishTextEditing(); return; }
            if (e.key === 'Escape') {
                if (textEditing) { cancelTextEditing(); return; }
                if (pickingMirrorMode) { setPickingMirrorMode(false); return; }
                if (markingAnglesMode) { setMarkingAnglesMode(false); return; }
                if (activeShapeId) { setShapes(prev => prev.filter(s => s.id !== activeShapeId)); setActiveShapeId(null); setIsDragging(false); setTool(ToolType.SELECT); return; }
                if (tool === ToolType.COMPASS && compassState.center) { setCompassState({ center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 }); setCompassPreviewPath(null); return; }
                if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
                if (tool !== ToolType.SELECT) { setTool(ToolType.SELECT); return; }
            }
            if ((e.key === 'Delete' || e.key === 'Backspace')) { deleteSelected(); }
        };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setIsAltPressed(false); if (e.key === 'Shift') setIsShiftPressed(false); };
        window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [selectedIds, textEditing, angleEditing, shapes, history, activeShapeId, pickingMirrorMode, markingAnglesMode, tool, compassState, clipboard, saveHistory]);
};