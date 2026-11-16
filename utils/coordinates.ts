import { Point } from '../types';

export const getPixelsPerUnit = (width: number, height: number, ticks: number) => {
    if (width <= 0 || height <= 0) return 40;
    const minDimension = Math.min(width, height);
    const targetPPU = (minDimension / 2) / (ticks || 5);
    const minPPU = 20;
    const maxPPU = minDimension / 2;
    return Math.min(Math.max(targetPPU, minPPU), Math.max(minPPU, maxPPU));
};

export const screenToMath = (p: Point, width: number, height: number, ppu: number, originY?: number): Point => {
    if (ppu <= 0) return { x: 0, y: 0 };
    const centerX = width / 2;
    const centerY = originY ?? (height / 2);
    return {
        x: (p.x - centerX) / ppu,
        y: -(p.y - centerY) / ppu
    };
};

export const mathToScreen = (p: Point, width: number, height: number, ppu: number, originY?: number): Point => {
    const centerX = width / 2;
    const centerY = originY ?? (height / 2);
    return {
        x: centerX + p.x * ppu,
        y: centerY - p.y * ppu
    };
};

export const clientToCanvas = (e: { clientX: number; clientY: number }, svg: SVGSVGElement, zoom: number): Point => {
    const rect = svg.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
};