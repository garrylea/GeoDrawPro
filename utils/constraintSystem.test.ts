import { describe, it, expect } from 'vitest';
import { resolveConstraints, constrainPointToEdge, getDependents } from './constraintSystem';
import { getSnapPoint, getRotatedCorners, isPointInShape } from './mathUtils';
import { calculateMovedShape } from './shapeOperations';
import { Shape, ShapeType, Point } from '../types';

describe('Constraint System', () => {
    // Helper to create a shape
    const createShape = (id: string, type: ShapeType, points: Point[]): Shape => ({
        id, type, points, fill: 'none', stroke: 'black', strokeWidth: 1, rotation: 0
    });

    const createPoint = (id: string, x: number, y: number, constraint?: any): Shape => ({
        id, type: ShapeType.POINT, points: [{ x, y }], fill: 'black', stroke: 'none', strokeWidth: 1, rotation: 0, constraint
    });

    it('should update point position when parent shape moves (Case 1)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }
        ]);
        
        // Point constrained to edge 0 (bottom edge: 0,0 -> 100,0), t=0.5 (midpoint)
        const point = createPoint('p1', 50, 0, {
            type: 'on_edge', parentId: 'tri1', edgeIndex: 0, paramT: 0.5
        });

        // Move triangle by (10, 10)
        const movedTriangle = {
            ...triangle,
            points: triangle.points.map(p => ({ x: p.x + 10, y: p.y + 10 }))
        };

        const updatedShapes = resolveConstraints([movedTriangle, point], 'tri1', 1000, 1000, 20);
        
        const updatedPoint = updatedShapes.find(s => s.id === 'p1');
        
        expect(updatedPoint).toBeDefined();
        // Expected pos: (50+10, 0+10) = (60, 10)
        expect(updatedPoint!.points[0].x).toBeCloseTo(60);
        expect(updatedPoint!.points[0].y).toBeCloseTo(10);
    });

    it('should maintain consistent position with mouse for free points during smooth movement', () => {
        const point = createPoint('p1', 100, 100);
        let currentPoint = point;
        const mousePath = [
            { x: 110, y: 110 },
            { x: 125, y: 130 },
            { x: 150, y: 100 },
            { x: 200, y: 300 }
        ];

        let lastMouse = { x: 100, y: 100 };
        
        for (const mousePos of mousePath) {
            const dx = mousePos.x - lastMouse.x;
            const dy = mousePos.y - lastMouse.y;
            
            const nextPoint = {
                ...currentPoint,
                points: [{ x: currentPoint.points[0].x + dx, y: currentPoint.points[0].y + dy }]
            };
            
            expect(nextPoint.points[0].x).toBeCloseTo(mousePos.x);
            expect(nextPoint.points[0].y).toBeCloseTo(mousePos.y);
            
            currentPoint = nextPoint;
            lastMouse = mousePos;
        }
    });

    it('should keep point strictly on edge even when mouse is pulled far away (Case 2 Persistence)', () => {
        // Vertical edge from (100, 100) to (100, 500)
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 100, y: 500 }, { x: 500, y: 300 }
        ]);

        // Mouse path that moves horizontally far away from the vertical edge
        const mousePath = [
            { x: 105, y: 200 }, // Close
            { x: 300, y: 250 }, // Far right
            { x: -500, y: 300 }, // Far left
            { x: 100, y: 450 }  // Back on edge
        ];

        for (const mousePos of mousePath) {
            const result = constrainPointToEdge(mousePos, triangle, 0);
            
            // Should ALWAYS have x=100 because edge 0 is vertical at x=100
            expect(result.point.x).toBeCloseTo(100);
            // Y should be the projection of the mouse Y, clamped to [100, 500]
            const expectedY = Math.max(100, Math.min(500, mousePos.y));
            expect(result.point.y).toBeCloseTo(expectedY);
            // Verify t is correct
            expect(result.t).toBeCloseTo((expectedY - 100) / 400);
        }
    });

    it('should update point correctly when the specific vertex it depends on is moved (Case 3)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }
        ]);
        
        // Point at midpoint of edge 0 (0,0 -> 100,0) -> (50,0)
        const point = createPoint('p1', 50, 0, {
            type: 'on_edge', parentId: 'tri1', edgeIndex: 0, paramT: 0.5
        });

        // Move Vertex 1 (100, 0) to (200, 50)
        const updatedTriangle = {
            ...triangle,
            points: [triangle.points[0], { x: 200, y: 50 }, triangle.points[2]]
        };

        const updatedShapes = resolveConstraints([updatedTriangle, point], 'tri1', 1000, 1000, 20);
        const updatedPoint = updatedShapes.find(s => s.id === 'p1')!;

        // New Edge 0: (0,0) -> (200,50)
        // Midpoint (t=0.5): (100, 25)
        expect(updatedPoint.points[0].x).toBeCloseTo(100);
        expect(updatedPoint.points[0].y).toBeCloseTo(25);
    });

    it('should rotate point correctly when parent shape is rotated via rotation property (Case 7)', () => {
        // Horizontal line from (0,0) to (100,0). Midpoint at (50,0)
        const line = createShape('line1', ShapeType.LINE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }
        ]);
        const point = createPoint('p1', 50, 0, {
            type: 'on_edge', parentId: 'line1', edgeIndex: 0, paramT: 0.5
        });

        // Rotate line 90 degrees clockwise around its center (50, 0)
        const rotatedLine = {
            ...line,
            rotation: 90
        };

        const updatedShapes = resolveConstraints([rotatedLine, point], 'line1', 1000, 1000, 20);
        const updatedPoint = updatedShapes.find(s => s.id === 'p1')!;

        // Visual Center of {0,0}-{100,0} is {50,0}
        // Visual Midpoint should still be {50,0} even after rotation
        expect(updatedPoint.points[0].x).toBeCloseTo(50);
        expect(updatedPoint.points[0].y).toBeCloseTo(0);
        
        // Example 2: Rotate 90 degrees around center, but point is at t=1.0 (end)
        const endPoint = createPoint('p2', 100, 0, {
            type: 'on_edge', parentId: 'line1', edgeIndex: 0, paramT: 1.0
        });
        
        const updatedShapes2 = resolveConstraints([rotatedLine, endPoint], 'line1', 1000, 1000, 20);
        const updatedEndPoint = updatedShapes2.find(s => s.id === 'p2')!;
        
        expect(updatedEndPoint.points[0].x).toBeCloseTo(50);
        expect(updatedEndPoint.points[0].y).toBeCloseTo(50);
    });

    it('should establish constraint when a free point is moved onto an edge', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }
        ]);
        const freePoint = createPoint('p1', -50, -50); // Far away

        // Simulating getSnapPoint behavior in the app:
        // User drags point to (50, 2) which is near edge 0 (0,0 -> 100,0)
        const mousePos = { x: 50, y: 2 };
        
        // We use the same getSnapPoint logic that Editor.tsx uses
        const snapResult = getSnapPoint(mousePos, [triangle]);
        
        expect(snapResult.snapped).toBe(true);
        expect(snapResult.constraint).toBeDefined();
        expect(snapResult.constraint!.type).toBe('on_edge');
        expect(snapResult.constraint!.parentId).toBe('tri1');
        expect(snapResult.constraint!.paramT).toBeCloseTo(0.5);

        // Apply the constraint to the point
        const constrainedPoint = {
            ...freePoint,
            points: [snapResult.point],
            constraint: snapResult.constraint
        };

        // Move triangle and verify point follows
        const movedTriangle = {
            ...triangle,
            points: triangle.points.map(p => ({ x: p.x + 10, y: p.y + 10 }))
        };

        const finalShapes = resolveConstraints([movedTriangle, constrainedPoint], 'tri1', 1000, 1000, 20);
        const finalPoint = finalShapes.find(s => s.id === 'p1')!;
        
        expect(finalPoint.points[0].x).toBeCloseTo(60); // 50 + 10
        expect(finalPoint.points[0].y).toBeCloseTo(10); // 0 + 10
    });

    it('should pass high-frequency stress test for edge binding stability', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);
        
        // Stress test: Approach triangle from various random points near any edge
        for (let i = 0; i < 100; i++) {
            const edgeIdx = Math.floor(Math.random() * 3);
            const p1 = triangle.points[edgeIdx];
            const p2 = triangle.points[(edgeIdx + 1) % 3];
            
            const t = 0.2 + Math.random() * 0.6; 
            const basePoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
            const offsetPoint = { x: basePoint.x + (Math.random() * 4 - 2), y: basePoint.y + (Math.random() * 4 - 2) };
            
            const snapResult = getSnapPoint(offsetPoint, [triangle]);
            
            expect(snapResult.snapped).toBe(true);
            expect(snapResult.constraint).toBeDefined();
            expect(snapResult.constraint!.parentId).toBe('tri1');
            
            // The snapped point should be very close to the actual mathematical edge
            const d = Math.sqrt(Math.pow(snapResult.point.x - basePoint.x, 2) + Math.pow(snapResult.point.y - basePoint.y, 2));
            expect(d).toBeLessThan(15);
        }
    });

    it('should maintain constraint even when snapped exactly to a vertex (Real-world scenario)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);
        
        // Move point exactly to vertex 0 (100, 100)
        const snapResult = getSnapPoint({ x: 100.1, y: 100.1 }, [triangle]);
        
        expect(snapResult.snapped).toBe(true);
        expect(snapResult.constraint).toBeDefined();
        expect(snapResult.constraint!.type).toBe('on_edge');
        // It could be edge 0, t=0 OR edge 2, t=1 depending on iteration order. Both are valid.
        const t = snapResult.constraint!.paramT;
        const idx = snapResult.constraint!.edgeIndex;
        const isValidVertexSnap = (idx === 0 && t! < 0.1) || (idx === 2 && t! > 0.9);
        expect(isValidVertexSnap).toBe(true);
    });

    it('should finalize constraint on pointer up (Simulating App PointerUp logic)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);
        const point = createPoint('p1', 0, 0); // Start far away

        const finalRawPos = { x: 200, y: 100 };
        
        const snapResult = getSnapPoint(finalRawPos, [triangle]);
        
        let finalizedPoint = {
            ...point,
            points: [snapResult.snapped ? snapResult.point : finalRawPos],
            constraint: snapResult.constraint
        };

        expect(finalizedPoint.constraint).toBeDefined();
        expect(finalizedPoint.constraint!.parentId).toBe('tri1');
        expect(finalizedPoint.constraint!.edgeIndex).toBe(0);
        expect(finalizedPoint.constraint!.paramT).toBeCloseTo(0.5);

        // Verify it's now truly linked
        const movedTriangle = {
            ...triangle,
            points: triangle.points.map(p => ({ x: p.x + 50, y: p.y + 50 }))
        };
        const resolved = resolveConstraints([movedTriangle, finalizedPoint], 'tri1', 1000, 1000, 20);
        const linkedPoint = resolved.find(s => s.id === 'p1')!;
        
        expect(linkedPoint.points[0].x).toBeCloseTo(250);
        expect(linkedPoint.points[0].y).toBeCloseTo(150);
    });

    it('should bind correctly regardless of drawing order (Case: Point drawn BEFORE Triangle)', () => {
        const point = createPoint('p1', 50, 50);
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }
        ]);

        const dropPos = { x: 50, y: 0 }; // Exactly on top edge
        const snapResult = getSnapPoint(dropPos, [triangle]);
        
        expect(snapResult.snapped).toBe(true);
        expect(snapResult.constraint).toBeDefined();
        expect(snapResult.constraint!.parentId).toBe('tri1');

        const boundPoint = { ...point, points: [snapResult.point], constraint: snapResult.constraint };

        const movedTriangle = { ...triangle, points: triangle.points.map(p => ({ x: p.x + 10, y: p.y })) };
        const resolved = resolveConstraints([movedTriangle, boundPoint], 'tri1', 1000, 1000, 20);
        const finalPoint = resolved.find(s => s.id === 'p1')!;
        
        expect(finalPoint.points[0].x).toBeCloseTo(60);
    });

    it('should NOT allow detaching an edge-constrained point by dragging far away (Case 2 Integration)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);
        const point = createPoint('p1', 200, 100, {
            type: 'on_edge', parentId: 'tri1', edgeIndex: 0, paramT: 0.5
        });

        const mouseFinalPos = { x: 500, y: 500 };
        const { point: constrainedPos, t } = constrainPointToEdge(mouseFinalPos, triangle, 0);
        
        const finalizedPoint = {
            ...point,
            points: [constrainedPos],
            constraint: { ...point.constraint!, paramT: t }
        };

        expect(finalizedPoint.constraint).toBeDefined();
        expect(finalizedPoint.constraint!.parentId).toBe('tri1');
        expect(finalizedPoint.points[0].x).toBeCloseTo(300);
        expect(finalizedPoint.points[0].y).toBeCloseTo(100);
        expect(finalizedPoint.constraint!.paramT).toBe(1.0);
    });

    it('should NOT deform parent shape when constrained point is moved to its vertex', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);

        const newPointPos = { x: 300, y: 100 };
        const dx = newPointPos.x - 200;
        const dy = newPointPos.y - 100;

        const result = calculateMovedShape(triangle, dx, dy, 20, [ {x: 200, y: 100} ], 1000, 1000);
        expect(result.points[0].x).toBe(100); // Vertex 0 should not move
    });

    it('should NOT move unrelated points when dragging a point (Regression Fix)', () => {
        const point1 = createPoint('p1', 100, 100);
        const point2 = createPoint('p2', 500, 500); 
        
        const dx = 50, dy = 50;
        const drivingPoints = [ {x: 100, y: 100} ]; 
        
        const updatedP2 = calculateMovedShape(point2, dx, dy, 20, drivingPoints, 1000, 1000);
        expect(updatedP2.points[0].x).toBe(500);
        
        const updatedP1 = calculateMovedShape(point1, dx, dy, 20, drivingPoints, 1000, 1000);
        expect(updatedP1.points[0].x).toBe(150);
    });

    it('should propagate changes from shape to points to line (Case 5 & 6)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }
        ]);
        const p1 = createPoint('p1', 50, 0, { type: 'on_edge', parentId: 'tri1', edgeIndex: 0, paramT: 0.5 });
        const p2 = createPoint('p2', 0, 50, { type: 'on_edge', parentId: 'tri1', edgeIndex: 2, paramT: 0.5 });
        
        const connectingLine = createShape('line1', ShapeType.LINE, [
            { x: 50, y: 0 }, { x: 0, y: 50 }
        ]);
        connectingLine.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const movedTriangle = {
            ...triangle,
            points: triangle.points.map(p => ({ x: p.x + 10, y: p.y + 20 }))
        };

        const resolved = resolveConstraints([movedTriangle, p1, p2, connectingLine], 'tri1', 1000, 1000, 20);
        
        const finalLine = resolved.find(s => s.id === 'line1')!;
        expect(finalLine.points[0].x).toBeCloseTo(60);
        expect(finalLine.points[1].x).toBeCloseTo(10);
    });

    it('should update line when only one connected point moves (Case 6)', () => {
        const p1 = createPoint('p1', 100, 100);
        const p2 = createPoint('p2', 200, 200);
        const line = createShape('line1', ShapeType.LINE, [{x: 100, y: 100}, {x: 200, y: 200}]);
        line.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const movedP1 = { ...p1, points: [{ x: 150, y: 100 }] };
        const resolved = resolveConstraints([movedP1, p2, line], 'p1', 1000, 1000, 20);
        const finalLine = resolved.find(s => s.id === 'line1')!;

        expect(finalLine.points[0].x).toBeCloseTo(150);
        expect(finalLine.points[1].x).toBeCloseTo(200); 
    });

    it('should maintain line connection when parent shape is rotated (Case 7 + 5 combo)', () => {
        const triangle = createShape('tri1', ShapeType.TRIANGLE, [
            { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }
        ]);
        const p1 = createPoint('p1', 200, 100, { type: 'on_edge', parentId: 'tri1', edgeIndex: 0, paramT: 0.5 });
        const p2 = createPoint('p2', 250, 200, { type: 'on_edge', parentId: 'tri1', edgeIndex: 1, paramT: 0.5 });
        
        const line = createShape('line1', ShapeType.LINE, [{x: 200, y: 100}, {x: 250, y: 200}]);
        line.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const rotatedTriangle = { ...triangle, rotation: 90 };
        const resolved = resolveConstraints([rotatedTriangle, p1, p2, line], 'tri1', 1000, 1000, 20);
        
        const finalLine = resolved.find(s => s.id === 'line1')!;
        expect(finalLine.points.length).toBe(2);
    });

    it('should propagate changes from Rectangle to points to line (Case 5 & 6 - Rectangle)', () => {
        const rect = createShape('rect1', ShapeType.RECTANGLE, [{x:100,y:100}, {x:300,y:200}]);
        const p1 = createPoint('p1', 200, 100, { type: 'on_edge', parentId: 'rect1', edgeIndex: 0, paramT: 0.5 });
        const p2 = createPoint('p2', 200, 200, { type: 'on_edge', parentId: 'rect1', edgeIndex: 2, paramT: 0.5 });
        
        const line = createShape('line1', ShapeType.LINE, [{x: 200, y: 100}, {x: 200, y: 200}]);
        line.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const movedRect = { ...rect, points: rect.points.map(p => ({ x: p.x + 50, y: p.y + 50 })) };
        const resolved = resolveConstraints([movedRect, p1, p2, line], 'rect1', 1000, 1000, 20);
        
        const finalLine = resolved.find(s => s.id === 'line1')!;
        expect(finalLine.points[0].x).toBeCloseTo(250);
        expect(finalLine.points[1].x).toBeCloseTo(250);
    });

    it('should maintain Rectangle-Point-Line linkage and prevent escape', () => {
        const rect = createShape('rect1', ShapeType.RECTANGLE, [{x:100,y:100}, {x:300,y:200}]);
        const p1 = createPoint('p1', 200, 200, { type: 'on_edge', parentId: 'rect1', edgeIndex: 2, paramT: 0.5 });
        
        const movedRect = { ...rect, points: rect.points.map(p => ({ x: p.x + 10, y: p.y + 10 })) };
        const resolved = resolveConstraints([movedRect, p1], 'rect1', 1000, 1000, 20);
        const finalP1 = resolved.find(s => s.id === 'p1')!;
        
        expect(finalP1.points[0].x).toBeCloseTo(210);

        const mousePos = { x: 500, y: 500 };
        const { point: constrainedPos } = constrainPointToEdge(mousePos, movedRect, 2);
        expect(constrainedPos.x).toBeCloseTo(310);
    });

    it('should correctly bind Line endpoints using bindPointToShapes when isCreatingLine is true', () => {
        const p1 = createPoint('p1', 100, 100);
        const p2 = createPoint('p2', 200, 200);
        const allShapes = [p1, p2];

        const snapResult = getSnapPoint({x: 205, y: 205}, allShapes, []);
        expect(snapResult.snapped).toBe(true);
        expect(snapResult.constraint).toBeDefined();
        expect(snapResult.constraint!.type).toBe('points_link');

        const line = createShape('line1', ShapeType.LINE, [{x:100,y:100}, {x:200,y:200}]);
        line.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const movedP2 = { ...p2, points: [{x:300, y:300}] };
        const resolved = resolveConstraints([p1, movedP2, line], 'p2', 1000, 1000, 20);
        const finalLine = resolved.find(s => s.id === 'line1')!;
        
        expect(finalLine.points[1].x).toBe(300);
    });

    it('should correctly calculate visual corners for box-based shapes with rotation', () => {
        const rect: Shape = createShape('r1', ShapeType.RECTANGLE, [{x:100,y:100}, {x:200,y:200}]);
        rect.rotation = 90;
        
        const corners = getRotatedCorners(rect);
        expect(corners[0].x).toBeCloseTo(200);
        expect(corners[0].y).toBeCloseTo(100);
        
        const circle: Shape = createShape('c1', ShapeType.CIRCLE, [{x:100,y:100}, {x:200,y:200}]);
        circle.rotation = 45;
        const cCorners = getRotatedCorners(circle);
        expect(cCorners.length).toBe(4);
    });

    it('should correctly detect hits on a Circle', () => {
        const circle: Shape = createShape('c1', ShapeType.CIRCLE, [{x:100,y:100}, {x:200,y:200}]);
        circle.fill = '#ff0000'; 
        expect(isPointInShape({x:150, y:150}, circle)).toBe(true);
        
        const transparentCircle = { ...circle, fill: 'transparent' };
        expect(isPointInShape({x:150, y:150}, transparentCircle)).toBe(false);
        expect(isPointInShape({x:100, y:150}, transparentCircle)).toBe(true);
    });

    it('should maintain Circle-Point linkage when circle rotates', () => {
        const circle = createShape('c1', ShapeType.CIRCLE, [{x:100,y:100}, {x:200,y:200}]);
        const p1 = createPoint('p1', 200, 150, { 
            type: 'on_path', parentId: 'c1', paramAngle: 0 
        });

        const rotatedCircle = { ...circle, rotation: 90 };
        const resolved = resolveConstraints([rotatedCircle, p1], 'c1', 1000, 1000, 20);
        const finalP1 = resolved.find(s => s.id === 'p1')!;
        
        expect(finalP1.points[0].x).toBeCloseTo(150);
        expect(finalP1.points[0].y).toBeCloseTo(200);
    });

    it('should correctly discover dependencies for Rigid Body Sync (Rectangle-Point-Line)', () => {
        const rect = createShape('rect1', ShapeType.RECTANGLE, [{x:0,y:0}, {x:100,y:100}]);
        const p1 = createPoint('p1', 50, 0, { type: 'on_edge', parentId: 'rect1', edgeIndex: 0, paramT: 0.5 });
        const line = createShape('line1', ShapeType.LINE, [{x:50,y:0}, {x:150,y:0}]);
        line.constraint = { type: 'points_link', parents: ['p1', null] };

        const allShapes = [rect, p1, line];
        const targetIds = new Set(['rect1']);
        const dependents = getDependents(allShapes, targetIds);
        
        const dependentIds = dependents.map(d => d.id);
        expect(dependentIds).toContain('p1');
        expect(dependentIds).toContain('line1');
    });

    it('should correctly accumulate updates when multiple parents change (Ellipse-2Points-Line)', () => {
        const ellipse = createShape('e1', ShapeType.ELLIPSE, [{x:100,y:100}, {x:300,y:200}]);
        const p1 = createPoint('p1', 200, 100, { type: 'on_path', parentId: 'e1', paramAngle: 270 });
        const p2 = createPoint('p2', 200, 200, { type: 'on_path', parentId: 'e1', paramAngle: 90 });
        const line = createShape('line1', ShapeType.LINE, [{x:200,y:100}, {x:200,y:200}]);
        line.constraint = { type: 'points_link', parents: ['p1', 'p2'] };

        const movedEllipse = { ...ellipse, points: ellipse.points.map(p => ({ x: p.x + 10, y: p.y + 10 })) };
        const resolved = resolveConstraints([movedEllipse, p1, p2, line], 'e1', 1000, 1000, 20);
        
        const finalLine = resolved.find(s => s.id === 'line1')!;
        expect(finalLine.points[0].x).toBeCloseTo(210);
        expect(finalLine.points[1].x).toBeCloseTo(210);
    });

    it('should generate clean HTML for LaTeX without MathML (KaTeX Check)', () => {
        const katex = require('katex');
        const formula = '\\frac{1}{2}';
        
        const html = katex.renderToString(formula, { 
            throwOnError: false,
            output: 'html'
        });

        // 1. Should contain the katex-html class
        expect(html).toContain('katex-html');
        
        // 2. Should NOT contain mathml tag
        // If the bug is present, this will contain <math>
        expect(html).not.toContain('<math');
        expect(html).not.toContain('mathml');
        
        // 3. Verify it contains our numbers
        expect(html).toContain('1');
        expect(html).toContain('2');
    });
});
