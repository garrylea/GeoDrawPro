import React from 'react';
import { render } from '@testing-library/react';
import { Shape, ShapeType, Point } from '../types';

export const makeShape = (id: string, type: ShapeType, points: Point[], overrides: Partial<Shape> = {}): Shape => ({
    id, type, points, fill: 'transparent', stroke: '#000000', strokeWidth: 2, rotation: 0, ...overrides
});

export const renderInSvg = (ui: React.ReactElement) => render(<svg>{ui}</svg>);

export const stubPointerCapture = () => {
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
};