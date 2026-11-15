// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject, SetStateAction } from 'react';
import { AngleEditorInput } from './AngleEditorInput';

type Editing = { id: string; index: number; x: number; y: number; value: string };

const setup = (overrides: Partial<Editing> = {}) => {
    const editing: Editing = { id: 's1', index: 1, x: 40, y: 60, value: '90', ...overrides };
    // Apply updaters synchronously: the onChange updater reads e.target.value
    // lazily, and React restores the controlled input value after dispatch.
    const applied: (Editing | null)[] = [];
    const props = {
        editing,
        setEditing: vi.fn((v: SetStateAction<Editing | null>) => {
            applied.push(typeof v === 'function' ? (v as (p: Editing | null) => Editing | null)(editing) : v);
        }),
        inputRef: { current: null } as RefObject<HTMLInputElement>,
        onCommit: vi.fn(),
    };
    render(<AngleEditorInput {...props} />);
    return { ...props, applied };
};

describe('AngleEditorInput', () => {
    it('shows the angle value in a centered number input', () => {
        const props = setup();
        const input = screen.getByDisplayValue('90') as HTMLInputElement;
        expect(input.type).toBe('number');
        expect(props.inputRef.current).toBe(input);
        const wrapper = input.parentElement!;
        expect(wrapper.style.left).toBe('40px');
        expect(wrapper.style.top).toBe('60px');
        expect(wrapper.style.transform).toBe('translate(-50%, -50%)');
    });

    it('commits on Enter without clearing the editing state', () => {
        const props = setup();
        fireEvent.keyDown(screen.getByDisplayValue('90'), { key: 'Enter' });
        expect(props.onCommit).toHaveBeenCalledTimes(1);
        expect(props.setEditing).not.toHaveBeenCalled();
    });

    it('clears the editing state on Escape', () => {
        const props = setup();
        fireEvent.keyDown(screen.getByDisplayValue('90'), { key: 'Escape' });
        expect(props.setEditing).toHaveBeenCalledWith(null);
        expect(props.onCommit).not.toHaveBeenCalled();
    });

    it('routes typing through the setEditing updater', () => {
        const props = setup();
        fireEvent.change(screen.getByDisplayValue('90'), { target: { value: '45' } });
        expect(props.setEditing).toHaveBeenCalledTimes(1);
        expect(props.applied[0]).toEqual({ id: 's1', index: 1, x: 40, y: 60, value: '45' });
        const updater = props.setEditing.mock.calls[0][0] as (p: Editing | null) => Editing | null;
        expect(updater(null)).toBeNull();
    });

    it('clears the editing state on blur', () => {
        const props = setup();
        fireEvent.blur(screen.getByDisplayValue('90'));
        expect(props.setEditing).toHaveBeenCalledWith(null);
    });
});