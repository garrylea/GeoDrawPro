// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from './TopBar';
import { exportCanvas, exportAppIcon } from '../utils/exportUtils';

vi.mock('../utils/exportUtils', () => ({
    exportCanvas: vi.fn(),
    exportAppIcon: vi.fn(),
}));

const setup = (overrides: Partial<React.ComponentProps<typeof TopBar>> = {}) => {
    const props: React.ComponentProps<typeof TopBar> = {
        shapes: [],
        svgRef: { current: null },
        fileInputRef: { current: null },
        undo: vi.fn(),
        deleteSelected: vi.fn(),
        clearAll: vi.fn(),
        selectedIds: new Set<string>(),
        onSave: vi.fn(),
        onSaveAs: vi.fn(),
        zoom: 1,
        onZoomChange: vi.fn(),
        ...overrides,
    };
    render(<TopBar {...props} />);
    return props;
};

beforeEach(() => {
    vi.mocked(exportCanvas).mockClear();
    vi.mocked(exportAppIcon).mockClear();
});

describe('TopBar file actions', () => {
    it('saves through the Save button', () => {
        const props = setup();
        fireEvent.click(screen.getByTitle('Save'));
        expect(props.onSave).toHaveBeenCalledTimes(1);
        expect(props.onSaveAs).not.toHaveBeenCalled();
    });

    it('offers Save As in the save options dropdown and closes it after use', () => {
        const props = setup();
        expect(screen.queryByText('Save As...')).toBeNull();
        fireEvent.click(screen.getByTitle('Save options'));
        fireEvent.click(screen.getByText('Save As...'));
        expect(props.onSaveAs).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Save As...')).toBeNull();
    });

    it('opens the hidden file input through the Open button', () => {
        const click = vi.fn();
        setup({ fileInputRef: { current: { click } as unknown as HTMLInputElement } });
        fireEvent.click(screen.getByTitle('Open'));
        expect(click).toHaveBeenCalledTimes(1);
    });
});

describe('TopBar zoom', () => {
    it('shows the zoom percentage', () => {
        setup({ zoom: 1.25 });
        expect(screen.getByText('125%')).toBeTruthy();
    });

    it('steps zoom in and out by 0.1', () => {
        const props = setup({ zoom: 1 });
        fireEvent.click(screen.getByTitle('Zoom In'));
        expect(props.onZoomChange).toHaveBeenLastCalledWith(1.1);
        fireEvent.click(screen.getByTitle('Zoom Out'));
        expect(props.onZoomChange).toHaveBeenLastCalledWith(0.9);
    });

    it('clamps zoom out at 10%', () => {
        const props = setup({ zoom: 0.1 });
        fireEvent.click(screen.getByTitle('Zoom Out'));
        expect(props.onZoomChange).toHaveBeenLastCalledWith(0.1);
    });

    it('clamps zoom in at 500%', () => {
        const props = setup({ zoom: 5 });
        fireEvent.click(screen.getByTitle('Zoom In'));
        expect(props.onZoomChange).toHaveBeenLastCalledWith(5);
    });
});

describe('TopBar edit actions', () => {
    it('triggers undo', () => {
        const props = setup();
        fireEvent.click(screen.getByTitle('Undo'));
        expect(props.undo).toHaveBeenCalledTimes(1);
    });

    it('disables Delete when nothing is selected', () => {
        const props = setup();
        const del = screen.getByTitle('Delete');
        expect(del).toBeDisabled();
        fireEvent.click(del);
        expect(props.deleteSelected).not.toHaveBeenCalled();
    });

    it('enables Delete when a selection exists', () => {
        const props = setup({ selectedIds: new Set(['a']) });
        const del = screen.getByTitle('Delete');
        expect(del).not.toBeDisabled();
        fireEvent.click(del);
        expect(props.deleteSelected).toHaveBeenCalledTimes(1);
    });

    it('clears the canvas through Clear All', () => {
        const props = setup();
        fireEvent.click(screen.getByTitle('Clear All'));
        expect(props.clearAll).toHaveBeenCalledTimes(1);
    });
});

describe('TopBar exports', () => {
    it('exports the svg as a png drawing', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        setup({ svgRef: { current: svg } });
        fireEvent.click(screen.getByText('Export'));
        expect(exportCanvas).toHaveBeenCalledWith(svg, 'png', 'drawing');
    });

    it('does not export when the svg ref is empty', () => {
        setup({ svgRef: { current: null } });
        fireEvent.click(screen.getByText('Export'));
        expect(exportCanvas).not.toHaveBeenCalled();
    });

    it('exports platform icons from the Icon dropdown', () => {
        setup();
        fireEvent.click(screen.getByTitle('Export Icons from icon.svg'));
        fireEvent.click(screen.getByText('MacOS'));
        expect(exportAppIcon).toHaveBeenCalledWith('icon.svg', 'icns');
        expect(screen.queryByText('Windows')).toBeNull();

        fireEvent.click(screen.getByTitle('Export Icons from icon.svg'));
        fireEvent.click(screen.getByText('Windows'));
        expect(exportAppIcon).toHaveBeenCalledWith('icon.svg', 'ico');

        fireEvent.click(screen.getByTitle('Export Icons from icon.svg'));
        fireEvent.click(screen.getByText('Linux'));
        expect(exportAppIcon).toHaveBeenCalledWith('icon.svg', 'png');
    });

    it('toggles the icon dropdown closed on a second click', () => {
        setup();
        fireEvent.click(screen.getByTitle('Export Icons from icon.svg'));
        expect(screen.getByText('MacOS')).toBeTruthy();
        fireEvent.click(screen.getByTitle('Export Icons from icon.svg'));
        expect(screen.queryByText('MacOS')).toBeNull();
    });
});