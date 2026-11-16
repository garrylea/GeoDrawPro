import React, { Profiler, useEffect, useRef } from 'react';

export interface SweepStats { commits: number; totalMs: number; avgMs: number; }

export const createCommitCollector = () => {
    let commits = 0;
    let totalMs = 0;
    return {
        onRender: (_id: string, _phase: string, actualDuration: number) => { commits++; totalMs += actualDuration; },
        reset: () => { commits = 0; totalMs = 0; },
        summary: (): SweepStats => ({ commits, totalMs, avgMs: commits > 0 ? totalMs / commits : 0 }),
    };
};

export const ProfilingHarness = ({ children }: { children: React.ReactNode }) => {
    const collectorRef = useRef(createCommitCollector());
    useEffect(() => {
        const w = window as any;
        w.__profileStats = () => collectorRef.current.summary();
        w.__runSweep = async () => {
            const svg = document.querySelector('svg.touch-none');
            if (!svg) throw new Error('editor svg not found');
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
            await new Promise(r => setTimeout(r, 0));
            collectorRef.current.reset();
            const rect = svg.getBoundingClientRect();
            const width = rect.width || 1600;
            const height = rect.height || 800;
            for (let i = 0; i < 100; i++) {
                const clientX = rect.left + width * (i / 100);
                const clientY = rect.top + height * (i / 100);
                const init = { clientX, clientY, pointerId: 1, bubbles: true };
                const evt = typeof PointerEvent !== 'undefined'
                    ? new PointerEvent('pointermove', init)
                    : Object.assign(new MouseEvent('pointermove', init), { pointerId: 1 });
                svg.dispatchEvent(evt);
                await new Promise(r => setTimeout(r, 16));
            }
            const stats = collectorRef.current.summary();
            console.table(stats);
            return stats;
        };
        return () => { delete w.__profileStats; delete w.__runSweep; };
    }, []);
    return <Profiler id="editor" onRender={collectorRef.current.onRender}>{children}</Profiler>;
};
