// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Editor } from '../components/Editor';
import { ProfilingHarness, createCommitCollector } from '../components/editor/ProfilingHarness';
import { stubPointerCapture } from './componentHelpers';

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({ GlobalWorkerOptions: { workerPort: null }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({ default: class MockPdfWorker {} }));
vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return {
        ...actual,
        saveProject: vi.fn(), loadProject: vi.fn(), getLocalFilePath: vi.fn(() => null),
        isElectron: vi.fn(() => false), exportCanvas: vi.fn(), exportAppIcon: vi.fn(),
    };
});

beforeEach(() => {
    stubPointerCapture();
    window.history.replaceState({}, '', '/?stress=200');
});

describe('createCommitCollector', () => {
    it('aggregates commits and resets', () => {
        const c = createCommitCollector();
        c.onRender('editor', 'update', 3);
        c.onRender('editor', 'update', 5);
        expect(c.summary()).toEqual({ commits: 2, totalMs: 8, avgMs: 4 });
        c.reset();
        expect(c.summary()).toEqual({ commits: 0, totalMs: 0, avgMs: 0 });
    });
});

describe('perf sweep', () => {
    it('LINE-idle sweep commits once per move and reports stats', async () => {
        const utils = render(<ProfilingHarness><Editor /></ProfilingHarness>);
        expect(utils.container.querySelectorAll('g[data-shape-id]').length).toBe(200);
        // Run the sweep OUTSIDE React's act scope. Inside a single act() React 18 queues
        // every commit until act exits, so the collector would read 0 and the 100 moves
        // would batch into 1 commit. With the act flag off, each pointermove flushes via
        // the normal scheduler during the 16ms gaps — one commit per move, as in a browser.
        const g = globalThis as any;
        const prevActEnv = g.IS_REACT_ACT_ENVIRONMENT;
        g.IS_REACT_ACT_ENVIRONMENT = false;
        let stats: any;
        try {
            stats = await (window as any).__runSweep();
        } finally {
            g.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
        }
        console.info('[perfSweep]', JSON.stringify(stats));
        expect(stats.commits).toBeGreaterThanOrEqual(90);
        expect(stats.commits).toBeLessThanOrEqual(120);
        expect(stats.avgMs).toBeGreaterThan(0);
    }, 15000);
});