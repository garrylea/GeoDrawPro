/**
 * Lazy KaTeX loader.
 *
 * KaTeX (~272KB JS + fonts/styles) is only needed when a text shape actually
 * contains LaTeX, so it is imported on demand instead of at startup. The
 * module-level promise is shared by every consumer and reset on failure so a
 * later mount can retry instead of replaying the rejection.
 */

export type KatexApi = { renderToString: typeof import('katex').renderToString };

let api: KatexApi | null = null;
let pending: Promise<KatexApi> | null = null;
const listeners = new Set<() => void>();

export const getKatexSync = (): KatexApi | null => api;

export const subscribeKatex = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const loadKatex = (): Promise<KatexApi> => {
    if (api) return Promise.resolve(api);
    if (!pending) {
        pending = (async () => {
            const mod = await import('katex');
            // Styling is required for correct layout, but a CSS failure must not
            // block rendering: unstyled KaTeX HTML is still readable.
            await import('katex/dist/katex.min.css').catch(error => {
                console.warn('KaTeX CSS failed to load:', error);
            });
            const candidate = mod as unknown as { default?: KatexApi } & KatexApi;
            api = candidate.default ?? candidate;
            [...listeners].forEach(listener => listener());
            return api;
        })().catch(error => {
            pending = null;
            throw error;
        });
    }
    return pending;
};
