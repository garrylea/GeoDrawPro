// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SolverWindow } from './SolverWindow';

const mockFetch = (response: object, ok = true, status = 200) => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(response),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

const solve = async (problem: string) => {
    render(<SolverWindow />);
    fireEvent.change(screen.getByPlaceholderText('Type your math problem here...'), { target: { value: problem } });
    fireEvent.click(screen.getByTitle('Solve'));
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('SolverWindow', () => {
    it('shows an empty-state hint before any question', () => {
        render(<SolverWindow />);
        expect(screen.getByText('Enter a math problem to get a detailed solution.')).toBeTruthy();
    });

    it('disables Solve while the input is empty', () => {
        render(<SolverWindow />);
        expect(screen.getByTitle('Solve')).toBeDisabled();
        fireEvent.change(screen.getByPlaceholderText('Type your math problem here...'), { target: { value: '   ' } });
        expect(screen.getByTitle('Solve')).toBeDisabled();
    });

    it('posts the prompt to the local solver backend and shows the answer', async () => {
        const fetchMock = mockFetch({ text: 'The area is 6.' });
        await solve('area of 3-4-5 triangle');
        await waitFor(() => expect(screen.getByText('The area is 6.')).toBeTruthy());
        expect(fetchMock).toHaveBeenCalledWith('http://localhost:8888/api/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'area of 3-4-5 triangle' }),
        });
        expect(screen.getByText('area of 3-4-5 triangle')).toBeTruthy();
    });

    it('honors the VITE_API_URL override', async () => {
        vi.stubEnv('VITE_API_URL', 'https://solver.example.com');
        const fetchMock = mockFetch({ text: 'ok' });
        await solve('1+1');
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(fetchMock.mock.calls[0][0]).toBe('https://solver.example.com/api/solve');
    });

    it('submits on Enter but not on Shift+Enter', async () => {
        const fetchMock = mockFetch({ text: 'answer' });
        render(<SolverWindow />);
        const input = screen.getByPlaceholderText('Type your math problem here...');
        fireEvent.change(input, { target: { value: '2+2' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });

    it('shows a thinking indicator and disables Solve while waiting', async () => {
        let resolveFetch: (v: unknown) => void = () => {};
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(res => { resolveFetch = res; })));
        render(<SolverWindow />);
        fireEvent.change(screen.getByPlaceholderText('Type your math problem here...'), { target: { value: 'slow' } });
        fireEvent.click(screen.getByTitle('Solve'));
        expect(screen.getByText('Thinking...')).toBeTruthy();
        expect(screen.getByTitle('Solve')).toBeDisabled();
        resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ text: 'done' }) });
        await waitFor(() => expect(screen.getByText('done')).toBeTruthy());
        expect(screen.queryByText('Thinking...')).toBeNull();
    });

    it('falls back to a placeholder when the server returns no text', async () => {
        mockFetch({});
        await solve('empty reply');
        await waitFor(() => expect(screen.getByText("Sorry, I couldn't generate a solution.")).toBeTruthy());
    });

    it('surfaces the server-provided error message', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockFetch({ error: 'API key missing' }, false, 500);
        await solve('bad request');
        await waitFor(() => expect(screen.getByText('Error: API key missing')).toBeTruthy());
    });

    it('falls back to the status code when the error body has no message', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockFetch({}, false, 503);
        await solve('unavailable');
        await waitFor(() => expect(screen.getByText('Error: Server Error (503)')).toBeTruthy());
    });

    it('reports connection failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
        await solve('offline');
        await waitFor(() => expect(screen.getByText('Error: network down')).toBeTruthy());
    });

    it('clears the conversation with Clear History', async () => {
        mockFetch({ text: 'remembered' });
        await solve('keep me');
        await waitFor(() => expect(screen.getByText('remembered')).toBeTruthy());
        fireEvent.click(screen.getByTitle('Clear History'));
        expect(screen.queryByText('remembered')).toBeNull();
        expect(screen.queryByText('keep me')).toBeNull();
        expect(screen.getByText('Enter a math problem to get a detailed solution.')).toBeTruthy();
    });
});