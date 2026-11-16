// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeApi = {
    renderToString: vi.fn(() => '<span class="katex">x</span>'),
};

describe('katexLoader', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('katex', () => ({ default: fakeApi }));
        vi.doMock('katex/dist/katex.min.css', () => ({}));
    });

    afterEach(() => {
        vi.doUnmock('katex');
        vi.doUnmock('katex/dist/katex.min.css');
        vi.restoreAllMocks();
    });

    it('loads the module once and caches it', async () => {
        const loader = await import('./katexLoader');

        expect(loader.getKatexSync()).toBeNull();
        const first = await loader.loadKatex();
        expect(first.renderToString).toBeTypeOf('function');
        expect(loader.getKatexSync()).toBe(first);
        expect(await loader.loadKatex()).toBe(first);
    });

    it('notifies subscribers once and stops after unsubscribe', async () => {
        const loader = await import('./katexLoader');
        const listener = vi.fn();
        const unsubscribe = loader.subscribeKatex(listener);

        await loader.loadKatex();
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        await loader.loadKatex();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('still resolves when the stylesheet fails to load', async () => {
        vi.doMock('katex/dist/katex.min.css', () => {
            throw new Error('css unavailable');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loader = await import('./katexLoader');

        await expect(loader.loadKatex()).resolves.toBe(fakeApi);
        expect(warn).toHaveBeenCalled();
    });
});
