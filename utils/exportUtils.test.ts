import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveProject, loadProject, exportAppIcon } from './exportUtils';
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

describe('loadProject', () => {
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

    it('rejects when the open dialog is canceled instead of hanging forever', async () => {
        invoke.mockResolvedValue({ canceled: true });

        await expect(loadProject()).rejects.toThrow('canceled');
    }, 1500);

    it('resolves the shapes returned by the open dialog', async () => {
        invoke.mockResolvedValue({ data: JSON.stringify(shapes) });

        await expect(loadProject()).resolves.toEqual(shapes);
        expect(invoke.mock.calls[0][0]).toBe('open-dialog');
    });

    it('rejects when the open dialog reports an error', async () => {
        invoke.mockResolvedValue({ error: 'EACCES' });

        await expect(loadProject()).rejects.toThrow('EACCES');
    });

    it('rejects when the dialog data is not valid JSON', async () => {
        invoke.mockResolvedValue({ data: '{not json' });

        await expect(loadProject()).rejects.toThrow();
    });

    it('rejects when the dialog data is not an array', async () => {
        invoke.mockResolvedValue({ data: '{"shapes":[]}' });

        await expect(loadProject()).rejects.toThrow('Invalid file format');
    });
});

describe('loadProject file branch', () => {
    class FakeFileReader {
        onload: ((e: { target: { result: string } }) => void) | null = null;
        readAsText(file: File) {
            file.text().then(result => this.onload?.({ target: { result } }));
        }
    }

    const geoFile = (content: string) => new File([content], 'board.geo');

    beforeEach(() => {
        invoke.mockReset();
        vi.stubGlobal('FileReader', FakeFileReader);
        vi.stubGlobal('window', {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads shapes from a .geo file', async () => {
        await expect(loadProject(geoFile(JSON.stringify(shapes)))).resolves.toEqual(shapes);
    });

    it('rejects when the file is not valid JSON', async () => {
        await expect(loadProject(geoFile('{not json'))).rejects.toThrow();
    });

    it('rejects when the file does not contain an array', async () => {
        await expect(loadProject(geoFile('{"shapes":[]}'))).rejects.toThrow('Invalid file format');
    });

    it('rejects when no file is provided outside Electron', async () => {
        await expect(loadProject()).rejects.toThrow('No file provided');
    });

    it('reads the file directly in Electron without opening a dialog', async () => {
        vi.stubGlobal('window', {
            process: { type: 'renderer' },
            require: (mod: string) => {
                if (mod === 'electron') return { ipcRenderer: { invoke } };
                throw new Error(`Unexpected require: ${mod}`);
            }
        });

        await expect(loadProject(geoFile(JSON.stringify(shapes)))).resolves.toEqual(shapes);
        expect(invoke).not.toHaveBeenCalled();
    });
});

describe('exportAppIcon', () => {
    // Deterministic stand-in for a rendered PNG: 8-byte signature + big-endian size + filler.
    const pngBytes = (size: number) => {
        const bytes = new Uint8Array(12 + size);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        new DataView(bytes.buffer).setUint32(8, size, false);
        return bytes;
    };

    const setupDom = ({ electron = false } = {}) => {
        const blobs: Blob[] = [];
        const downloads: { download: string }[] = [];
        const alertMock = vi.fn();
        vi.stubGlobal('alert', alertMock);
        vi.stubGlobal('window', electron ? {
            process: { type: 'renderer' },
            require: (mod: string) => {
                if (mod === 'electron') return { ipcRenderer: { invoke } };
                throw new Error(`Unexpected require: ${mod}`);
            }
        } : {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            text: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
        }));
        vi.stubGlobal('Image', class {
            onload: (() => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            set src(_v: string) { queueMicrotask(() => this.onload?.()); }
        });
        vi.stubGlobal('document', {
            createElement: (tag: string) => {
                if (tag === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: () => ({ drawImage: () => {} }),
                        toBlob(cb: (b: Blob | null) => void) {
                            cb(new Blob([pngBytes(this.width)], { type: 'image/png' }));
                        },
                    };
                }
                const anchor = { href: '', download: '', click: () => {} };
                downloads.push(anchor);
                return anchor;
            },
            body: { appendChild: () => {}, removeChild: () => {} },
        });
        vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
            blobs.push(blob as Blob);
            return `blob:mock-${blobs.length}`;
        });
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        return { blobs, downloads, alertMock };
    };

    beforeEach(() => {
        invoke.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('packs all six PNG sizes into a downloadable ICO', async () => {
        const { blobs, downloads } = setupDom();

        await exportAppIcon('icon.svg', 'ico');

        expect(downloads[0].download).toBe('app-icon.ico');
        expect(blobs[0].type).toBe('image/x-icon');
        const buf = await blobs[0].arrayBuffer();
        const view = new DataView(buf);
        expect(view.getUint16(0, true)).toBe(0);  // reserved
        expect(view.getUint16(2, true)).toBe(1);  // type ICO
        expect(view.getUint16(4, true)).toBe(6);  // image count

        const sizes = [16, 32, 48, 64, 128, 256];
        let offset = 6 + 16 * sizes.length;
        sizes.forEach((size, i) => {
            const entry = 6 + i * 16;
            const sizeByte = size >= 256 ? 0 : size;
            expect(view.getUint8(entry)).toBe(sizeByte);
            expect(view.getUint8(entry + 1)).toBe(sizeByte);
            expect(view.getUint16(entry + 4, true)).toBe(1);   // color planes
            expect(view.getUint16(entry + 6, true)).toBe(32);  // bits per pixel
            const payload = pngBytes(size);
            expect(view.getUint32(entry + 8, true)).toBe(payload.length);
            expect(view.getUint32(entry + 12, true)).toBe(offset);
            expect(new Uint8Array(buf, offset, payload.length)).toEqual(payload);
            offset += payload.length;
        });
        expect(buf.byteLength).toBe(offset);
    });

    it('packs PNG sizes into an ICNS with big-endian chunks', async () => {
        const { blobs, downloads } = setupDom();

        await exportAppIcon('icon.svg', 'icns');

        expect(downloads[0].download).toBe('app-icon.icns');
        expect(blobs[0].type).toBe('image/x-icns');
        const buf = await blobs[0].arrayBuffer();
        const view = new DataView(buf);
        expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('icns');
        expect(view.getUint32(4, false)).toBe(buf.byteLength);

        const chunks: [number, string][] = [
            [16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'],
            [256, 'ic08'], [512, 'ic09'], [1024, 'ic10'],
        ];
        let offset = 8;
        for (const [size, type] of chunks) {
            expect(String.fromCharCode(...new Uint8Array(buf, offset, 4))).toBe(type);
            const payload = pngBytes(size);
            const chunkLength = view.getUint32(offset + 4, false);
            expect(chunkLength).toBe(payload.length + 8);
            expect(new Uint8Array(buf, offset + 8, payload.length)).toEqual(payload);
            offset += chunkLength;
        }
        expect(offset).toBe(buf.byteLength);
    });

    it('downloads a single 512px PNG for the Linux format', async () => {
        const { blobs, downloads } = setupDom();

        await exportAppIcon('icon.svg', 'png');

        expect(downloads[0].download).toBe('app-icon-linux.png');
        expect(blobs[0].type).toBe('image/png');
        const buf = await blobs[0].arrayBuffer();
        expect(new Uint8Array(buf)).toEqual(pngBytes(512));
    });

    it('serializes an SVG element source instead of fetching', async () => {
        const { blobs, downloads } = setupDom();
        vi.stubGlobal('XMLSerializer', class {
            serializeToString() { return '<svg xmlns="http://www.w3.org/2000/svg"/>'; }
        });

        await exportAppIcon({} as SVGSVGElement, 'png');

        expect(fetch).not.toHaveBeenCalled();
        expect(downloads[0].download).toBe('app-icon-linux.png');
        expect(blobs).toHaveLength(1);
    });

    it('sends base64 icons over IPC in Electron instead of downloading', async () => {
        const { blobs } = setupDom({ electron: true });
        invoke.mockResolvedValue({});

        await exportAppIcon('icon.svg', 'ico');

        expect(blobs).toHaveLength(0);
        expect(invoke).toHaveBeenCalledTimes(1);
        const [channel, payload] = invoke.mock.calls[0];
        expect(channel).toBe('EXPORT_APP_ICON');
        expect(payload.format).toBe('ico');
        expect(payload.icons).toEqual([16, 32, 48, 64, 128, 256].map(size => ({
            size,
            base64: Buffer.from(pngBytes(size)).toString('base64'),
        })));
    });

    it('alerts and downloads nothing when the SVG source cannot be fetched', async () => {
        const { blobs, downloads, alertMock } = setupDom();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        (fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => '' });

        await exportAppIcon('missing.svg', 'ico');

        expect(alertMock).toHaveBeenCalled();
        expect(blobs).toHaveLength(0);
        expect(downloads).toHaveLength(0);
    });
});