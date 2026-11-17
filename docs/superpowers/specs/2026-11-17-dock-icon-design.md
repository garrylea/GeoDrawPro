# macOS Dock 图标不可见问题修复设计

日期：2026-11-17
状态：待审核

## 背景与问题

用户反馈：安装 App 后打开，任务栏（macOS Dock）里看不到 GeoDraw Pro 的图标。

已确认为 **macOS 版**（`release/GeoDraw Pro-1.0.0-arm64.dmg`，即 `release/mac-arm64/GeoDraw Pro.app`，并已安装到 `/Applications`）。

### 复现与证据

在本机把 `/Applications/GeoDraw Pro.app` 启动后观察到：

| 观察项 | 结果 |
|---|---|
| 进程状态 | `lsappinfo`：`ApplicationType = Foreground`，`System Events` 读到 1 个窗口 |
| Dock 条目 | 辅助功能树里存在名为 `GeoDraw Pro` 的 `AXApplicationDockItem` |
| Dock 条目尺寸 | **0×16**（相邻条目均为 60×76），即条目不占宽度、图标区完全没有绘制 |
| 截图 | Dock 上「预览」与「微信」直接相邻，中间没有 GeoDraw 图标 |
| `killall Dock` 之后 | 同一条目立即恢复为 60×76，图标正常显示 |
| 之后复测 | `/Applications` 副本、`release` 副本、双实例、跨路径双实例共 6+ 次启动，均正常（60×76） |

### 已排除的原因

| 怀疑点 | 结论 |
|---|---|
| 图标资源损坏 | `public/icon.icns` 结构完整：`icp4/icp5/icp6/ic07/ic08/ic09/ic10` 共 7 档（16→1024），每档 PNG 实际像素尺寸与类型匹配，`iconutil` 可正常还原 |
| 打包漏掉图标 | `Contents/Resources/icon.icns` 存在，与 `release/mac-arm64` 内文件 MD5 一致；`app.asar` 内 `/public/icon.png` 也在 |
| `Info.plist` 配置 | `CFBundleIconFile = icon.icns`，无 `LSUIElement` / `LSBackgroundOnly`，`NSPrincipalClass = AtomApplication` |
| 文件关联图标 | `CFBundleTypeIconFile = icon.png`，`Resources/icon.png` 实际存在，正常 |
| 主进程隐藏 Dock | 全仓库搜索无 `app.dock.hide()` / `skipTaskbar`（主窗口）/ `setActivationPolicy` |

### 根因分析

**已证实**：Dock 条目被创建但宽度为 0，说明 Dock 没能拿到该条目的图标图像；这是 macOS 侧的图标解析/缓存问题，不是图标文件本身的问题。`killall Dock` 重建条目后恢复。

**线索**：LaunchServices 数据库里 `com.geodraw.pro` 存在指向失效路径的注册记录：

- `/Users/lichao/.Trash/GeoDraw Pro.app` —— `Bundle node not found`，标记 `trash`、`launch-disabled`、`no-executable`
- `/Volumes/GeoDraw Pro 1.0.0-arm64/GeoDraw Pro.app` —— 该 DMG 已卸载

即：应用身份（bundle id）在系统里对到了"已经不存在的旧副本"，Dock 按 bundle id 取图标时命中脏记录，取不到图标，于是渲染成 0 宽的空条目。这类状态在重复安装、把旧版本拖进废纸篓（或从 DMG 里直接启动）后很常见，且通常要重启 Dock/重新登录才自愈。

**未证实但成立的工程判断**：应用本身从未设置过自己的 Dock 图标，完全依赖系统按 bundle 解析 `icon.icns`。一旦解析链路（LaunchServices 记录 / IconServices 缓存）出现脏状态，应用没有任何兜底，图标就彻底不可见。

> 注：本次复现只出现过一次，之后多次启动未能稳定重现 0×16 状态，因此不做"某段代码 100% 触发"的断言；本设计针对的是"解析失败时没有兜底"这个确定的缺陷。

## 目标

- App 启动后 Dock 图标始终可见，不再依赖 LaunchServices/IconServices 对 bundle 图标的解析结果
- 图标清晰度满足 Retina Dock（最大 128pt，即 256px@2x）
- 解析失败时可观测（主进程日志），且降级后行为与现状一致（不崩、不阻塞启动）
- Windows / Linux 行为不变

## 非目标

- 不修改单实例策略（`electron/main.js:41` 明确移除单实例锁是刻意设计，本次不动）
- 不处理"多实例 → 多个 Dock 图标"的既有行为（见风险表，另行讨论）
- 不在运行时清理 LaunchServices 数据库（`lsregister` 属于用户环境操作，写入文档即可）
- 不改图标美术、不改打包配置（`mac.icon`、`fileAssociations` 均保持）
- 不解决 Windows 任务栏图标问题（本次已确认用户使用 macOS 版）

## 方案选择

| 方案 | 做法 | 结论 |
|---|---|---|
| **A** | 启动时 `nativeImage.createFromPath(public/icon.png)` + `app.dock.setIcon()` | **采用**。图标由应用自己提供，完全绕开系统解析；改动集中在主进程一处；失败时可用 `isEmpty()` 检测并保留原行为 |
| B | 只删除冗余的 `app.dock.show()`，依赖系统解析 | 不采用。无法解释/修复"解析失败即不可见"的缺陷，等于碰运气 |
| C | 启动时执行 `killall Dock` 或 `lsregister -f` | 不采用。副作用大（会重启用户的 Dock、重建整个 LS 库），应用无权重启系统组件 |

方案 A 的图标源选择：使用 `public/icon.png`（512×512 RGBA，已在 asar 内）。Dock 图标最大显示 128pt，512px 足以覆盖 256px@2x，无需额外生成 1024 资源；`nativeImage` 对 asar 内 PNG 的读取是 Electron 支持的能力。

## 模块设计

只改 `electron/main.js`。

### 1. 统一图标路径常量

在文件头部（`DEV_SERVER_URL` 附近）新增：

```js
const APP_ICON_PATH = path.join(__dirname, '..', 'public', 'icon.png');
```

`createWindow()` 里现有的局部变量 `iconPath`（`electron/main.js:79`）改为直接使用该常量，避免路径重复定义。作用不变：仍只对 Windows/Linux 生效。

### 2. 新增 `applyDockIcon()`

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

- `nativeImage` 从 `electron` 解构新增（第 1 行 `require`）
- `app.dock` 存在性判断兼容非 macOS 构建（虽然前面已按 platform 短路）
- 任何异常都只记日志，不影响启动

### 3. 调用时机

在 `app.whenReady().then()` 的 darwin 分支里（`electron/main.js:66-74`），**在** `app.dock.setMenu(dockMenu)` **之前**调用 `applyDockIcon()`：

```js
if (process.platform === 'darwin') {
    applyDockIcon();                       // 新增
    const dockMenu = Menu.buildFromTemplate([...]);
    app.dock.setMenu(dockMenu);
}
```

此时 `app` 已 ready、Dock 条目尚未被用户操作重建，是最早且安全的时机；不需要等到 `ready-to-show`。

### 4. 删除冗余的 `app.dock.show()`

- `electron/main.js:110-112`（`ready-to-show` 内）删除 `if (process.platform === 'darwin') { app.dock.show(); }`
- `electron/main.js:233-235`（`app.on('ready')` 内）删除 `app.dock.show();`，保留 `app.focus({ steal: true })`

理由：应用从未调用 `app.dock.hide()`，`show()` 是无效调用；而 `show()` 走的是 `setActivationPolicy(Regular)`，在部分 macOS 版本上会触发 Dock 条目重建，是与"条目重建后丢图标"最接近的可疑调用。删除后启动路径不再触碰激活策略，只保留一次显式 `setIcon`。

> 说明：这条属于"降低复发概率 + 去噪"，并非已证实的根因；即使它无害，删除也不改变可见行为。

## 启动时序

```
app ready
  └─ protocol.handle('app-screenshot')
  └─ darwin?
       ├─ applyDockIcon()          // 新增：显式设置 Dock 图标
       └─ app.dock.setMenu(...)
  └─ createWindow()
       └─ ready-to-show → maximize / show / focus   // 不再调用 dock.show()
  └─ createSnippetWindow()        // skipTaskbar 仅影响 Windows 任务栏，macOS 无感
```

## 错误处理

| 场景 | 行为 |
|---|---|
| `public/icon.png` 缺失或不可解码 | `nativeImage.isEmpty()` → 记日志、跳过 `setIcon`，退回系统按 bundle 解析（与现状一致） |
| `app.dock` 不存在（非 darwin / 异常环境） | 直接返回 |
| `setIcon` 抛异常 | `try/catch` 记日志，启动继续 |

不引入用户可见的错误提示：Dock 图标缺失属于环境问题，弹窗反而干扰。

## 测试

`electron/main.js` 不在 vitest 覆盖范围（沿用 HEIC 设计的处理方式），本次同样以手工验收为准；不新增渲染层测试，不改现有测试。

手工验收清单：

1. `npm run electron:build` → 安装新 dmg → 首次启动，Dock 图标立即出现（条目宽度 60，图标为蓝色圆形 logo）
2. 用辅助功能核对条目尺寸不为 0：
   `osascript -e 'tell application "System Events" to tell process "Dock" to get {position, size} of (first UI element of list 1 whose name is "GeoDraw Pro")'`
3. **关键回归（证明不再依赖 bundle 图标解析）**：
   ```sh
   cp -R "/Applications/GeoDraw Pro.app" /tmp/iconless.app
   : > "/tmp/iconless.app/Contents/Resources/icon.icns"
   codesign --force --deep -s - /tmp/iconless.app
   open /tmp/iconless.app
   ```
   即使 `icon.icns` 被清空，Dock 仍应显示 GeoDraw 图标（来自 asar 内的 `public/icon.png`）。修复前这一步会是空白/通用图标
4. 连续启动两次（`open -n`）：两个 Dock 条目都带图标（多条目行为本身不变）
5. `npm run electron:dev`：dev 模式下 Dock 显示 GeoDraw 图标，而不是 Electron 默认图标
6. 主进程日志出现 `[MainProcess] Dock icon applied`；把 `public/icon.png` 临时改名后启动，出现 `Dock icon not found ...` 且应用正常可用
7. 关窗退出、重新打开：Dock 图标不闪失、不重复；`killall Dock` 后图标依旧存在（重建条目后的日常验证）

## 风险与缓解

| 风险 | 说明与缓解 |
|---|---|
| 显式图标与系统从 icns 派生的图标外观略有差异 | 两者同源（同一份 PNG 生成 icns），512px 覆盖 Retina Dock 需求；如需完全一致，改为导出 1024 PNG 即可，属参数级调整 |
| asar 内读取 PNG 失败 | 已用 `isEmpty()` 兜底并记日志，行为退回现状（即仍可能不可见，但不会引入新故障） |
| 删除 `app.dock.show()` 导致某些环境图标不显示 | 应用从不 hide，`show()` 无正向作用；且 `setIcon` 是显式兜底，风险低于保留一个会触发条目重建的调用 |
| 多实例仍会产生多个 Dock 图标 | 既有行为，本次不改；如需收敛再单独讨论单实例锁（会改变"允许开多个实例"的现状） |
| LaunchServices 脏记录仍会存在 | 属用户环境；本次让应用不再依赖它。若图标异常复发，临时办法仍是 `killall Dock`（可写入 README 排障一节，是否写入待定） |

## 变更清单

| 文件 | 改动 |
|---|---|
| `electron/main.js` | 新增 `APP_ICON_PATH` 常量、`nativeImage` 解构、`applyDockIcon()`；`whenReady` darwin 分支调用；`createWindow` 复用常量；删除两处 `app.dock.show()` |

预估净增约 20 行、删除 6 行；不涉及渲染层、打包配置与依赖。
