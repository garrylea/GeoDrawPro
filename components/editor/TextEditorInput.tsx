import React, { Dispatch, SetStateAction, RefObject } from 'react';
import { MATH_SYMBOLS } from '../../constants';

interface TextEditorInputProps {
    editing: { id: string; x: number; y: number; text: string };
    setEditing: Dispatch<SetStateAction<{ id: string; x: number; y: number; text: string } | null>>;
    inputRef: RefObject<HTMLInputElement>;
    onFinish: () => void;
    onCancel: () => void;
    strokeColor: string;
}

/** Inline text editor + math symbol panel; JSX moved verbatim from Editor.tsx (S8). */
export const TextEditorInput: React.FC<TextEditorInputProps> = ({ editing, setEditing, inputRef, onFinish, onCancel, strokeColor }) => {
    return (
        <div style={{ position: 'absolute', left: editing.x, top: editing.y, transform: 'translate(0, -50%)' }}><input ref={inputRef} type="text" value={editing.text} onChange={(e) => setEditing(prev => prev ? ({...prev, text: e.target.value}) : null)} onKeyDown={(e) => { if(e.key === 'Enter') { onFinish(); } if(e.key === 'Escape') { onCancel(); } }} onBlur={onFinish} className="bg-transparent border border-blue-500 rounded px-1 py-0.5 text-lg font-sans outline-none" style={{ color: strokeColor, minWidth: '50px' }} autoFocus /><div className="absolute top-full left-0 bg-white shadow-lg border rounded p-1 flex gap-1 mt-1 z-50 w-64 flex-wrap">{MATH_SYMBOLS.map(sym => <button key={sym} onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(p => p ? ({...p, text: p.text + sym}) : null)} className="hover:bg-gray-100 p-1 rounded text-sm min-w-[20px]">{sym}</button>)}</div></div>
    );
};