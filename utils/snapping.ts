import { Point, Shape, ShapeType, Constraint } from '../types';
import { distance, lerp, getProjectionParameter, rotatePoint } from './vectorMath';
import { screenToMath, mathToScreen } from './coordinates';
import { getShapeCenter, getRotatedCorners } from './shapeGeometry';
import { evaluateQuadratic } from './quadraticFunction';

export const snapToRuler = (
    p: Point,
    ruler: Shape,
    tolerance: number = 25
): { point: Point, snapped: boolean } => {
    if (ruler.type !== ShapeType.RULER || !ruler.points || ruler.points.length < 2) {
        return { point: p, snapped: false };
    }

    const center = getShapeCenter(ruler.points, ShapeType.RULER);
    const rotationRad = (ruler.rotation || 0) * Math.PI / 180;

    // Transform point to local ruler space
    const dx = p.x - center.x;
    const dy = p.y - center.y;

    // Rotate by -rotation (World to Local)
    const cos = Math.cos(-rotationRad);
    const sin = Math.sin(-rotationRad);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Ruler Dimensions
    // Points are TL and BR
    const p0 = ruler.points[0];
    const p1 = ruler.points[1];
    const width = Math.abs(p1.x - p0.x);
    const height = Math.abs(p1.y - p0.y);
    const halfH = height / 2;
    const halfW = width / 2;

    // Check horizontal bounds (allow some overflow for easier drawing at ends)
    if (localX < -halfW - tolerance || localX > halfW + tolerance) {
        return { point: p, snapped: false };
    }

    // Check vertical distance to edges
    const distTop = Math.abs(localY - (-halfH));
    const distBottom = Math.abs(localY - halfH);

    let snappedLocalY = localY;
    let snapped = false;

    if (distTop < tolerance) {
        snappedLocalY = -halfH - 2; // Snap slightly outside the visual edge so line shows clearly
        snapped = true;
    } else if (distBottom < tolerance) {
        snappedLocalY = halfH + 2;
        snapped = true;
    }

    if (!snapped) {
        return { point: p, snapped: false };
    }

    // Transform back to world space
    const cosR = Math.cos(rotationRad);
    const sinR = Math.sin(rotationRad);
    const worldX = localX * cosR - snappedLocalY * sinR + center.x;
    const worldY = localX * sinR + snappedLocalY * cosR + center.y;

    return { point: { x: worldX, y: worldY, p: p.p }, snapped: true };
};

export const getSnapPoint = (
    pos: Point,
    shapes: Shape[],
    excludeIds: string[] = [],
    gridConfig?: { width: number, height: number, ppu: number, originY?: number }
): { point: Point, snapped: boolean, constraint?: Constraint, type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' } => {
    let closestDist = 10;
    let snapPt = pos;
    let snapped = false;
    let constraint: Constraint | undefined = undefined;
    let snapType: 'endpoint' | 'midpoint' | 'center' | 'on_edge' | undefined = undefined;

    if (gridConfig) {
        const { ppu } = gridConfig;
        // SNAPPING IMPROVED: Snap to 0.1 unit increments (ppu / 10)
        // This matches the ruler's sub-ticks.
        const step = ppu / 10;
        const gx = Math.round(pos.x / step) * step;
        const gy = Math.round(pos.y / step) * step;
        if (Math.abs(gx - pos.x) < 5 && Math.abs(gy - pos.y) < 5) {
             snapPt = { x: gx, y: gy };
             closestDist = 5;
             snapped = true;
        }
    }

    for (const shape of shapes) {
        if (excludeIds.includes(shape.id)) continue;

        // 1. POINT PRIORITY: We check points first
        if (shape.type === ShapeType.POINT) {
            const p = shape.points[0];
            const d = distance(pos, p);
            const effectiveDist = d * 0.8;
            if (d < 15 && effectiveDist < closestDist) {
                snapPt = p;
                closestDist = effectiveDist;
                snapped = true;
                snapType = 'endpoint';
                constraint = { type: 'points_link', parentId: shape.id };
                continue;
            }
        }

        // 2. SPECIALIZED CIRCULAR LOGIC (Center + Perimeter)
        if (shape.type === ShapeType.CIRCLE || shape.type === ShapeType.ELLIPSE) {
            const center = getShapeCenter(shape.points, shape.type);

            // Check Center first
            const dCenter = distance(pos, center);
            if (dCenter < closestDist && dCenter < 15) {
                snapPt = center;
                closestDist = dCenter;
                snapped = true;
                snapType = 'center';
                constraint = undefined;
            }

            // Then check Perimeter
            if (shape.type === ShapeType.CIRCLE) {
                const radius = Math.abs(shape.points[1].x - shape.points[0].x) / 2;
                const d = distance(pos, center);
                            if (Math.abs(d - radius) < 25) {
                                const worldAngle = Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);
                                // Store angle relative to circle's own rotation
                                const relativeAngle = worldAngle - (shape.rotation || 0);
                                const rad = (worldAngle * Math.PI) / 180;
                                const projected = {
                                    x: center.x + radius * Math.cos(rad),
                                    y: center.y + radius * Math.sin(rad)
                                };
                                if (distance(pos, projected) < closestDist) {
                                    snapPt = projected;
                                    closestDist = distance(pos, projected);
                                    snapped = true;
                                    snapType = 'on_edge';
                                    constraint = { type: 'on_path', parentId: shape.id, paramAngle: relativeAngle };
                                }
                            }
            } else { // Ellipse
                const rx = Math.abs(shape.points[0].x - shape.points[1].x) / 2;
                const ry = Math.abs(shape.points[0].y - shape.points[1].y) / 2;
                let localPos = pos;
                if (shape.rotation) localPos = rotatePoint(pos, center, -shape.rotation);
                const angle = Math.atan2(localPos.y - center.y, localPos.x - center.x) * (180 / Math.PI);
                const rad = (angle * Math.PI) / 180;
                let projected = { x: center.x + rx * Math.cos(rad), y: center.y + ry * Math.sin(rad) };
                if (shape.rotation) projected = rotatePoint(projected, center, shape.rotation);
                if (distance(pos, projected) < 25 && distance(pos, projected) < closestDist) {
                    snapPt = projected;
                    closestDist = distance(pos, projected);
                    snapped = true;
                    snapType = 'on_edge';
                    constraint = { type: 'on_path', parentId: shape.id, paramAngle: angle };
                }
            }
            continue; // ALWAYS exit for circular shapes
        }

        // 3. POLYGON/RECTANGLE LOGIC
        if ([ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.TRIANGLE, ShapeType.POLYGON].includes(shape.type)) {
            const center = getShapeCenter(shape.points, shape.type);
            const d = distance(pos, center);
            if (d < closestDist && d < 15) {
                snapPt = center;
                closestDist = d;
                snapped = true;
                snapType = 'center';
            }
        }

        if (shape.type === ShapeType.FUNCTION_GRAPH) {
             if (shape.formulaParams && gridConfig) {
                 const originY = gridConfig.originY ?? (gridConfig.height / 2);
                 const mp = screenToMath(pos, gridConfig.width, gridConfig.height, gridConfig.ppu, originY);
                 const fType = shape.functionType || 'quadratic';
                 const my = evaluateQuadratic(mp.x, shape.formulaParams, shape.functionForm, fType);
                 const sp = mathToScreen({ x: mp.x, y: my }, gridConfig.width, gridConfig.height, gridConfig.ppu, originY);
                 if (distance(pos, sp) < closestDist) {
                     snapPt = sp;
                     closestDist = distance(pos, sp);
                     snapped = true;
                     constraint = { type: 'on_path', parentId: shape.id, paramX: mp.x };
                 }
             }
             continue;
        }

        // CRITICAL: Use visual points (rotated) for all geometric detection
        const visualPoints = getRotatedCorners(shape);

        if (visualPoints.length > 0) {
            // Vertices - Skip for circles/ellipses to prevent corner snapping
            const canSnapToVertices = ![ShapeType.CIRCLE, ShapeType.ELLIPSE].includes(shape.type);

            for (let j = 0; j < (canSnapToVertices ? visualPoints.length : 0); j++) {
                const p = visualPoints[j];
                const d = distance(pos, p);
                if (d < closestDist) {
                    snapPt = p;
                    closestDist = d;
                    snapped = true;
                    snapType = 'endpoint';

                    // NEW: Even if it is an endpoint, if it is a polygon/line, bind it to the segment starting at this index (paramT=0)
                    if ([ShapeType.POLYGON, ShapeType.TRIANGLE, ShapeType.RECTANGLE, ShapeType.SQUARE, ShapeType.LINE].includes(shape.type)) {
                         constraint = { type: 'on_edge', parentId: shape.id, edgeIndex: j, paramT: 0 };
                    } else if (shape.type === ShapeType.POINT) {
                         constraint = { type: 'points_link', parentId: shape.id };
                    } else {
                         constraint = undefined;
                    }
                }
            }

            // Edges & Midpoints
            if (visualPoints.length >= 2) {
                // CRITICAL FIX: Only polygons/rectangles should snap to edges.
                // Circles and ellipses must snap to their actual curve.
                const isClosed = [ShapeType.POLYGON, ShapeType.TRIANGLE, ShapeType.RECTANGLE, ShapeType.SQUARE].includes(shape.type);
                const segmentsCount = isClosed ? visualPoints.length : visualPoints.length - 1;

                for(let i = 0; i < segmentsCount; i++) {
                    const p1 = visualPoints[i];
                    const p2 = visualPoints[(i + 1) % visualPoints.length];

                    // Project point onto segment
                    let t = getProjectionParameter(pos, p1, p2);
                    t = Math.max(0, Math.min(1, t)); // Clamp to segment
                    const projected = lerp(p1, p2, t);

                    const d = distance(pos, projected);

                    if (d < closestDist) {
                        // Check if it's close to midpoint
                        if (Math.abs(t - 0.5) < 0.05) {
                             snapPt = lerp(p1, p2, 0.5);
                             closestDist = d;
                             snapped = true;
                             snapType = 'midpoint';
                             constraint = { type: 'on_edge', parentId: shape.id, edgeIndex: i, paramT: 0.5 };
                        } else {
                             snapPt = projected;
                             closestDist = d;
                             snapped = true;
                             snapType = 'on_edge';
                             constraint = { type: 'on_edge', parentId: shape.id, edgeIndex: i, paramT: t };
                        }
                    }
                }
            }
        }
    }
    return { point: snapPt, snapped, constraint, type: snapType };
};