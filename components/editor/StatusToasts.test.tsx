// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MirrorBanner, AddPageButton, StatusToasts } from './StatusToasts';

describe('StatusToasts', () => {
    it('shows the importing overlay with the progress message when active', () => {
        const { container } = render(<StatusToasts loadingState={{ active: true, message: 'Page 2 of 5' }} saveMessage={null} />);
        expect(screen.getByText('Importing PDF')).toBeTruthy();
        expect(screen.getByText('Page 2 of 5')).toBeTruthy();
        const overlay = container.firstElementChild as HTMLElement;
        expect(overlay.className).toContain('absolute inset-0');
    });

    it('renders no overlay when loading is inactive', () => {
        const { container } = render(<StatusToasts loadingState={{ active: false, message: 'Page 2 of 5' }} saveMessage={null} />);
        expect(screen.queryByText('Importing PDF')).toBeNull();
        expect(container.childElementCount).toBe(0);
    });

    it('shows the save toast text when saveMessage is set', () => {
        render(<StatusToasts loadingState={{ active: false, message: '' }} saveMessage="Saved project.geo" />);
        expect(screen.getByText('Saved project.geo')).toBeTruthy();
    });

    it('renders nothing when idle', () => {
        const { container } = render(<StatusToasts loadingState={{ active: false, message: '' }} saveMessage={null} />);
        expect(container.childElementCount).toBe(0);
    });

    it('can show the loading overlay and save toast together', () => {
        render(<StatusToasts loadingState={{ active: true, message: 'Working' }} saveMessage="Saved" />);
        expect(screen.getByText('Importing PDF')).toBeTruthy();
        expect(screen.getByText('Saved')).toBeTruthy();
    });
});

describe('AddPageButton', () => {
    it('labels itself "Add Page" on the first page and calls onAdd when clicked', () => {
        const onAdd = vi.fn();
        render(<AddPageButton pageCount={1} onAdd={onAdd} />);
        const button = screen.getByRole('button');
        expect(button.textContent).toContain('Add Page');
        fireEvent.click(button);
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('shows the current page count once past one page', () => {
        render(<AddPageButton pageCount={2} onAdd={() => {}} />);
        expect(screen.getByRole('button').textContent).toContain('Page 2 / Add +');
    });
});

describe('MirrorBanner', () => {
    it('renders the mirror instruction text', () => {
        render(<MirrorBanner />);
        expect(screen.getByText('Select a line to mirror across')).toBeTruthy();
    });
});