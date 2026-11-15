// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElectronBridge } from './useElectronBridge';
import { isElectron } from '../utils/exportUtils';
import { makeShape } from '../test/componentHelpers';
import { Shape, ShapeType } from '../types';

vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return { ...actual, isElectron: vi.fn(() => true) };
});

type Handler = (...args: any[]) => any;

const shape = makeShape('s1', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);

let handlers: Map<string, Handler>;
let ipcRenderer: { send: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
let fs: { existsSync: ReturnType<typeof vi.fn>; readFileSync: ReturnType<typeof vi.fn> };
let requireMock: ReturnType<typeof vi.fn>;
let persistProject: Mock<(shapes: Shape[]) => Promise<boolean>>;
let handleFileLoad: Mock<(content: string, filePath?: string | null) => void>;
let isDirtyRef: { current: boolean };
let shapesRef: { current: Shape[] };

const setup = () => renderHook(() => useElectronBridge({ persistProject, handleFileLoad, isDirtyRef, shapesRef }));

beforeEach(() => {
    handlers = new Map();
    ipcRenderer = {
        send: vi.fn(),
        on: vi.fn((channel: string, fn: Handler) => { handlers.set(channel, fn); }),
        removeListener: vi.fn(),
    };
    fs = {
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => '[{"id":"loaded"}]'),
    };
    requireMock = vi.fn((mod: string) => {
        if (mod === 'electron') return { ipcRenderer };
        if (mod === 'fs') return fs;
        throw new Error(`unexpected require: ${mod}`);
    });
    (window as any).require = requireMock;
    vi.mocked(isElectron).mockReturnValue(true);
    persistProject = vi.fn(async (_shapes: Shape[]) => true);
    handleFileLoad = vi.fn((_content: string, _filePath?: string | null) => {});
    isDirtyRef = { current: false };
    shapesRef = { current: [shape] };
});
afterEach(() => {
    delete (window as any).require;
    vi.restoreAllMocks();
});

describe('useElectronBridge registration', () => {
    it('registers all four IPC channels when running in Electron', () => {
        setup();
        expect(ipcRenderer.on).toHaveBeenCalledTimes(4);
        for (const channel of ['CHECK_UNSAVED', 'ACTION_SAVE', 'MAIN_PROCESS_LOG', 'OPEN_FILE_FROM_OS']) {
            expect(ipcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function));
        }
    });

    it('does nothing outside Electron', () => {
        vi.mocked(isElectron).mockReturnValue(false);
        setup();
        expect(requireMock).not.toHaveBeenCalled();
        expect(ipcRenderer.on).not.toHaveBeenCalled();
    });

    it('removes every listener with the same handler references on unmount', () => {
        const { unmount } = setup();
        const registered = new Map(handlers);
        unmount();
        expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(4);
        for (const [channel, fn] of registered) {
            expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, fn);
        }
    });
});

describe('useElectronBridge CHECK_UNSAVED', () => {
    it('answers with the dirty flag read at event time', () => {
        setup();
        isDirtyRef.current = true;
        act(() => { handlers.get('CHECK_UNSAVED')!(); });
        expect(ipcRenderer.send).toHaveBeenCalledWith('UNSAVED_CHECK_RESULT', true);
        isDirtyRef.current = false;
        act(() => { handlers.get('CHECK_UNSAVED')!(); });
        expect(ipcRenderer.send).toHaveBeenCalledWith('UNSAVED_CHECK_RESULT', false);
    });
});

describe('useElectronBridge ACTION_SAVE', () => {
    it('persists the latest shapes ref and reports completion on success', async () => {
        setup();
        await act(async () => { await handlers.get('ACTION_SAVE')!(); });
        expect(persistProject).toHaveBeenCalledTimes(1);
        expect(persistProject.mock.calls[0][0]).toBe(shapesRef.current);
        expect(ipcRenderer.send).toHaveBeenCalledWith('SAVE_COMPLETE');
    });

    it('does not report completion when the save fails', async () => {
        persistProject.mockResolvedValue(false);
        setup();
        await act(async () => { await handlers.get('ACTION_SAVE')!(); });
        expect(persistProject).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.send).not.toHaveBeenCalled();
    });
});

describe('useElectronBridge MAIN_PROCESS_LOG', () => {
    it('forwards main-process messages to the console', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        setup();
        act(() => { handlers.get('MAIN_PROCESS_LOG')!(null, 'hello from main'); });
        expect(logSpy).toHaveBeenCalledWith('hello from main');
    });
});

describe('useElectronBridge OPEN_FILE_FROM_OS', () => {
    it('reads an existing file and loads it through handleFileLoad', () => {
        setup();
        act(() => { handlers.get('OPEN_FILE_FROM_OS')!(null, '/docs/a.geo'); });
        expect(fs.existsSync).toHaveBeenCalledWith('/docs/a.geo');
        expect(fs.readFileSync).toHaveBeenCalledWith('/docs/a.geo', 'utf-8');
        expect(handleFileLoad).toHaveBeenCalledWith('[{"id":"loaded"}]', '/docs/a.geo');
    });

    it('ignores files that do not exist', () => {
        fs.existsSync.mockReturnValue(false);
        setup();
        act(() => { handlers.get('OPEN_FILE_FROM_OS')!(null, '/docs/missing.geo'); });
        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(handleFileLoad).not.toHaveBeenCalled();
    });

    it('logs and survives filesystem errors', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fs.readFileSync.mockImplementation(() => { throw new Error('EACCES'); });
        setup();
        expect(() => act(() => { handlers.get('OPEN_FILE_FROM_OS')!(null, '/docs/a.geo'); })).not.toThrow();
        expect(handleFileLoad).not.toHaveBeenCalled();
        expect(errSpy).toHaveBeenCalledWith('Failed to load file from OS:', expect.any(Error));
    });
});