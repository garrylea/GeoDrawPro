import React, { Dispatch, SetStateAction, RefObject } from 'react';

interface AngleEditorInputProps {
    editing: { id: string; index: number; x: number; y: number; value: string };
    setEditing: Dispatch<SetStateAction<{ id: string; index: number; x: number; y: number; value: string } | null>>;
    inputRef: RefObject<HTMLInputElement>;
    onCommit: () => void;
}

/** Inline angle editor; JSX moved verbatim from Editor.tsx (S8). */
export const AngleEditorInput: React.FC<AngleEditorInputProps> = ({ editing, setEditing, inputRef, onCommit }) => {
    return (
        <div style={{ position: 'absolute', left: editing.x, top: editing.y, transform: 'translate(-50%, -50%)' }}>
            <input ref={inputRef} type="number" value={editing.value} onChange={(e) => setEditing(prev => prev ? ({ ...prev, value: e.target.value }) : null)} onKeyDown={(e) => {
                if (e.key === 'Enter') onCommit();
                if (e.key === 'Escape') setEditing(null);
            }} onBlur={() => setEditing(null)} className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm font-sans shadow-lg outline-none w-20 text-center" autoFocus />
        </div>
    );
};