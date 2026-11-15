import { useState, useRef, useEffect, useCallback } from 'react';
import { Shape, ShapeType } from '../types';
import { removeShapesWithDependents } from '../utils/shapeOperations';

interface UseDocumentDeps {
    setPivotIndex: (v: number | 'center') => void;
    setActiveShapeId: (v: string | null) => void;
}

/**
 * Document state: shapes, undo history, selection, clipboard and dirty tracking.
 * setPivotIndex/setActiveShapeId are supplied by useInteractionSession.
 */
export const useDocument = ({ setPivotIndex, setActiveShapeId }: UseDocumentDeps) => {
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [history, setHistory] = useState<Shape[][]>([]);
    const [selectedIds, _setSelectedIds] = useState<Set<string>>(new Set<string>());
    // Intentional side effect inside the updater: selection drives the rotation pivot (kept verbatim).
    const setSelectedIds = (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
        _setSelectedIds(prev => {
            const next = typeof ids === 'function' ? ids(prev) : ids;
            if (next.size === 1) {
                const id = Array.from(next)[0];
                const s = shapesRef.current.find(shape => shape.id === id);
                if (s && s.type === ShapeType.RULER) {
                    setPivotIndex(0); // Default to Start for Ruler
                } else {
                    setPivotIndex('center');
                }
            } else {
                setPivotIndex('center');
            }
            return next;
        });
    };
    const [clipboard, setClipboard] = useState<Shape[]>([]);

    const [isDirty, setIsDirty] = useState(false);
    const isDirtyRef = useRef(isDirty);
    const shapesRef = useRef(shapes);
    const currentFilePathRef = useRef<string | null>(null);

    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
    useEffect(() => { shapesRef.current = shapes; }, [shapes]);

    const saveHistory = useCallback(() => {
        setHistory(prev => [...prev, shapes]);
        setIsDirty(true);
    }, [shapes]);

    const undo = () => { if (history.length === 0) return; const previousState = history[history.length - 1]; setHistory(prev => prev.slice(0, -1)); setShapes(previousState); setSelectedIds(new Set<string>()); setActiveShapeId(null); setIsDirty(true); };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return; saveHistory(); const idsToDelete = new Set<string>(Array.from(selectedIds) as string[]);
        setShapes(prev => removeShapesWithDependents(prev, idsToDelete)); setSelectedIds(new Set<string>());
    };

    const clearAll = () => { saveHistory(); setShapes([]); setHistory([]); setSelectedIds(new Set()); };

    return {
        shapes, setShapes, shapesRef, saveHistory, undo,
        history, // read-only: useKeyboardShortcuts lists it in its effect deps
        selectedIds, setSelectedIds, deleteSelected, clearAll,
        clipboard, setClipboard, isDirty, setIsDirty, isDirtyRef, currentFilePathRef
    };
};