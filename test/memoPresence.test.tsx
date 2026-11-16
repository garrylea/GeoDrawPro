import { describe, it, expect } from 'vitest';
import { TopBar } from '../components/TopBar';
import { Sidebar } from '../components/Sidebar';
import { AxisLayer } from '../components/AxisLayer';
import { SelectionOverlay } from '../components/SelectionOverlay';
import { CompassOverlay } from '../components/ConstructionTools';
import { PageBreaks } from '../components/editor/PageBreaks';
import { SnapIndicator } from '../components/editor/SnapIndicator';

describe('memo presence', () => {
    it('wraps static panels in React.memo', () => {
        const memoType = Symbol.for('react.memo');
        for (const c of [TopBar, Sidebar, AxisLayer, SelectionOverlay, CompassOverlay, PageBreaks, SnapIndicator]) {
            expect((c as any).$$typeof).toBe(memoType);
        }
    });
});
