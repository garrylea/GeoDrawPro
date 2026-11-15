import { useState, useRef, Dispatch, SetStateAction } from 'react';
import { Shape } from '../types';
import { applyAngleEdit } from '../utils/angleEditing';

interface UseInlineEditorsDeps {
    shapes: Shape[];
    setShapes: Dispatch<SetStateAction<Shape[]>>;
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    saveHistory: () => void;
}

/**
 * Inline text and angle editors: overlay state, input refs and their
 * commit/cancel handlers. Moved verbatim from Editor.tsx (S6);
 * commitAngleEdit() is the former Enter branch of the angle input.
 */
export const useInlineEditors = ({ shapes, setShapes, setSelectedIds, saveHistory }: UseInlineEditorsDeps) => {
    const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number; text: string } | null>(null);
    const [angleEditing, setAngleEditing] = useState<{ id: string; index: number; x: number; y: number; value: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const angleInputRef = useRef<HTMLInputElement>(null);

    const finishTextEditing = () => {
        if (textEditing) {
            if (!textEditing.text.trim()) {
                setShapes(prev => prev.filter(s => s.id !== textEditing.id));
            } else {
                setShapes(prev => prev.map(s => s.id === textEditing.id ? { ...s, text: textEditing.text } : s));
            }
            setTextEditing(null);
            setSelectedIds(new Set());
        }
    };

    const cancelTextEditing = () => {
        if (textEditing) {
            const shape = shapes.find(s => s.id === textEditing.id);
            if (shape && !shape.text) setShapes(prev => prev.filter(s => s.id !== textEditing.id));
            setTextEditing(null);
        }
    };

    const commitAngleEdit = () => {
        if (!angleEditing) return;
        const newValue = parseFloat(angleEditing.value);
        if (!isNaN(newValue) && newValue > 0 && newValue < 180) {
            saveHistory();
            const { id, index } = angleEditing;
            setShapes(prev => prev.map(s => s.id !== id ? s : (applyAngleEdit(s, index, newValue) || s)));
            setAngleEditing(null);
        }
    };

    return {
        textEditing, setTextEditing, angleEditing, setAngleEditing,
        inputRef, angleInputRef, finishTextEditing, cancelTextEditing, commitAngleEdit
    };
};