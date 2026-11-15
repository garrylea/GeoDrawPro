import { Shape, ShapeType } from '../types';
import { getShapeCenter } from './shapeGeometry';
import { getAngleDegrees, reflectPointAcrossLine, rotatePoint } from './vectorMath';

const RIGID_TYPES = [ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.CIRCLE, ShapeType.ELLIPSE, ShapeType.TEXT, ShapeType.IMAGE];

export const reflectShapesAcrossLine = (targets: Shape[], line: Shape, generateId: () => string): Shape[] => {
    const p1 = line.points[0];
    const p2 = line.points[line.points.length - 1];
    const lineAngle = getAngleDegrees(p1, p2);

    return targets.map(s => {
        if (RIGID_TYPES.includes(s.type)) {
            const center = getShapeCenter(s.points, s.type, s.fontSize, s.text);
            const reflectedCenter = reflectPointAcrossLine(center, p1, p2);
            const dx = reflectedCenter.x - center.x;
            const dy = reflectedCenter.y - center.y;
            const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy, p: p.p }));
            let newRotation = 2 * lineAngle - (s.rotation || 0);
            newRotation = (newRotation % 360 + 360) % 360;
            return { ...s, id: generateId(), points: newPoints, rotation: newRotation };
        }
        let pts = s.points;
        if (s.rotation) {
            const c = getShapeCenter(s.points, s.type, s.fontSize, s.text);
            pts = pts.map(p => rotatePoint(p, c, s.rotation));
        }
        const mirroredPts = pts.map(p => reflectPointAcrossLine(p, p1, p2));
        return { ...s, id: generateId(), points: mirroredPts, rotation: 0 };
    });
};