// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isHeicFile, isImageFile, convertHeicToPngDataUrl, HeicImportError } from './heicImport';

const makeFile = (name: string, type = '') => new File(['x'], name, { type });

const fileWithPath = (filePath = '/tmp/photo.heic') => {
    const file = makeFile('photo.heic');
    (file as any).path = filePath;
    return file;
};

const stubElectron = (invoke: ReturnType<typeof vi.fn>) => {
    (window as any).require = vi.fn(() => ({ ipcRenderer: { invoke } }));
};

beforeEach(() => {
    delete (window as any).require;
});

afterEach(() => {
    delete (window as any).require;
    vi.restoreAllMocks();
});

describe('isHeicFile', () => {
    it('recognizes .heic and .heif extensions case-insensitively', () => {
        expect(isHeicFile(makeFile('photo.heic'))).toBe(true);
        expect(isHeicFile(makeFile('PHOTO.HEIF'))).toBe(true);
    });

    it('recognizes HEIC MIME types even with an unusual name', () => {
        expect(isHeicFile(makeFile('upload.bin', 'image/heic'))).toBe(true);
        expect(isHeicFile(makeFile('upload.bin', 'image/heif'))).toBe(true);
    });

    it('rejects non-HEIC files', () => {
        expect(isHeicFile(makeFile('photo.png', 'image/png'))).toBe(false);
        expect(isHeicFile(makeFile('project.geo'))).toBe(false);
    });
});

describe('isImageFile', () => {
    it('accepts HEIC files with an empty MIME type (Finder drag)', () => {
        expect(isImageFile(makeFile('photo.heic'))).toBe(true);
    });

    it('accepts ordinary images and rejects project files', () => {
        expect(isImageFile(makeFile('photo.png', 'image/png'))).toBe(true);
        expect(isImageFile(makeFile('project.geo'))).toBe(false);
    });
});

describe('convertHeicToPngDataUrl', () => {
    it('returns the data URL from the main process', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,AAA' });
        stubElectron(invoke);
        await expect(convertHeicToPngDataUrl(fileWithPath())).resolves.toBe('data:image/png;base64,AAA');
        expect(invoke).toHaveBeenCalledWith('CONVERT_HEIC', { filePath: '/tmp/photo.heic' });
    });

    it('rejects when not running inside Electron', async () => {
        await expect(convertHeicToPngDataUrl(makeFile('photo.heic'))).rejects.toThrow(
            'HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG',
        );
    });

    it('rejects when the file has no path', async () => {
        stubElectron(vi.fn());
        await expect(convertHeicToPngDataUrl(makeFile('photo.heic'))).rejects.toThrow(
            '无法读取文件路径，请改用“打开文件”按钮导入',
        );
    });

    it.each([
        ['UNSUPPORTED_PLATFORM', '当前平台暂不支持 HEIC 转换（仅 macOS）'],
        ['NOT_FOUND', '找不到 HEIC 文件，请重新拖入'],
        ['CONVERT_FAILED', 'HEIC 转换失败，文件可能已损坏'],
        ['SOMETHING_NEW', 'HEIC 转换失败，文件可能已损坏'],
    ])('maps %s to user-facing copy', async (code, message) => {
        stubElectron(vi.fn().mockResolvedValue({ success: false, code }));
        await expect(convertHeicToPngDataUrl(fileWithPath())).rejects.toThrow(message);
    });

    it('maps a rejected IPC call to user-facing copy', async () => {
        stubElectron(vi.fn().mockRejectedValue(new Error("Error invoking remote method 'CONVERT_HEIC'")));
        const error = await convertHeicToPngDataUrl(fileWithPath()).catch((e) => e);
        expect(error).toBeInstanceOf(HeicImportError);
        expect(error.message).toBe('HEIC 转换失败，文件可能已损坏');
    });

    it('throws HeicImportError so callers can distinguish user-facing failures', async () => {
        stubElectron(vi.fn().mockResolvedValue({ success: false, code: 'CONVERT_FAILED' }));
        await expect(convertHeicToPngDataUrl(fileWithPath())).rejects.toBeInstanceOf(HeicImportError);
    });
});
