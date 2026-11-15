export const evaluateQuadratic = (
    x: number,
    params: { a?: number; b?: number; c?: number; h?: number; k?: number },
    form: 'standard' | 'vertex' = 'standard',
    type: 'quadratic' | 'linear' = 'quadratic'
): number => {
    if (!params) return 0;
    if (type === 'linear') {
        const slope = params.k ?? 1;
        const intercept = params.b ?? 0;
        return slope * x + intercept;
    }
    if (form === 'vertex') {
        const h = params.h || 0;
        const k = params.k || 0;
        const a = params.a ?? 1;
        return a * Math.pow(x - h, 2) + k;
    } else {
        const a = params.a ?? 1;
        const b = params.b || 0;
        const c = params.c || 0;
        return a * x * x + b * x + c;
    }
};

export const generateQuadraticPath = (
    params: { a?: number; b?: number; c?: number; h?: number; k?: number },
    form: 'standard' | 'vertex',
    width: number,
    height: number,
    ppu: number,
    type: 'quadratic' | 'linear' = 'quadratic',
    originY?: number
): string => {
    if (!ppu || ppu <= 0) return "";
    if (!params) params = { a: 1, b: 0, c: 0, k: 1 };

    const centerY = originY ?? (height / 2);

    if (type === 'linear') {
        const minScreenX = -50;
        const maxScreenX = width + 50;
        const mx1 = (minScreenX - (width / 2)) / ppu;
        const my1 = evaluateQuadratic(mx1, params, form, 'linear');
        const sy1 = centerY - my1 * ppu;
        const mx2 = (maxScreenX - (width / 2)) / ppu;
        const my2 = evaluateQuadratic(mx2, params, form, 'linear');
        const sy2 = centerY - my2 * ppu;
        if (!isFinite(sy1) || !isFinite(sy2)) return "";
        return `M ${minScreenX} ${sy1} L ${maxScreenX} ${sy2}`;
    }

    const minScreenX = -50;
    const maxScreenX = width + 50;
    const pixelStep = 4;
    let d = "";
    let first = true;

    for (let sx = minScreenX; sx <= maxScreenX; sx += pixelStep) {
        const mx = (sx - (width / 2)) / ppu;
        const my = evaluateQuadratic(mx, params, form, 'quadratic');
        const sy = centerY - my * ppu;
        if (!isFinite(sy) || sy < -height * 5 || sy > height * 5) {
            first = true;
            continue;
        }
        if (first) {
            d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
            first = false;
        } else {
            d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
    }
    return d;
};

export const standardToVertex = (a: number, b: number, c: number): { h: number, k: number } => {
    // h = -b / 2a
    // k = c - b^2 / 4a
    if (a === 0) return { h: 0, k: c }; // Degenerate case, though a shouldn't be 0 for quadratic
    const h = -b / (2 * a);
    const k = c - (b * b) / (4 * a);
    return { h, k };
};

export const vertexToStandard = (a: number, h: number, k: number): { b: number, c: number } => {
    // y = a(x-h)^2 + k = a(x^2 - 2hx + h^2) + k = ax^2 - 2ahx + ah^2 + k
    // b = -2ah
    // c = ah^2 + k
    const b = -2 * a * h;
    const c = a * h * h + k;
    return { b, c };
};