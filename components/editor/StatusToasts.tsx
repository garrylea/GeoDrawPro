import React from 'react';
import { Plus, Loader2 } from 'lucide-react';

/**
 * Status/prompt chrome moved verbatim from Editor.tsx (S8). Three exports
 * because the pieces live in two different positioning contexts: MirrorBanner
 * and AddPageButton are absolute inside the canvas column, while StatusToasts
 * is root-level. Each must be rendered at its original DOM position.
 */

export const MirrorBanner: React.FC = () => {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium animate-bounce pointer-events-none">Select a line to mirror across</div>
    );
};

interface AddPageButtonProps {
    pageCount: number;
    onAdd: () => void;
}

export const AddPageButton: React.FC<AddPageButtonProps> = ({ pageCount, onAdd }) => {
    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50"><button onClick={onAdd} className="bg-white shadow-lg border border-slate-200 text-slate-600 px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all text-sm font-bold uppercase tracking-wide"><Plus size={18} /> {pageCount > 1 ? `Page ${pageCount} / Add +` : 'Add Page'}</button></div>
    );
};

interface StatusToastsProps {
    loadingState: { active: boolean; message: string; title?: string };
    saveMessage: string | null;
    errorMessage?: string | null;
}

export const StatusToasts: React.FC<StatusToastsProps> = ({ loadingState, saveMessage, errorMessage }) => {
    return (
        <>
            {loadingState.active && (
                <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
                        <Loader2 size={40} className="text-blue-600 animate-spin" />
                        <div className="flex flex-col items-center gap-1">
                            <h3 className="font-bold text-lg text-slate-800">{loadingState.title ?? 'Importing PDF'}</h3>
                            <p className="text-slate-500 text-sm">{loadingState.message}</p>
                        </div>
                    </div>
                </div>
            )}

            {saveMessage && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-emerald-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border border-emerald-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {saveMessage}
                    </div>
                </div>
            )}
            {errorMessage && (
                <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border border-red-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        {errorMessage}
                    </div>
                </div>
            )}
        </>
    );
};