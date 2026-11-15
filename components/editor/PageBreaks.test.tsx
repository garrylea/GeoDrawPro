// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { PageBreaks } from './PageBreaks';
import { renderInSvg } from '../../test/componentHelpers';

describe('PageBreaks', () => {
    it('renders nothing for a single page', () => {
        const { container } = renderInSvg(<PageBreaks pageCount={1} pageHeight={400} width={600} />);
        expect(container.querySelector('svg')!.childElementCount).toBe(0);
    });

    it('renders one dashed break per page boundary with labels', () => {
        const { container } = renderInSvg(<PageBreaks pageCount={3} pageHeight={400} width={600} />);
        const lines = container.querySelectorAll('line[stroke-dasharray="8,8"]');
        expect(lines).toHaveLength(2);
        expect(lines[0].getAttribute('y1')).toBe('400');
        expect(lines[0].getAttribute('y2')).toBe('400');
        expect(lines[1].getAttribute('y1')).toBe('800');
        expect(lines[1].getAttribute('y2')).toBe('800');
        expect(screen.getByText('Page 1 End')).toBeTruthy();
        expect(screen.getByText('Page 2 End')).toBeTruthy();
    });

    it('spans the width prop and offsets labels 5px above each break', () => {
        const { container } = renderInSvg(<PageBreaks pageCount={2} pageHeight={300} width={512} />);
        const line = container.querySelector('line')!;
        expect(line.getAttribute('x1')).toBe('0');
        expect(line.getAttribute('x2')).toBe('512');
        const label = screen.getByText('Page 1 End');
        expect(label.getAttribute('x')).toBe('10');
        expect(label.getAttribute('y')).toBe('295');
    });
});