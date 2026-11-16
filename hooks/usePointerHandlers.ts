import { createPointerHelpers } from './pointer/pointerHelpers';
import { createPointerDown } from './pointer/pointerDown';
import { createPointerMove } from './pointer/pointerMove';
import { createPointerUp } from './pointer/pointerUp';
import type { UsePointerHandlersDeps } from './pointer/pointerTypes';

export type { UsePointerHandlersDeps } from './pointer/pointerTypes';

/**
 * Pointer gesture handlers for the drawing canvas.
 * Originally moved verbatim from Editor.tsx (S7); split into hooks/pointer/*
 * (S10). Every factory is recreated each render — no useCallback, exactly as
 * before, so handler closures always see the current render's state.
 */
export const usePointerHandlers = (deps: UsePointerHandlersDeps) => {
  const helpers = createPointerHelpers(deps);
  const { handlePointerDown, handleDoubleClick } = createPointerDown(deps, helpers);
  const { handlePointerMove } = createPointerMove(deps);
  const { handlePointerUp } = createPointerUp(deps, helpers);

  return { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick, getMousePos: helpers.getMousePos };
};
