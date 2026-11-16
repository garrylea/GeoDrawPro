// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./components/Editor', () => ({ Editor: () => <div>editor-stub</div> }));
vi.mock('./components/SolverWindow', () => ({ SolverWindow: () => <div>solver-stub</div> }));
vi.mock('./components/SnippetOverlay', () => ({ SnippetOverlay: () => <div>snippet-stub</div> }));
vi.mock('./utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./utils/exportUtils')>();
    return { ...actual, isElectron: vi.fn(() => false) };
});

const setMode = (mode: string | null) => {
    window.history.replaceState({}, '', mode ? `/?mode=${mode}` : '/');
};

beforeEach(() => { setMode(null); });

describe('App mode routing', () => {
    it('renders Editor by default', () => {
        render(<App />);
        expect(screen.getByText('editor-stub')).toBeTruthy();
    });
    it('lazy-loads SolverWindow in solver mode', async () => {
        setMode('solver');
        render(<App />);
        expect(screen.queryByText('solver-stub')).toBeNull();
        await waitFor(() => expect(screen.getByText('solver-stub')).toBeTruthy());
    });
    it('lazy-loads SnippetOverlay in snippet mode', async () => {
        setMode('snippet');
        render(<App />);
        expect(screen.queryByText('snippet-stub')).toBeNull();
        await waitFor(() => expect(screen.getByText('snippet-stub')).toBeTruthy());
    });
});
