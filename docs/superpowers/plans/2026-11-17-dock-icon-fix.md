# macOS Dock 图标修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 GeoDraw Pro 在 macOS 启动时显式设置自己的 Dock 图标，使 Dock 条目不再因 LaunchServices/IconServices 解析失败而渲染成 0 宽度（图标不可见）。

**Architecture:** 全部改动集中在主进程 `electron/main.js`：新增统一的图标路径常量与 `applyDockIcon()`，在 `app.whenReady()` 的 darwin 分支调用 `app.dock.setIcon(nativeImage.createFromPath(...))`；同时删除两处无效的 `app.dock.show()`。`nativeImage` 为空时只记日志并退回系统默认解析，不阻塞启动。

**Tech Stack:** Electron 31（主进程 CommonJS）、electron-builder（dmg）、macOS LaunchServices/IconServices。

## Global Constraints

- 只修改 `electron/main.js`；不改 `package.json`、打包配置、依赖、渲染层代码。
- Dock 图标源固定为 `public/icon.png`（512×512 RGBA），打包后位于 `app.asar/public/icon.png`。
- 图标处理失败必须静默降级（仅 `log()`），不得抛错、不得阻塞窗口创建。
- 不新增 npm 依赖；不改单实例策略（允许开多实例是既有设计）。
- 不修改 Windows/Linux 行为：`BrowserWindow.icon` 仍使用同一 PNG 常量。
- 提交直接在 `main` 分支，消息用英文 conventional commit。
- 主进程不在 vitest 覆盖范围：本计划的自动化验证是 `node --check` + dev 模式实机检查；最终以手工验收为准。

**设计文档：** `docs/superpowers/specs/2026-11-17-dock-icon-design.md`

---

## File Structure

| 文件 | 职责 | 本次改动 |
|---|---|---|
| `electron/main.js` | Electron 主进程：窗口、Dock、IPC、协议 | 新增 `APP_ICON_PATH`、解构 `nativeImage`、新增 `applyDockIcon()`、`whenReady` 调用、`createWindow` 复用常量、删除两处 `app.dock.show()` |

不新增文件、不新增测试文件（主进程无测试基建）。`release/` 产物不提交。

---

## Task 1: 主进程显式设置 Dock 图标

**Files:**
- Modify: `electron/main.js:1`（electron 解构）
- Modify: `electron/main.js:12-14`（常量区）
- Modify: `electron/main.js:64-74`（`whenReady` 的 darwin 分支）
- Modify: `electron/main.js:77-93`（`createWindow` 的 icon 选项）
- Modify: `electron/main.js:107-113`（`ready-to-show` 内删除 `dock.show()`）
- Modify: `electron/main.js:52-77`（在 `log()` 与 `createWindow` 之间新增 `applyDockIcon`）
- Modify: `electron/main.js:233-238`（`app.on('ready')` 内删除 `dock.show()`）

**Interfaces:**
- Consumes: 无（本任务是最底层改动）
- Produces: `applyDockIcon(): void`（主进程内部函数，仅本文件调用）、`APP_ICON_PATH: string`（绝对路径常量，供 `createWindow` 与 `applyDockIcon` 共用）

- [ ] **Step 1: 确认当前文件状态**

运行：

```bash
cd /Users/lichao/Downloads/GeoDrawPro && sed -n '1,20p;60,120p;228,240p' electron/main.js
```

预期：看到 `require('electron')` 解构（第 1 行）、`DEV_SERVER_URL` 常量（12-14 行）、`app.whenReady().then(...)`（52 行起，内部含 `if (process.platform === 'darwin')` 与 `app.dock.setMenu(dockMenu)`）、`createWindow` 内的 `const iconPath = path.join(__dirname, '..', 'public', 'icon.png');`、以及 `app.dock.show()` 出现的两处（约 111 行、234 行）。若行号有偏移，按内容定位。

- [ ] **Step 2: 解构 `nativeImage`**

把第 1 行改成（仅在末尾追加 `nativeImage`）：

```js
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer, screen, protocol, Menu, nativeImage } = require('electron');
```

- [ ] **Step 3: 新增图标路径常量**

在 `const DEV_SERVER_URL = 'http://localhost:5273';` 之后空一行加入：

```js
// App icon for the window (Windows/Linux) and the macOS Dock tile.
// public/icon.png ships inside app.asar, so this resolves in dev and packaged builds.
const APP_ICON_PATH = path.join(__dirname, '..', 'public', 'icon.png');
```

- [ ] **Step 4: 新增 `applyDockIcon()`**

在 `log()` 函数定义结束（`}`，约第 50 行）与 `app.whenReady()` 之间插入：

```js
function applyDockIcon() {
    if (process.platform !== 'darwin' || !app.dock) return;
    try {
        const image = nativeImage.createFromPath(APP_ICON_PATH);
        if (image.isEmpty()) {
            log(`Dock icon not found at ${APP_ICON_PATH}, falling back to bundle icon`);
            return;
        }
        app.dock.setIcon(image);
        log('Dock icon applied');
    } catch (error) {
        log(`Failed to apply dock icon: ${error && error.message}`);
    }
}
```

- [ ] **Step 5: 在 `whenReady` 的 darwin 分支调用**

把：

```js
    if (process.platform === 'darwin') {
        const dockMenu = Menu.buildFromTemplate([
```

改成：

```js
    if (process.platform === 'darwin') {
        applyDockIcon();

        const dockMenu = Menu.buildFromTemplate([
```

- [ ] **Step 6: `createWindow` 复用常量**

把：

```js
function createWindow(existingFilePath = null) {
  const isDev = !app.isPackaged;
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');

  let win = new BrowserWindow({
    width: 1400,
    height: 1000,
    title: "GeoDraw Pro",
    icon: iconPath, 
```

改成：

```js
function createWindow(existingFilePath = null) {
  const isDev = !app.isPackaged;

  let win = new BrowserWindow({
    width: 1400,
    height: 1000,
    title: "GeoDraw Pro",
    icon: APP_ICON_PATH,
```

- [ ] **Step 7: 删除 `ready-to-show` 内的 `dock.show()`**

把：

```js
  win.once('ready-to-show', () => {
    win.maximize(); // Fill the screen (excluding OS bars)
    win.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
    win.focus();
```

改成：

```js
  win.once('ready-to-show', () => {
    win.maximize(); // Fill the screen (excluding OS bars)
    win.show();
    win.focus();
```

- [ ] **Step 8: 删除 `app.on('ready')` 内的 `dock.show()`**

把：

```js
    if (process.platform === 'darwin') {
        app.dock.show();
        app.focus({ steal: true });
    } else {
```

改成：

```js
    if (process.platform === 'darwin') {
        app.focus({ steal: true });
    } else {
```

- [ ] **Step 9: 语法检查**

运行：

```bash
cd /Users/lichao/Downloads/GeoDrawPro && node --check electron/main.js && grep -n "dock.show\|APP_ICON_PATH\|applyDockIcon" electron/main.js
```

预期：`node --check` 无输出（退出码 0）；`grep` 只剩 `APP_ICON_PATH`（2 处：定义 + `createWindow`）、`applyDockIcon`（2 处：定义 + 调用），**不再出现 `dock.show`**。

- [ ] **Step 10: 跑既有单测确认无连带破坏**

运行：

```bash
cd /Users/lichao/Downloads/GeoDrawPro && npm test
```

预期：全部通过（该套件不覆盖主进程，此步只确认没有误改到渲染层文件）。

- [ ] **Step 11: dev 模式实机验证（关键：证明图标不再依赖 bundle）**

依次运行：

```bash
cd /Users/lichao/Downloads/GeoDrawPro
npm run dev > /tmp/geodraw-vite.log 2>&1 &
sleep 5
npx electron . > /tmp/geodraw-electron.log 2>&1 &
sleep 8
grep -n "Dock icon applied" /tmp/geodraw-electron.log
osascript -e 'tell application "System Events" to tell process "Dock" to get {position, size} of (first UI element of list 1 whose name is "Electron")'
```

预期：
- 日志出现 `[MainProcess] Dock icon applied`
- Dock 里 `Electron` 条目尺寸形如 `xxx, 999, 60, 76`（宽度必须为 60，不能是 0）
- 肉眼确认 dev 窗口对应的 Dock 图标是 GeoDraw 蓝色圆形 logo，而不是 Electron 默认图标 —— 这一步就证明了 `setIcon` 不依赖 `.app` bundle 里的 icon 资源

若 Dock 条目名不是 `Electron`，先运行下面命令拿到真实名称再重试最后一条：

```bash
osascript -e 'tell application "System Events" to tell process "Dock" to get name of every UI element of list 1'
```

- [ ] **Step 12: 清理 dev 进程**

```bash
pkill -f "electron \." ; pkill -f "node_modules/.bin/vite"; sleep 1; pgrep -lf "electron \.|node_modules/.bin/vite" || echo "clean"
```

预期：输出 `clean`（或仅剩与本任务无关的进程）。

- [ ] **Step 13: 提交**

```bash
cd /Users/lichao/Downloads/GeoDrawPro
git add electron/main.js
git commit -m "fix: set an explicit dock icon on macOS

The Dock tile could render with zero width (invisible icon) when
LaunchServices resolved com.geodraw.pro to a stale bundle record.
Set the icon from app.asar/public/icon.png at startup so the tile no
longer depends on bundle icon resolution, and drop the redundant
app.dock.show() calls that re-create the activation policy."
```

预期：提交成功，`git status` 干净。

---

## Task 2: 打包构建 + 完整验收

**Files:**
- 不修改源码（只构建、安装、验证）
- 产物：`release/GeoDraw Pro-1.0.0-arm64.dmg`、`release/mac-arm64/GeoDraw Pro.app`（`.gitignore` 已排除，不提交）

**Interfaces:**
- Consumes: Task 1 产出的 `applyDockIcon()` 与 `APP_ICON_PATH`
- Produces: 验收结论（通过/不通过 + 证据）

- [ ] **Step 1: 构建 dmg**

运行（耗时数分钟，用后台任务跑）：

```bash
cd /Users/lichao/Downloads/GeoDrawPro && npm run electron:build > /tmp/geodraw-build.log 2>&1; echo "exit=$?"
```

预期：`exit=0`，日志末尾出现 `building  target=DMG` / `building  blockMap`，`release/GeoDraw Pro-1.0.0-arm64.dmg` 时间戳更新。

- [ ] **Step 2: 覆盖安装到 /Applications**

```bash
pkill -f "GeoDraw Pro.app/Contents/MacOS/GeoDraw Pro" || true
rm -rf "/Applications/GeoDraw Pro.app"
cp -R "/Users/lichao/Downloads/GeoDrawPro/release/mac-arm64/GeoDraw Pro.app" "/Applications/GeoDraw Pro.app"
ls -la "/Applications/GeoDraw Pro.app/Contents/Resources/icon.icns"
```

预期：`icon.icns` 存在（335928 字节）。

- [ ] **Step 3: 首次启动并核对 Dock 条目尺寸**

```bash
open -a "/Applications/GeoDraw Pro.app"
sleep 6
osascript -e 'tell application "System Events" to tell process "Dock" to get {position, size} of (first UI element of list 1 whose name is "GeoDraw Pro")'
```

预期：`position` 任意，`size` 为 `60, 76`（**宽度 0 或高度 16 即失败**）。同时截图确认图标为蓝色圆形 logo：

```bash
screencapture -x /tmp/acceptance-dock.png
python3 -c "
from PIL import Image
im = Image.open('/tmp/acceptance-dock.png'); w, h = im.size
im.crop((0, h-170, w, h-10)).save('/tmp/acceptance-dock-strip.png')
print('saved')
"
```

- [ ] **Step 4: 关键回归——bundle 图标不可用时仍显示**

```bash
pkill -f "GeoDraw Pro.app/Contents/MacOS/GeoDraw Pro" || true
rm -rf /tmp/iconless.app
cp -R "/Applications/GeoDraw Pro.app" /tmp/iconless.app
: > "/tmp/iconless.app/Contents/Resources/icon.icns"
codesign --force --deep -s - /tmp/iconless.app 2>&1 | tail -2
open /tmp/iconless.app
sleep 6
osascript -e 'tell application "System Events" to tell process "Dock" to get {position, size} of (first UI element of list 1 whose name is "GeoDraw Pro")'
```

预期：条目尺寸仍为 `60, 76`，图标可见（来自 asar 内 PNG）。
若 `open` 报签名/损坏错误、应用起不来，则该项标记为"无法验证（签名限制）"，改用 Step 5 的等价证据，并在验收记录里写明原因，不要为绕过签名而改系统设置。

- [ ] **Step 5: dev 模式等价证据（若 Step 4 受限）**

```bash
cd /Users/lichao/Downloads/GeoDrawPro
npm run dev > /tmp/geodraw-vite.log 2>&1 &
sleep 5
npx electron . > /tmp/geodraw-electron.log 2>&1 &
sleep 8
grep -n "Dock icon applied" /tmp/geodraw-electron.log
pkill -f "electron \."; pkill -f "node_modules/.bin/vite"
```

预期：`Dock icon applied` 出现；dev 的 Dock 图标为 GeoDraw logo（Electron 自身 bundle 图标被覆盖）→ 等价证明不依赖 bundle 图标。

- [ ] **Step 6: 降级路径验证**

```bash
cd /Users/lichao/Downloads/GeoDrawPro
mv public/icon.png /tmp/icon.png.bak
npm run dev > /tmp/geodraw-vite2.log 2>&1 &
sleep 5
npx electron . > /tmp/geodraw-electron2.log 2>&1 &
sleep 8
grep -n "Dock icon not found" /tmp/geodraw-electron2.log
pkill -f "electron \."; pkill -f "node_modules/.bin/vite"; sleep 1
mv /tmp/icon.png.bak public/icon.png
ls -la public/icon.png
```

预期：日志出现 `Dock icon not found at .../public/icon.png, falling back to bundle icon`，应用仍正常打开窗口；`public/icon.png` 已还原（37270/67154 字节，若大小变化需 `git status` 确认未被改动）。

- [ ] **Step 7: 多实例不回归**

```bash
pkill -f "GeoDraw Pro.app/Contents/MacOS/GeoDraw Pro" || true
open -n -a "/Applications/GeoDraw Pro.app"; sleep 4
open -n -a "/Applications/GeoDraw Pro.app"; sleep 5
osascript -e 'tell application "System Events" to tell process "Dock" to set acc to ""
repeat with e in UI elements of list 1
try
if (name of e) is "GeoDraw Pro" then
set s to size of e
set acc to acc & "[" & (item 1 of s) & "x" & (item 2 of s) & "]"
end if
end try
end repeat
return acc'
pkill -f "GeoDraw Pro.app/Contents/MacOS/GeoDraw Pro"
```

预期：输出两个 `[60x76]`；结束后进程已清理。

- [ ] **Step 8: 清理临时产物并确认工作区干净**

```bash
rm -rf /tmp/iconless.app
cd /Users/lichao/Downloads/GeoDrawPro && git status --short
```

预期：无输出（`release/` 已被忽略）。

- [ ] **Step 9: 记录验收结果**

在回复里列出 1-8 的实际输出摘要；若任一项失败，回到 Task 1 修复后重跑，不要跳过。

---

## 自检

| 设计条目 | 覆盖任务 |
|---|---|
| 统一 `APP_ICON_PATH` 常量，`createWindow` 复用 | Task 1 Step 3、6 |
| 新增 `applyDockIcon()`（`isEmpty` 兜底 + try/catch） | Task 1 Step 4 |
| `whenReady` darwin 分支调用 | Task 1 Step 5 |
| 删除两处 `app.dock.show()` | Task 1 Step 7、8 |
| 不改 package.json / 打包配置 / 依赖 / 单实例策略 | Global Constraints（无对应任务，符合非目标） |
| 图标清晰度（512px 覆盖 Retina Dock） | Task 1 Step 11 肉眼确认；无需额外资源 |
| 失败可观测、可降级 | Task 2 Step 6 |
| 不受 bundle 图标解析影响（关键回归） | Task 2 Step 4 / 5 |
| 多实例行为不变 | Task 2 Step 7 |
| README 排障说明 | **未包含**（用户未定，属非目标；如需要追加一个纯文档任务） |
