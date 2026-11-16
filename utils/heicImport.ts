export class HeicImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HeicImportError';
    }
}

const HEIC_EXTENSION = /\.(heic|heif)$/i;

export const isHeicFile = (file: File): boolean =>
    HEIC_EXTENSION.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

export const isImageFile = (file: File): boolean =>
    file.type.startsWith('image/') || isHeicFile(file);

const ERROR_MESSAGES: Record<string, string> = {
    UNSUPPORTED_PLATFORM: '当前平台暂不支持 HEIC 转换（仅 macOS）',
    NOT_FOUND: '找不到 HEIC 文件，请重新拖入',
    CONVERT_FAILED: 'HEIC 转换失败，文件可能已损坏',
};

const FALLBACK_ERROR = 'HEIC 转换失败，文件可能已损坏';

export const convertHeicToPngDataUrl = async (file: File): Promise<string> => {
    const electron = (window as any).require?.('electron');
    if (!electron) throw new HeicImportError('HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG');

    const filePath = (file as any).path;
    if (!filePath) throw new HeicImportError('无法读取文件路径，请改用“打开文件”按钮导入');

    let result: any;
    try {
        result = await electron.ipcRenderer.invoke('CONVERT_HEIC', { filePath });
    } catch {
        throw new HeicImportError(FALLBACK_ERROR);
    }
    if (!result?.success) {
        throw new HeicImportError(ERROR_MESSAGES[result?.code] ?? FALLBACK_ERROR);
    }
    return result.dataUrl;
};
