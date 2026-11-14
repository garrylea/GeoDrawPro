import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveProject } from './exportUtils';
import { Shape, ShapeType } from '../types';

const invoke = vi.fn();
const shapes: Shape[] = [
    { id: 'p1', type: ShapeType.POINT, points: [{ x: 1, y: 2 }], fill: 'black', stroke: 'none', strokeWidth: 1, rotation: 0 }
];

describe('saveProject', () => {
    beforeEach(() => {
        invoke.mockReset();
        (globalThis as any).alert = vi.fn();
        (globalThis as any).window = {
            process: { type: 'renderer' },
            require: (mod: string) => {
                if (mod === 'electron') return { ipcRenderer: { invoke } };
                throw new Error(`Unexpected require: ${mod}`);
            }
        };
    });

    it('asks for a location on the first save and reports the chosen path', async () => {
        invoke.mockResolvedValue({ success: true, filePath: '/tmp/board.geo' });

        const result = await saveProject(shapes);

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke.mock.calls[0][0]).toBe('save-dialog');
        expect(result).toEqual({ success: true, filePath: '/tmp/board.geo' });
    });

    it('writes straight to the known file on later saves without a dialog', async () => {
        invoke.mockResolvedValue({ success: true, filePath: '/tmp/board.geo' });

        const result = await saveProject(shapes, { filePath: '/tmp/board.geo' });

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke.mock.calls[0][0]).toBe('save-file');
        expect(invoke.mock.calls[0][2]).toBe('/tmp/board.geo');
        expect(JSON.parse(invoke.mock.calls[0][1])).toEqual(shapes);
        expect(result).toEqual({ success: true, filePath: '/tmp/board.geo' });
    });

    it('asks for a new location when saving as, suggesting the current file', async () => {
        invoke.mockResolvedValue({ success: true, filePath: '/tmp/copy.geo' });

        const result = await saveProject(shapes, { filePath: '/tmp/board.geo', saveAs: true });

        expect(invoke.mock.calls[0][0]).toBe('save-dialog');
        expect(invoke.mock.calls[0][2]).toBe('/tmp/board.geo');
        expect(result).toEqual({ success: true, filePath: '/tmp/copy.geo' });
    });

    it('reports failure when the dialog is cancelled', async () => {
        invoke.mockResolvedValue({ success: false });

        const result = await saveProject(shapes);

        expect(result.success).toBe(false);
    });

    it('reports failure when writing to the known file fails', async () => {
        invoke.mockResolvedValue({ success: false, error: 'EACCES' });

        const result = await saveProject(shapes, { filePath: '/tmp/board.geo' });

        expect(result.success).toBe(false);
        expect((globalThis as any).alert).toHaveBeenCalled();
    });
});