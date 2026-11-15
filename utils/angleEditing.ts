import { Shape, ShapeType, Point } from '../types';
import { crossProduct, rotateVector, getLineIntersection } from './vectorMath';
import { getShapeCenter } from './shapeGeometry';

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

/**
 * Solves for the 3rd point of a triangle given two angles and the side between them (ASA).
 * Used when a user edits an angle while another angle is already locked.
 * 
 * @param pFixed The vertex of the "Locked" angle (e.g., A)
 * @param pCurrent The vertex of the angle currently being edited (e.g., B)
 * @param angleFixedDeg The value of the locked angle (Angle A)
 * @param angleCurrentDeg The new value of the current angle (Angle B)
 * @param pThirdCurrent The current position of the 3rd point (C) - used for chirality/direction
 */
export const solveTriangleASA = (
    pFixed: Point, 
    pCurrent: Point, 
    angleFixedDeg: number, 
    angleCurrentDeg: number, 
    pThirdCurrent: Point
): Point | null => {
    // 1. Base Vector (Fixed -> Current)
    const vBase = { x: pCurrent.x - pFixed.x, y: pCurrent.y - pFixed.y };
    
    // 2. Determine Chirality (Handedness)
    // Is the triangle constructed clockwise or counter-clockwise?
    // Cross product of (Fixed->Current) x (Fixed->Third)
    const vSideOld = { x: pThirdCurrent.x - pFixed.x, y: pThirdCurrent.y - pFixed.y };
    const cross = crossProduct(vBase, vSideOld);
    
    // If cross > 0, Third is "Right/CCW" relative to Base (depending on coord system).
    // SVG coords: Y down. 
    // We use the sign to ensure we rotate the rays into the triangle's interior.
    const sign = cross >= 0 ? 1 : -1;

    // 3. Ray from Fixed Point (Angle A)
    // We rotate the base vector by the fixed angle to get direction towards C
    const radFixed = (angleFixedDeg * Math.PI / 180) * sign;
    const dirFixed = rotateVector(vBase, radFixed);

    // 4. Ray from Current Point (Angle B)
    // We need vector Current->Fixed first (inverse of Base)
    const vBaseInv = { x: -vBase.x, y: -vBase.y };
    // Rotate by -sign (opposite direction)
    const radCurrent = (angleCurrentDeg * Math.PI / 180) * (-sign);
    const dirCurrent = rotateVector(vBaseInv, radCurrent);

    // 5. Intersect the two rays
    return getLineIntersection(pFixed, dirFixed, pCurrent, dirCurrent);
};