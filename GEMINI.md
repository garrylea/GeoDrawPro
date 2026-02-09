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

