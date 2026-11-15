import { Shape, ShapeType, Point } from '../types';
import { getShapeCenter, getRotatedCorners, recalculateMarker } from './mathUtils';

export const getRotationPivot = (shape: Shape, pivotIndex: number | 'center'): Point => {
    let center = getShapeCenter(shape.points, shape.type, shape.fontSize, shape.text);
    if (pivotIndex !== 'center') {
        if (shape.type === ShapeType.RULER) {
            const p0 = shape.points[0], p1 = shape.points[1];
            const minX = Math.min(p0.x, p1.x), maxX = Math.max(p0.x, p1.x);
            const minY = Math.min(p0.y, p1.y);
            if (pivotIndex === 0) center = { x: minX, y: minY };
            else if (pivotIndex === 1) center = { x: maxX, y: minY };
        } else {
            center = getRotatedCorners(shape)[pivotIndex as number];
        }
    }
    return center;
};

export type AngleMarkerPlan =
    | { kind: 'toggle'; markerId: string }
    | { kind: 'create'; marker: Shape }
    | { kind: 'noop' };

export const planAngleMarkerToggle = (shapes: Shape[], shape: Shape, idx: number, newId: string): AngleMarkerPlan => {
    const existing = shapes.find(m => m.type === ShapeType.MARKER && m.markerConfig?.targets[0].shapeId === shape.id && m.markerConfig?.targets[0].pointIndices[1] === idx);
    if (existing) return { kind: 'toggle', markerId: existing.id };
    const corners = getRotatedCorners(shape);
    const len = corners.length, prevIdx = (idx - 1 + len) % len, nextIdx = (idx + 1) % len;
    const nm = recalculateMarker({
        id: newId, type: ShapeType.MARKER, points: [corners[idx]],
        fill: 'none', stroke: '#ef4444', strokeWidth: 2, rotation: 0,
        markerConfig: { type: 'angle_arc', targets: [{ shapeId: shape.id, pointIndices: [prevIdx, idx, nextIdx] }] }
    }, shapes);
    if (nm) return { kind: 'create', marker: nm };
    return { kind: 'noop' };
};

export const toggleMarkerType = (marker: Shape, allShapes: Shape[]): Shape =>
    recalculateMarker({
        ...marker,
        markerConfig: { ...marker.markerConfig!, type: marker.markerConfig!.type === 'angle_arc' ? 'perpendicular' : 'angle_arc' }
    }, allShapes) || marker;