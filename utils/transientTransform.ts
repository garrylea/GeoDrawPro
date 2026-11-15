import { Shape, ShapeType, TransientState } from '../types';
import { getShapeCenter } from './mathUtils';

export interface SvgAttr {
    name: string;
    value: string;
}

/**
 * Transform string for a shape (or the selection overlay) during a gesture.
 * Order matters: gesture rotate, translate, persistent rotate, scale.
 */
export const buildShapeTransform = (shape: Shape | undefined, state: TransientState): string => {
    const { dx, dy, rotation, rotationCenter: pivot, scale, scaleCenter } = state;
    let finalTransform = '';
    if (rotation && pivot) { finalTransform += `rotate(${rotation} ${pivot.x} ${pivot.y}) `; }
    if (dx || dy) { finalTransform += `translate(${dx || 0} ${dy || 0}) `; }
    if (shape) {
        const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
        if (shape.rotation) { finalTransform += `rotate(${shape.rotation} ${center.x} ${center.y}) `; }
        if (scale && scaleCenter) { finalTransform += `translate(${scaleCenter.x} ${scaleCenter.y}) scale(${scale.x} ${scale.y}) translate(${-scaleCenter.x} ${-scaleCenter.y}) `; }
    }
    return finalTransform.trim();
};

export const buildResetTransform = (shape: Shape | undefined): string => {
    if (shape && shape.rotation) {
        const center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
        return `rotate(${shape.rotation} ${center.x} ${center.y})`;
    }
    return '';
};

export const buildLineResetAttrs = (shape: Shape): SvgAttr[] => [
    { name: 'x1', value: shape.points[0].x.toString() },
    { name: 'y1', value: shape.points[0].y.toString() },
    { name: 'x2', value: shape.points[1].x.toString() },
    { name: 'y2', value: shape.points[1].y.toString() }
];

/**
 * A linked line stretches elastically only when a linked parent is dragged
 * and the line itself is not part of the selection.
 */
export const isElasticLine = (shape: Shape | undefined, selectedIds: Set<string>): boolean =>
    shape?.type === ShapeType.LINE &&
    shape.constraint?.type === 'points_link' &&
    (shape.constraint.parents || [shape.constraint.parentId!]).some(pid => pid && selectedIds.has(pid));

export const buildElasticLineAttrs = (shape: Shape, state: TransientState, selectedIds: Set<string>): SvgAttr[] => {
    const { dx, dy } = state;
    const attrs: SvgAttr[] = [];
    const pids = shape.constraint!.parents || [shape.constraint!.parentId!];
    pids.forEach((pid, idx) => {
        if (!pid) return;
        if (selectedIds.has(pid)) {
            const originalPt = shape.points[idx];
            attrs.push({ name: `x${idx + 1}`, value: (originalPt.x + (dx || 0)).toString() });
            attrs.push({ name: `y${idx + 1}`, value: (originalPt.y + (dy || 0)).toString() });
        }
    });
    return attrs;
};