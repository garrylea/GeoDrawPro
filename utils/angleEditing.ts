import { Shape, ShapeType, Point } from '../types';
import { solveTriangleASA, getShapeCenter } from './mathUtils';

/**
 * Applies a user-entered angle (degrees) to a polygon vertex.
 * Triangles are solved via ASA keeping the previously locked angle fixed;
 * other polygons rotate the next vertex around the edited one.
 * Returns null for shapes that have no angle-editing semantics.
 */
export const applyAngleEdit = (shape: Shape, index: number, newValue: number): Shape | null => {
    if (shape.type === ShapeType.TRIANGLE && shape.points.length === 3) {
        const pts = [...shape.points];
        const iCurrent = index;
        let iFixed: number;
        if (shape.lastModifiedAngleIndex !== undefined && shape.lastModifiedAngleIndex !== iCurrent) {
            iFixed = shape.lastModifiedAngleIndex;
        } else if (shape.lastModifiedAngleIndex === iCurrent && shape.lockedAngles && shape.lockedAngles.length > 0) {
            iFixed = shape.lockedAngles[0];
        } else {
            iFixed = (iCurrent + 1) % 3;
        }
        const iMove = [0, 1, 2].find(x => x !== iCurrent && x !== iFixed)!;
        const pFixed = pts[iFixed];
        const pCurrent = pts[iCurrent];
        const pMove = pts[iMove];
        const v1 = { x: pCurrent.x - pFixed.x, y: pCurrent.y - pFixed.y };
        const v2 = { x: pMove.x - pFixed.x, y: pMove.y - pFixed.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        const angleFixedRad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        const angleFixedVal = angleFixedRad * (180 / Math.PI);
        const newN = solveTriangleASA(pFixed, pCurrent, angleFixedVal, newValue, pMove);
        if (newN) {
            pts[iMove] = newN;
            return { ...shape, points: pts, lockedAngles: [iFixed], lastModifiedAngleIndex: iCurrent };
        }
        return shape;
    }
    if (shape.type === ShapeType.POLYGON && shape.points.length >= 3) {
        const pts = [...shape.points];
        const iC = index;
        const iN = (index + 1) % pts.length;
        const iP = (index - 1 + pts.length) % pts.length;
        const pC = pts[iC];
        const pN = pts[iN];
        const pP = pts[iP];
        const angleCP = Math.atan2(pP.y - pC.y, pP.x - pC.x);
        const angleCN = Math.atan2(pN.y - pC.y, pN.x - pC.x);
        let delta = angleCN - angleCP;
        while (delta <= -Math.PI) delta += 2 * Math.PI;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        const sign = delta >= 0 ? 1 : -1;
        const newRadCN = angleCP + sign * (newValue * Math.PI / 180);
        const lenCN = Math.sqrt(Math.pow(pN.x - pC.x, 2) + Math.pow(pN.y - pC.y, 2));
        pts[iN] = { x: pC.x + lenCN * Math.cos(newRadCN), y: pC.y + lenCN * Math.sin(newRadCN) };
        return { ...shape, points: pts };
    }
    return null;
};

export const getAngleEditAnchor = (shape: Shape, index: number): Point => {
    const c = getShapeCenter(shape.points);
    const p = shape.points[index];
    const dx = c.x - p.x, dy = c.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * 25, y: p.y + (dy / len) * 25 };
};