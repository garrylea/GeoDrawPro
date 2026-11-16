import { useRef, useCallback, MutableRefObject, RefObject } from 'react';
import { Shape, ShapeType, ToolType, TransientState } from '../types';
import { getDependents } from '../utils/constraintSystem';
import {
    buildShapeTransform, buildResetTransform, buildLineResetAttrs,
    isElasticLine, buildElasticLineAttrs
} from '../utils/transientTransform';

interface UseTransientTransformsDeps {
    shapesRef: MutableRefObject<Shape[]>;
    selectedIds: Set<string>;
    svgRef: RefObject<SVGSVGElement>;
    tool: ToolType;
}

/**
 * Transient DOM transform engine used during drag/resize/rotate gestures.
 * Moved verbatim from Editor.tsx (S3); only inline transform-string
 * computation is delegated to utils/transientTransform pure functions.
 */
export const useTransientTransforms = ({ shapesRef, selectedIds, svgRef, tool }: UseTransientTransformsDeps) => {
    // DIRECT DOM MANIPULATION REFS
    const transientStateRef = useRef<TransientState | null>(null);
    const domCacheRef = useRef<Map<string, Element>>(new Map());
    const initialShapeStateRef = useRef<Map<string, Shape>>(new Map()); // Snapshot for resize math

    const updateTransientVisuals = (state: TransientState | null) => {
        let overlay = domCacheRef.current.get('selection-overlay-group');
        if (!overlay || !overlay.isConnected) {
            overlay = document.getElementById('selection-overlay-group') || undefined;
            if (overlay) domCacheRef.current.set('selection-overlay-group', overlay);
        }

        if (!state) {
            domCacheRef.current.forEach((el, id) => {
                 const shape = shapesRef.current.find(s => s.id === id);
                 el.setAttribute('transform', buildResetTransform(shape));
                 // Reset elastic line changes
                 if (shape?.type === ShapeType.LINE) {
                     const line = el.querySelector('line');
                     if (line) {
                         buildLineResetAttrs(shape).forEach(a => line.setAttribute(a.name, a.value));
                     }
                 }
            });
            return;
        }

        domCacheRef.current.forEach((cachedEl, id) => {
            const isTracked = initialShapeStateRef.current.has(id) || id === 'selection-overlay-group';
            if (!isTracked) return;

            let el = cachedEl;
            if (!el.isConnected) {
                const liveEl = id === 'selection-overlay-group'
                    ? document.getElementById('selection-overlay-group')
                    : svgRef.current?.querySelector(`g[data-shape-id="${id}"]`);
                if (liveEl) {
                    domCacheRef.current.set(id, liveEl);
                    el = liveEl;
                } else {
                    return;
                }
            }

            const shape = shapesRef.current.find(s => s.id === id);

            // --- SELECTION OVERLAY SPECIAL HANDLING ---
            // If it's the overlay and we have a single selection, we must include the target shape's persistent rotation
            if (id === 'selection-overlay-group' && selectedIds.size === 1) {
                const singleId = Array.from(selectedIds)[0];
                const targetShape = shapesRef.current.find(s => s.id === singleId);
                if (targetShape) {
                    el.setAttribute('transform', buildShapeTransform(targetShape, state));
                    return;
                }
            }

            // --- RIGID BODY SYNC LOGIC ---
            // If we are moving a group (e.g. Triangle), and this shape is a dependent (Point/Line),
            // we should just apply the SAME global translation.
            // We only use 'Elastic' logic if the driver ITSELF is one of the linked parents.
            const isDirectlySelected = selectedIds.has(id);

            if (isElasticLine(shape, selectedIds) && !isDirectlySelected) {
                const line = el.querySelector('line');
                if (line) {
                    buildElasticLineAttrs(shape!, state, selectedIds).forEach(a => line.setAttribute(a.name, a.value));
                }
                return;
            }

            // For everything else (Triangle, or Point/Line being moved AS A DEPENDENT),
            // use rigid translation.
            el.setAttribute('transform', buildShapeTransform(shape, state));
        });
    };

    const refreshDomCache = useCallback((idsOverride?: Set<string>) => {
        domCacheRef.current.clear();
        initialShapeStateRef.current.clear();

        const targetIds = idsOverride || selectedIds;

        // 1. Add target shapes
        if (tool === ToolType.SELECT || tool === ToolType.RULER || tool === ToolType.PROTRACTOR) {
            shapesRef.current.forEach(s => {
                if (targetIds.has(s.id)) {
                     const el = svgRef.current?.querySelector(`g[data-shape-id="${s.id}"]`);
                     if (el) { domCacheRef.current.set(s.id, el); initialShapeStateRef.current.set(s.id, s); }
                }
            });

            // 2. Add dependent shapes (recursive)
            const dependents = getDependents(shapesRef.current, targetIds);
            dependents.forEach(s => {
                 const el = svgRef.current?.querySelector(`g[data-shape-id="${s.id}"]`);
                 if (el) { domCacheRef.current.set(s.id, el); initialShapeStateRef.current.set(s.id, s); }
            });

            const overlay = document.getElementById('selection-overlay-group');
            if (overlay) domCacheRef.current.set('selection-overlay-group', overlay);
        }
    }, [selectedIds, tool]);

    return { transientStateRef, domCacheRef, initialShapeStateRef, updateTransientVisuals, refreshDomCache };
};