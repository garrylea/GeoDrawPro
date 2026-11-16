// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// Keep the loader permanently pending: the component must stay on its fallback.
vi.mock('../../utils/katexLoader', () => ({
    getKatexSync: () => null,
    subscribeKatex: () => () => {},
    loadKatex: () => new Promise(() => {}),
}));

import { LatexText } from './LatexText';

describe('LatexText', () => {
    it('shows the raw text while KaTeX is still loading', () => {
        const { container } = render(
            <svg>
                <LatexText text="$x^2$" formula="x^2" x={10} y={20} stroke="#123456" fontSize={20} />
            </svg>
        );

        const text = container.querySelector('text');
        expect(text).toBeTruthy();
        expect(text!.textContent).toBe('$x^2$');
        expect(text!.getAttribute('x')).toBe('10');
        expect(text!.getAttribute('y')).toBe('20');
        expect(text!.getAttribute('fill')).toBe('#123456');
        expect(text!.getAttribute('font-size')).toBe('20');
        expect(container.querySelector('foreignObject')).toBeNull();
    });
});
