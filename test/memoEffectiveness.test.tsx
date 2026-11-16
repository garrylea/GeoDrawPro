// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Editor } from '../components/Editor';
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
vi.mock('../components/PropertiesPanel', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/PropertiesPanel')>();
    const React = await import('react');
    return {
        ...actual,
        PropertiesPanel: React.memo((props: any) => {
            (window as any).__panelRenders = ((window as any).__panelRenders || 0) + 1;
            return React.createElement(actual.PropertiesPanel, props);
        }),
    };
});
vi.mock('../components/TopBar', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/TopBar')>();
    const React = await import('react');
    return {
        ...actual,
        TopBar: React.memo((props: any) => {
            (window as any).__topbarRenders = ((window as any).__topbarRenders || 0) + 1;
            return React.createElement(actual.TopBar, props);
        }),
    };
});
vi.mock('../components/AxisLayer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/AxisLayer')>();
    const React = await import('react');
    return {
        ...actual,
        AxisLayer: React.memo((props: any) => {
            (window as any).__axisRenders = ((window as any).__axisRenders || 0) + 1;
            return React.createElement(actual.AxisLayer, props);
        }),
    };
});

beforeEach(() => {
    stubPointerCapture();
    (window as any).__panelRenders = 0;
    (window as any).__topbarRenders = 0;
    (window as any).__axisRenders = 0;
    window.history.replaceState({}, '', '/');
});

describe('memo effectiveness', () => {
    it('static panels do not re-render during a LINE-idle cursor sweep', () => {
        const utils = render(<Editor />);
        const svg = utils.container.querySelector('svg.touch-none') as SVGSVGElement;
        fireEvent.keyDown(window, { key: 'l' });
        const baseline = {
            panel: (window as any).__panelRenders,
            topbar: (window as any).__topbarRenders,
            axis: (window as any).__axisRenders,
        };
        for (let i = 0; i < 20; i++) {
            fireEvent.pointerMove(svg, { clientX: 100 + i * 10, clientY: 100 + i * 5, pointerId: 1 });
        }
        expect((window as any).__panelRenders).toBe(baseline.panel);
        expect((window as any).__topbarRenders).toBe(baseline.topbar);
        expect((window as any).__axisRenders).toBe(baseline.axis);
    });
});
