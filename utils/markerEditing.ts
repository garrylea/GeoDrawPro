import { Shape, ShapeType, Point } from '../types';
import { normalize, sub, getAngleDegrees } from './vectorMath';
import { getAngleArcPath } from './svgPaths';
import { getShapeCenter, getRotatedCorners } from './shapeGeometry';

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

export const recalculateMarker = (marker: Shape, allShapes: Shape[]): Shape | null => {
    if (!marker.markerConfig) return marker;
    const config = marker.markerConfig;
    const target = allShapes.find(s => s.id === config.targets[0].shapeId);
    if (!target) return null;
    const indices = config.targets[0].pointIndices;
    if (!indices || indices.length < 3) return marker;
    const p1 = target.points[indices[0]];
    const p2 = target.points[indices[1]]; 
    const p3 = target.points[indices[2]];
    if (!p1 || !p2 || !p3) return null;
    const len = 20; 
    const v1 = normalize(sub(p1, p2));
    const v2 = normalize(sub(p3, p2));
    const start = { x: p2.x + v1.x * len, y: p2.y + v1.y * len };
    const end = { x: p2.x + v2.x * len, y: p2.y + v2.y * len };
    
    if (config.type === 'perpendicular') {
        const mid = { x: start.x + v2.x * len, y: start.y + v2.y * len };
        const path = `M ${start.x} ${start.y} L ${mid.x} ${mid.y} L ${end.x} ${end.y}`;
        return { ...marker, points: [start], pathData: path };
    } else {
        const a1 = getAngleDegrees(p2, p1);
        const a2 = getAngleDegrees(p2, p3);
        const path = getAngleArcPath(p2, p1, p3, len, a1, a2);
        return { ...marker, points: [start], pathData: path };
    }
};