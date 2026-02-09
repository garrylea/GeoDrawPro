# Project Lessons & Fixes

## 背景

这是一个完整的初中数学几何绘图工具。

包括了以下功能：
1. 绘制基本图形：点，线段，正方形，矩形，三角形，圆形，椭圆
2. 绘制一次函数直线，绘制二次函数曲线
3. 可以对基本图形做旋转、缩放、平移等操作
4. 除了基本图形外，还可以选中图形，使用橡皮擦除绘制的图形和涂鸦，利用画笔进行涂o鸦
5. 测量和绘制工具：半圆仪、直尺、量角器
6. 打开图片，自定义文档
7. 导出图标，导出图片
8. 保存自定义文件
9. Undo，delete, clear All
10. stmart tools, stroke, fill,coordinates


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

### 3. Pressure Pen Toggle Ineffectiveness (2026-02-09)
**Problem:** The "Pressure Pen" toggle in SMART Tools was not working as expected; lines drawn with a pressure-sensitive pen would still show variable width even when pressure was disabled.
**Cause:** In `ShapeRenderer.tsx`, the logic for freehand shapes used `(usePressure || hasPressureData)`. Since most pen-drawn points have pressure data (p != 0.5), `hasPressureData` was always true, overriding the `usePressure: false` flag set by the toggle.
**Fix:** Updated the rendering logic to prioritize the `usePressure` flag. If `usePressure` is explicitly set to `true` or `false`, it is respected. Only if `usePressure` is `undefined` (legacy data) does it fall back to checking `hasPressureData`.
**Lesson:** When providing an explicit control flag for a feature, ensure that feature detection logic does not override the user's explicit preference.

### 4. Right-Click Scrolling Interruption (2026-02-09)
**Problem:** The right-click drag gesture to scroll (flip pages) would stop working if the mouse cursor moved outside the SVG canvas area, making navigation difficult on smaller screens or when dragging near edges.
**Cause:** The `pointerdown` event handler for the right mouse button did not explicitly capture the pointer (`setPointerCapture`). Consequently, when the cursor left the element, the browser stopped sending `pointermove` events to the handler, and `pointerleave` would often trigger `handlePointerUp`, prematurely ending the scroll.
**Fix:** Added `setPointerCapture(e.pointerId)` to `handlePointerDown` when the right mouse button is pressed, and `releasePointerCapture(e.pointerId)` to `handlePointerUp`. This ensures the scrolling gesture persists even if the cursor moves outside the canvas boundaries.

### 5. PDF Background Interfering with Selection (2026-02-09)
**Problem:** When a large PDF is loaded as an background IMAGE, trying to draw a selection box over annotations would instead trigger a move/drag action on the PDF itself, making it impossible to bulk-select annotations.
**Solution:** Implemented "Lock Background + Smart Penetration" logic.
1. Added a **"Lock BG"** toggle in SMART Tools (enabled by default when PDF is loaded).
2. When locked, clicking the **center area** (>15px from edge) of an IMAGE does not select it, allowing the pointer events to "penetrate" through to the canvas to start a selection rectangle.
3. Clicking near the **edges** of the locked IMAGE still allows selecting and moving it.
**Benefit:** Users can easily select multiple annotations on top of a PDF without needing to manually lock/unlock layers constantly.

### 6. Hollow Selection for Transparent Shapes (2026-02-09)
**Problem:** For closed shapes like triangles or circles, users would accidentally select or erase them when trying to interact with annotations inside the shape, because clicking anywhere in the interior was considered a "hit".
**Solution:** Implemented "Hollow Selection" logic.
- If a shape's **fill** is set to `transparent`, it is no longer selectable by its interior. Only clicking/erasing near its **edges** will trigger a hit.
- If a shape has a visible **fill color**, it remains selectable by its entire area.
- Functional tools (Text, Images, Rulers) remain selectable by their interior for ease of use.
**Benefit:** Allows users to freely draw and erase annotations inside large geometric shapes without fear of accidentally moving or deleting the background shape.

