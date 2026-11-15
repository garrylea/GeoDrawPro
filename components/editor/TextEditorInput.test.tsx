// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject, SetStateAction } from 'react';
import { TextEditorInput } from './TextEditorInput';
import { MATH_SYMBOLS } from '../../constants';

type Editing = { id: string; x: number; y: number; text: string };

const setup = (overrides: Partial<Editing> = {}) => {
    const editing: Editing = { id: 's1', x: 120, y: 80, text: 'hello', ...overrides };
    // Apply updaters synchronously: the onChange updater reads e.target.value
    // lazily, and React restores the controlled input value after dispatch.
    const applied: (Editing | null)[] = [];
    const props = {
        editing,
        setEditing: vi.fn((v: SetStateAction<Editing | null>) => {
            applied.push(typeof v === 'function' ? (v as (p: Editing | null) => Editing | null)(editing) : v);
        }),
        inputRef: { current: null } as RefObject<HTMLInputElement>,
        onFinish: vi.fn(),
        onCancel: vi.fn(),
        strokeColor: '#ff0000',
    };
    render(<TextEditorInput {...props} />);
    return { ...props, applied };
};

describe('TextEditorInput', () => {
    it('shows the editing text in a positioned, stroke-colored input', () => {
        const props = setup();
        const input = screen.getByDisplayValue('hello') as HTMLInputElement;
        expect(input.type).toBe('text');
        expect(input.style.color).toBe('rgb(255, 0, 0)');
        expect(props.inputRef.current).toBe(input);
        const wrapper = input.parentElement!;
        expect(wrapper.style.left).toBe('120px');
        expect(wrapper.style.top).toBe('80px');
        expect(wrapper.style.transform).toBe('translate(0, -50%)');
    });

    it('routes typing through the setEditing updater', () => {
        const props = setup();
        fireEvent.change(screen.getByDisplayValue('hello'), { target: { value: 'hello world' } });
        expect(props.setEditing).toHaveBeenCalledTimes(1);
        expect(props.applied[0]).toEqual({ id: 's1', x: 120, y: 80, text: 'hello world' });
        const updater = props.setEditing.mock.calls[0][0] as (p: Editing | null) => Editing | null;
        expect(updater(null)).toBeNull();
    });

    it('finishes on Enter and cancels on Escape', () => {
        const props = setup();
        const input = screen.getByDisplayValue('hello');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(props.onFinish).toHaveBeenCalledTimes(1);
        expect(props.onCancel).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(props.onCancel).toHaveBeenCalledTimes(1);
        expect(props.onFinish).toHaveBeenCalledTimes(1);
    });

    it('finishes on blur', () => {
        const props = setup();
        fireEvent.blur(screen.getByDisplayValue('hello'));
        expect(props.onFinish).toHaveBeenCalledTimes(1);
    });

    it('appends a math symbol through the setEditing updater on click', () => {
        const props = setup();
        expect(screen.getAllByRole('button')).toHaveLength(MATH_SYMBOLS.length);
        fireEvent.click(screen.getByText('π'));
        expect(props.setEditing).toHaveBeenCalledTimes(1);
        expect(props.applied[0]).toEqual({ id: 's1', x: 120, y: 80, text: 'helloπ' });
        const updater = props.setEditing.mock.calls[0][0] as (p: Editing | null) => Editing | null;
        expect(updater(null)).toBeNull();
    });

    it('prevents default on symbol mousedown so the input keeps focus', () => {
        setup();
        // fireEvent returns false when the handler called preventDefault.
        expect(fireEvent.mouseDown(screen.getByText('π'))).toBe(false);
    });
});