// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
    it('keeps the in-progress draft when the parent re-renders with the same value', () => {
        const onChange = vi.fn();
        const { rerender } = render(<NumberInput value={1} onChange={onChange} />);
        const input = screen.getByRole('spinbutton') as HTMLInputElement;

        fireEvent.change(input, { target: { value: '12' } });
        expect(input.value).toBe('12');

        rerender(<NumberInput value={1} onChange={onChange} />);
        expect(input.value).toBe('12');
    });
});
