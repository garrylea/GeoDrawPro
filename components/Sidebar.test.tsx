// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { ToolType } from '../types';
import { TOOL_CONFIG } from '../constants';

describe('Sidebar', () => {
    it('renders a button for every configured tool', () => {
        render(<Sidebar activeTool={ToolType.SELECT} onToolChange={() => {}} />);
        TOOL_CONFIG.forEach(t => {
            expect(screen.getByTitle(t.label)).toBeTruthy();
        });
        expect(screen.getAllByRole('button')).toHaveLength(TOOL_CONFIG.length);
    });

    it('highlights only the active tool', () => {
        render(<Sidebar activeTool={ToolType.LINE} onToolChange={() => {}} />);
        expect(screen.getByTitle('Line (L)').className).toContain('bg-blue-600');
        expect(screen.getByTitle('Select (A)').className).not.toContain('bg-blue-600');
    });

    it('calls onToolChange with the clicked tool id', () => {
        const onToolChange = vi.fn();
        render(<Sidebar activeTool={ToolType.SELECT} onToolChange={onToolChange} />);
        fireEvent.click(screen.getByTitle('Triangle'));
        expect(onToolChange).toHaveBeenCalledWith(ToolType.TRIANGLE);
        fireEvent.click(screen.getByTitle('Compass'));
        expect(onToolChange).toHaveBeenCalledWith(ToolType.COMPASS);
    });

    it('places construction tools after the standard tools', () => {
        render(<Sidebar activeTool={ToolType.SELECT} onToolChange={() => {}} />);
        const titles = screen.getAllByRole('button').map(b => b.getAttribute('title'));
        const construction = ['Ruler (R)', 'Compass', 'Protractor'];
        const lastThree = titles.slice(-3);
        expect(lastThree.sort()).toEqual(construction.sort());
    });
});