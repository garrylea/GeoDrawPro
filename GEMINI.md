# Project Lessons & Fixes

## Bug Fixes

### 1. Rotation Reset During Resize (2026-01-20)
**Problem:** Rotating a shape and then resizing it caused the rotation to visually reset to 0, even though the state correctly maintained the rotation value.
**Cause:** The `Editor.tsx` used direct DOM manipulation for performance (Transient State) during dragging. On `pointerup`, it called `updateTransientVisuals(null)` which executed `el.setAttribute('transform', '')`. This manually cleared the SVG transform on the DOM. Because React's virtual DOM still thought the transform was `rotate(45 ...)`, it didn't trigger a DOM update to restore it, leaving the shape visually unrotated.
**Fix:** Updated `updateTransientVisuals` to restore the shape's persistent rotation transform instead of blindly clearing it when the transient state is null.
**Lesson:** When mixing direct DOM manipulation with React, ensure that the "reset" state of manual manipulation matches the current React state to prevent desynchronization between the real DOM and the Virtual DOM.

### 2. Selection Overlay Desynchronization (2026-01-20)
**Problem:** After fixing the shape rotation reset issue, the selection overlay (handles/bounding box) would incorrectly snap to 0 rotation after a resize, separating from the rotated shape.
**Cause:** The previous fix only restored the transform for shape elements (identified by ID in `shapes`). The selection overlay (`selection-overlay-group`) was still being reset to an empty transform because it wasn't recognized as a shape.
**Fix:** Extended the `updateTransientVisuals` cleanup logic to explicitly handle `selection-overlay-group`, calculating and restoring the correct rotation transform based on the selected shape's state.

