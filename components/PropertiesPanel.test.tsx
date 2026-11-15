// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PropertiesPanel } from './PropertiesPanel';
import { Shape, ShapeType, AxisConfig } from '../types';
import { makeShape } from '../test/componentHelpers';

type Props = React.ComponentProps<typeof PropertiesPanel>;

const setup = (overrides: Partial<Props> = {}) => {
    const props: Props = {
        selectedShape: null,
        shapes: [],
        setShapes: vi.fn(),
        selectedIds: new Set<string>(),
        axisConfig: { visible: false, ticks: 5, color: '#94a3b8', showGrid: false },
        setAxisConfig: vi.fn(),
        autoLabelMode: false,
        setAutoLabelMode: vi.fn(),
        smartSketchMode: false,
        setSmartSketchMode: vi.fn(),
        pressureEnabled: false,
        setPressureEnabled: vi.fn(),
        lockBackground: true,
        setLockBackground: vi.fn(),
        markingAnglesMode: false,
        setMarkingAnglesMode: vi.fn(),
        pickingMirrorMode: false,
        setPickingMirrorMode: vi.fn(),
        currentStyle: { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' },
        setCurrentStyle: vi.fn(),
        canvasSize: { width: 1600, height: 800 },
        pixelsPerUnit: 40,
        originY: 400,
        onFitToViewport: vi.fn(),
        saveHistory: vi.fn(),
        isDragging: false,
        ...overrides,
    };
    const utils = render(<PropertiesPanel {...props} />);
    return { props, ...utils };
};

const applyUpdater = (mock: any, prev: any) => {
    const arg = mock.mock.calls[mock.mock.calls.length - 1][0];
    return typeof arg === 'function' ? arg(prev) : arg;
};

const section = (name: string) => within(screen.getByText(name).closest('.border-b') as HTMLElement);

const fnShape = makeShape('fn', ShapeType.FUNCTION_GRAPH, [], {
    formulaParams: { a: 1, b: 2, c: 0, h: -1, k: -1 },
    functionForm: 'standard',
    functionType: 'quadratic',
    pathData: 'M 0 0',
});

describe('PropertiesPanel stroke controls', () => {
    it('applies a stroke color to the current style and the selection', () => {
        const shape = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
        const { props } = setup({ shapes: [shape], selectedShape: shape, selectedIds: new Set(['r']) });
        fireEvent.click(section('Stroke').getByTitle('#ef4444'));
        expect(props.saveHistory).toHaveBeenCalled();
        expect(applyUpdater(props.setCurrentStyle, { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' }).stroke).toBe('#ef4444');
        const next = applyUpdater(props.setShapes, [shape]);
        expect(next[0].stroke).toBe('#ef4444');
    });

    it('updates stroke width without pushing history on each slide', () => {
        const { props, container } = setup();
        const slider = container.querySelector('input[type="range"][min="1"][max="10"]')!;
        fireEvent.change(slider, { target: { value: '5' } });
        expect(applyUpdater(props.setCurrentStyle, { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' }).strokeWidth).toBe(5);
        expect(props.saveHistory).not.toHaveBeenCalled();
        fireEvent.pointerDown(slider);
        expect(props.saveHistory).toHaveBeenCalledTimes(1);
    });

    it('switches the stroke pattern', () => {
        const { props } = setup();
        fireEvent.click(screen.getByText('dashed'));
        expect(props.saveHistory).toHaveBeenCalled();
        expect(applyUpdater(props.setCurrentStyle, { fill: 'transparent', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' }).strokeType).toBe('dashed');
    });

    it('reflects the selected shape stroke rather than the default style', () => {
        const shape = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }], { stroke: '#3b82f6' });
        setup({ shapes: [shape], selectedShape: shape, selectedIds: new Set(['r']) });
        expect(section('Stroke').getByTitle('#3b82f6').className).toContain('ring-2');
        expect(section('Stroke').getByTitle('#000000').className).not.toContain('ring-2');
    });
});

describe('PropertiesPanel fill controls', () => {
    it('sets no fill through the No Fill button', () => {
        const { props } = setup();
        fireEvent.click(screen.getByTitle('No Fill'));
        expect(applyUpdater(props.setCurrentStyle, { fill: '#ef4444', stroke: '#000000', strokeWidth: 2, strokeType: 'solid' }).fill).toBe('transparent');
    });

    it('applies a fill color to the selection', () => {
        const shape = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
        const { props } = setup({ shapes: [shape], selectedShape: shape, selectedIds: new Set(['r']) });
        fireEvent.click(section('Fill').getByTitle('#10b981'));
        const next = applyUpdater(props.setShapes, [shape]);
        expect(next[0].fill).toBe('#10b981');
    });
});

describe('PropertiesPanel function controls', () => {
    it('shows standard-form parameters for a quadratic', () => {
        setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        expect(screen.getByText('Quadratic Function')).toBeTruthy();
        expect(screen.getByText('Format: y = ax² + bx + c')).toBeTruthy();
        expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
    });

    it('recomputes vertex params when a standard coefficient changes', () => {
        const { props } = setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        const [aInput] = screen.getAllByRole('spinbutton');
        fireEvent.change(aInput, { target: { value: '2' } });
        const next = applyUpdater(props.setShapes, [fnShape]);
        // a=2, b=2, c=0 -> h=-b/2a=-0.5, k=c-b²/4a=-0.5
        expect(next[0].formulaParams).toMatchObject({ a: 2, b: 2, c: 0, h: -0.5, k: -0.5 });
        expect(next[0].pathData).not.toBe('M 0 0');
    });

    it('rounds edited coefficients to one decimal', () => {
        const { props } = setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        const [, bInput] = screen.getAllByRole('spinbutton');
        fireEvent.change(bInput, { target: { value: '1.26' } });
        const next = applyUpdater(props.setShapes, [fnShape]);
        expect(next[0].formulaParams.b).toBe(1.3);
    });

    it('switches to vertex form and regenerates the path', () => {
        const { props, rerender } = setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        fireEvent.click(screen.getByText('Vertex'));
        const next = applyUpdater(props.setShapes, [fnShape]);
        expect(next[0].functionForm).toBe('vertex');
        expect(next[0].pathData).not.toBe('M 0 0');
        rerender(<PropertiesPanel {...props} shapes={next} selectedShape={next[0]} />);
        expect(screen.getByText('Format: y = a(x - h)² + k')).toBeTruthy();
    });

    it('recomputes standard params when a vertex coefficient changes', () => {
        const vertexShape = { ...fnShape, functionForm: 'vertex' as const };
        const { props } = setup({ shapes: [vertexShape], selectedShape: vertexShape, selectedIds: new Set(['fn']) });
        const [, hInput] = screen.getAllByRole('spinbutton');
        fireEvent.change(hInput, { target: { value: '2' } });
        const next = applyUpdater(props.setShapes, [vertexShape]);
        // a=1, h=2, k=-1 -> b=-2ah=-4, c=ah²+k=3
        expect(next[0].formulaParams).toMatchObject({ a: 1, h: 2, k: -1, b: -4, c: 3 });
    });

    it('shows slope and intercept for a linear function', () => {
        const linear = makeShape('lin', ShapeType.FUNCTION_GRAPH, [], {
            formulaParams: { k: 1, b: 0 }, functionForm: 'standard', functionType: 'linear', pathData: 'M 0 0',
        });
        const { props } = setup({ shapes: [linear], selectedShape: linear, selectedIds: new Set(['lin']) });
        expect(screen.getByText('Linear Function')).toBeTruthy();
        expect(screen.getByText('Format: y = kx + b')).toBeTruthy();
        const [kInput] = screen.getAllByRole('spinbutton');
        fireEvent.change(kInput, { target: { value: '3' } });
        const next = applyUpdater(props.setShapes, [linear]);
        expect(next[0].formulaParams.k).toBe(3);
    });

    it('does not commit partial numeric input like a lone minus sign', () => {
        const { props } = setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        const [aInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(aInput, { target: { value: '-' } });
        expect(props.setShapes).not.toHaveBeenCalled();
    });

    it('reverts an invalid value on blur', () => {
        setup({ shapes: [fnShape], selectedShape: fnShape, selectedIds: new Set(['fn']) });
        const [aInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(aInput, { target: { value: '' } });
        fireEvent.blur(aInput);
        expect(aInput.value).toBe('1');
    });
});

describe('PropertiesPanel marker controls', () => {
    const triangle = makeShape('tri', ShapeType.TRIANGLE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
    const marker = makeShape('mk', ShapeType.MARKER, [{ x: 100, y: 0 }], {
        markerConfig: { type: 'angle_arc', targets: [{ shapeId: 'tri', pointIndices: [0, 1, 2] }] },
        pathData: 'M 0 0',
    });

    it('offers arc and right-angle marker types', () => {
        setup({ shapes: [triangle, marker], selectedShape: marker, selectedIds: new Set(['mk']) });
        expect(screen.getByText('Marker Type')).toBeTruthy();
        expect(screen.getByText('Arc')).toBeTruthy();
        expect(screen.getByText('Right Angle')).toBeTruthy();
    });

    it('converts an arc marker to a right-angle marker with fresh geometry', () => {
        const { props } = setup({ shapes: [triangle, marker], selectedShape: marker, selectedIds: new Set(['mk']) });
        fireEvent.click(screen.getByText('Right Angle'));
        expect(props.saveHistory).toHaveBeenCalled();
        const next = applyUpdater(props.setShapes, [triangle, marker]);
        const updated = next.find((s: Shape) => s.id === 'mk');
        expect(updated.markerConfig.type).toBe('perpendicular');
        expect(updated.pathData).toBeTruthy();
        expect(updated.pathData).not.toBe('M 0 0');
    });
});

describe('PropertiesPanel smart tools', () => {
    it('toggles each mode flag', () => {
        const { props } = setup();
        fireEvent.click(screen.getByText('Auto AB'));
        expect(props.setAutoLabelMode).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByText('Sketch Fix'));
        expect(props.setSmartSketchMode).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByText('Pressure'));
        expect(props.setPressureEnabled).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByText('Lock BG'));
        expect(props.setLockBackground).toHaveBeenCalledWith(false);
        fireEvent.click(screen.getByText('Angles'));
        expect(props.setMarkingAnglesMode).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByText('Mirror'));
        expect(props.setPickingMirrorMode).toHaveBeenCalledWith(true);
    });

    it('fits content to the viewport', () => {
        const { props } = setup();
        fireEvent.click(screen.getByText('Fit Content to View'));
        expect(props.onFitToViewport).toHaveBeenCalledTimes(1);
    });
});

describe('PropertiesPanel coordinate controls', () => {
    // React restores controlled inputs after the event, so updaters that read
    // e.target must be evaluated eagerly while the event is still live.
    const eagerAxisSpy = () => {
        const state = { result: null as AxisConfig | null };
        const spy = vi.fn((arg: AxisConfig | ((prev: AxisConfig) => AxisConfig)) => {
            state.result = typeof arg === 'function'
                ? arg({ visible: false, ticks: 5, color: '#94a3b8', showGrid: false })
                : arg;
        });
        return { spy, state };
    };

    it('toggles axis visibility', () => {
        const { spy, state } = eagerAxisSpy();
        const { container } = setup({ setAxisConfig: spy });
        const [axesToggle] = container.querySelectorAll('input[type="checkbox"]');
        fireEvent.click(axesToggle);
        expect(state.result!.visible).toBe(true);
    });

    it('toggles the grid', () => {
        const { spy, state } = eagerAxisSpy();
        const { container } = setup({ setAxisConfig: spy });
        const [, gridToggle] = container.querySelectorAll('input[type="checkbox"]');
        fireEvent.click(gridToggle);
        expect(state.result!.showGrid).toBe(true);
    });

    it('adjusts tick density', () => {
        const { spy, state } = eagerAxisSpy();
        const { container } = setup({ setAxisConfig: spy });
        const slider = container.querySelector('input[type="range"][min="2"][max="20"]')!;
        fireEvent.change(slider, { target: { value: '12' } });
        expect(state.result!.ticks).toBe(12);
    });
});

describe('PropertiesPanel sections and memoization', () => {
    it('opens and closes accordion sections', () => {
        setup();
        const strokeHeader = screen.getByText('Stroke').closest('button')!;
        const body = strokeHeader.nextElementSibling as HTMLElement;
        expect(body.className).toContain('max-h-0');
        fireEvent.click(strokeHeader);
        expect(body.className).toContain('max-h-[1000px]');
        fireEvent.click(strokeHeader);
        expect(body.className).toContain('max-h-0');
    });

    it('skips re-rendering while a canvas drag is in progress', () => {
        const shape = makeShape('r', ShapeType.RECTANGLE, [{ x: 0, y: 0 }, { x: 10, y: 10 }], { stroke: '#000000' });
        const base = {
            shapes: [shape], selectedShape: shape, selectedIds: new Set(['r']),
        };
        const { rerender, props } = setup(base);
        expect(section('Stroke').getByTitle('#000000').className).toContain('ring-2');
        const moved = { ...shape, stroke: '#ef4444' };
        rerender(<PropertiesPanel {...props} {...base} shapes={[moved]} selectedShape={moved} isDragging={true} />);
        expect(section('Stroke').getByTitle('#000000').className).toContain('ring-2');
        rerender(<PropertiesPanel {...props} {...base} shapes={[moved]} selectedShape={moved} isDragging={false} />);
        expect(section('Stroke').getByTitle('#ef4444').className).toContain('ring-2');
    });
});