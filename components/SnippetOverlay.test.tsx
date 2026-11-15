// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SnippetOverlay } from './SnippetOverlay';

const setupIpc = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const ipcRenderer = {
        on: vi.fn((channel: string, cb: (...args: any[]) => void) => {
            (listeners[channel] = listeners[channel] || []).push(cb);
        }),
        removeListener: vi.fn(),
        send: vi.fn(),
    };
    (window as any).require = vi.fn(() => ({ ipcRenderer }));
    return { ipcRenderer, emit: (channel: string, ...args: any[]) => (listeners[channel] || []).forEach(cb => cb(null, ...args)) };
};

const dragSelection = (container: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.mouseDown(container, { clientX: from.x, clientY: from.y, button: 0 });
    fireEvent.mouseMove(container, { clientX: to.x, clientY: to.y });
    fireEvent.mouseUp(container);
};

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(window, 'focus').mockImplementation(() => {});
});

afterEach(() => {
    delete (window as any).require;
    vi.restoreAllMocks();
});

describe('SnippetOverlay lifecycle', () => {
    it('announces readiness and subscribes to capture signals on mount', () => {
        const { ipcRenderer } = setupIpc();
        render(<SnippetOverlay />);
        expect(ipcRenderer.send).toHaveBeenCalledWith('SNIPPET_READY');
        expect(ipcRenderer.on).toHaveBeenCalledWith('CAPTURE_SCREEN', expect.any(Function));
    });

    it('shows the captured screen when the capture signal arrives', () => {
        const { emit } = setupIpc();
        const { container } = render(<SnippetOverlay />);
        expect(container.querySelector('img')).toBeNull();
        act(() => emit('CAPTURE_SCREEN'));
        const img = container.querySelector('img')!;
        expect(img.getAttribute('src')).toMatch(/^app-screenshot:\/\/current\?t=\d+$/);
    });

    it('closes on Escape', () => {
        const { ipcRenderer } = setupIpc();
        render(<SnippetOverlay />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(ipcRenderer.send).toHaveBeenCalledWith('CLOSE_SNIPPET');
    });

    it('renders without Electron integration in a plain browser', () => {
        render(<SnippetOverlay />);
        expect(screen.getByText('Click and drag to capture')).toBeTruthy();
    });
});

describe('SnippetOverlay selection', () => {
    it('draws a selection box while dragging and offers controls on release', () => {
        setupIpc();
        const { container } = render(<SnippetOverlay />);
        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 10, y: 10 }, { x: 60, y: 50 });
        const box = container.querySelector('.border-2.border-white') as HTMLElement;
        expect(box.style.left).toBe('10px');
        expect(box.style.top).toBe('10px');
        expect(box.style.width).toBe('50px');
        expect(box.style.height).toBe('40px');
        expect(screen.getByTitle('Confirm')).toBeTruthy();
        expect(screen.getByTitle('Cancel')).toBeTruthy();
        expect(screen.getByTitle('Reset')).toBeTruthy();
    });

    it('discards accidental tiny drags', () => {
        setupIpc();
        const { container } = render(<SnippetOverlay />);
        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 10, y: 10 }, { x: 12, y: 12 });
        expect(container.querySelector('.border-2.border-white')).toBeNull();
    });

    it('ignores right-click drags', () => {
        setupIpc();
        const { container } = render(<SnippetOverlay />);
        const overlay = container.firstElementChild as HTMLElement;
        fireEvent.mouseDown(overlay, { clientX: 10, clientY: 10, button: 2 });
        fireEvent.mouseMove(overlay, { clientX: 60, clientY: 50 });
        fireEvent.mouseUp(overlay);
        expect(container.querySelector('.border-2.border-white')).toBeNull();
    });

    it('clears the selection with Reset', () => {
        setupIpc();
        const { container } = render(<SnippetOverlay />);
        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 10, y: 10 }, { x: 60, y: 50 });
        fireEvent.mouseDown(screen.getByTitle('Reset'));
        expect(container.querySelector('.border-2.border-white')).toBeNull();
    });

    it('closes via the Cancel control', () => {
        const { ipcRenderer } = setupIpc();
        const { container } = render(<SnippetOverlay />);
        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 10, y: 10 }, { x: 60, y: 50 });
        fireEvent.mouseDown(screen.getByTitle('Cancel'));
        expect(ipcRenderer.send).toHaveBeenCalledWith('CLOSE_SNIPPET');
    });
});

describe('SnippetOverlay confirm', () => {
    it('copies the high-DPI crop to the clipboard, toasts, then closes', async () => {
        const { ipcRenderer, emit } = setupIpc();
        const drawImage = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
            cb(new Blob(['crop'], { type: 'image/png' }));
        });
        const write = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
        vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });

        const { container } = render(<SnippetOverlay />);
        act(() => emit('CAPTURE_SCREEN'));
        const img = container.querySelector('img')!;
        Object.defineProperty(img, 'naturalWidth', { value: 200 });
        Object.defineProperty(img, 'clientWidth', { value: 100 });
        Object.defineProperty(img, 'naturalHeight', { value: 160 });
        Object.defineProperty(img, 'clientHeight', { value: 80 });

        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 10, y: 10 }, { x: 60, y: 50 });
        fireEvent.mouseDown(screen.getByTitle('Confirm'));

        await waitFor(() => expect(screen.getByText('Copied to Clipboard')).toBeTruthy());
        // 2x retina scale: 50x40 css selection -> 100x80 device crop
        expect(drawImage).toHaveBeenCalledWith(img, 20, 20, 100, 80, 0, 0, 100, 80);
        expect(write).toHaveBeenCalledTimes(1);
        const item = write.mock.calls[0][0][0];
        expect(item.items['image/png']).toBeInstanceOf(Blob);
        await waitFor(() => expect(ipcRenderer.send).toHaveBeenCalledWith('CLOSE_SNIPPET'), { timeout: 2500 });
        vi.unstubAllGlobals();
    });

    it('still closes when the clipboard write fails', async () => {
        const { ipcRenderer, emit } = setupIpc();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => {
            cb(new Blob(['crop'], { type: 'image/png' }));
        });
        Object.defineProperty(navigator, 'clipboard', {
            value: { write: vi.fn().mockRejectedValue(new Error('denied')) },
            configurable: true,
        });
        vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });

        const { container } = render(<SnippetOverlay />);
        act(() => emit('CAPTURE_SCREEN'));
        const img = container.querySelector('img')!;
        Object.defineProperty(img, 'naturalWidth', { value: 100 });
        Object.defineProperty(img, 'clientWidth', { value: 100 });
        Object.defineProperty(img, 'naturalHeight', { value: 100 });
        Object.defineProperty(img, 'clientHeight', { value: 100 });

        const overlay = container.firstElementChild as HTMLElement;
        dragSelection(overlay, { x: 0, y: 0 }, { x: 30, y: 30 });
        fireEvent.mouseDown(screen.getByTitle('Confirm'));

        await waitFor(() => expect(ipcRenderer.send).toHaveBeenCalledWith('CLOSE_SNIPPET'));
        expect(screen.queryByText('Copied to Clipboard')).toBeNull();
        vi.unstubAllGlobals();
    });
});