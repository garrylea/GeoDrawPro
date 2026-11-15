import { Shape, ShapeType } from '../types';

export const getNextLabels = (shapes: Shape[], count: number): string[] => {
    const used = new Set<string>();
    shapes.forEach(s => {
        if (s.labels) s.labels.forEach(l => used.add(l));
        if (s.type === ShapeType.TEXT && s.text && s.text.length <= 2) used.add(s.text);
    });
    const result: string[] = [];
    let i = 0;
    while (result.length < count && i < 1000) {
        const charCode = 65 + (i % 26);
        let label = String.fromCharCode(charCode);
        const cycle = Math.floor(i / 26);
        if (cycle > 0) label += cycle;
        if (!used.has(label)) { result.push(label); used.add(label); }
        i++;
    }
    return result;
};