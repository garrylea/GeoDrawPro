import { Shape, ShapeType } from '../types';

export const generateStressShapes = (count: number): Shape[] => {
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const shapes: Shape[] = [];
    for (let i = 0; i < count; i++) {
        const x = 100 + rand() * 1400;
        const y = 100 + rand() * 1200;
        const w = 40 + rand() * 120;
        const h = 40 + rand() * 120;
        const base = { id: `stress-${i}`, fill: 'transparent', stroke: '#334155', strokeWidth: 2, rotation: 0 };
        const kind = i % 4;
        if (kind === 0) shapes.push({ ...base, type: ShapeType.LINE, points: [{ x, y }, { x: x + w, y: y + h }] });
        else if (kind === 1) shapes.push({ ...base, type: ShapeType.TRIANGLE, points: [{ x, y }, { x: x + w, y }, { x: x + w / 2, y: y + h }] });
        else if (kind === 2) shapes.push({ ...base, type: ShapeType.CIRCLE, points: [{ x, y }, { x: x + w, y: y + w }] });
        else shapes.push({ ...base, type: ShapeType.TEXT, points: [{ x, y }], text: `T${i}`, fontSize: 16 });
    }
    return shapes;
};