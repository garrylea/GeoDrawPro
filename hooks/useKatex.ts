import { useEffect, useSyncExternalStore } from 'react';
import { getKatexSync, loadKatex, subscribeKatex } from '../utils/katexLoader';

/**
 * Subscribes to the shared lazy KaTeX module and triggers the import on mount.
 * Returns null until the chunk (and its stylesheet) has loaded.
 */
export const useKatex = () => {
    const katex = useSyncExternalStore(subscribeKatex, getKatexSync, getKatexSync);

    useEffect(() => {
        loadKatex().catch(() => {
            // Keep the plain-text fallback; a later mount retries the import.
        });
    }, []);

    return katex;
};
