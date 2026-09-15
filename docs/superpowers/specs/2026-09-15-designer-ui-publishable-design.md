# 设计器 UI 可发布化 — 设计文档

- **日期**：2026-09-15
- **状态**：待用户审阅
- **范围**：`designer-app/` 的 UI 层（`src/ui/`）+ 一处导出身份缺陷
- **相关文件**：`src/ui/Designer.tsx`(2614 行)、`src/ui/designer.css`(2062 行)、`src/core/arcgisProValidation.ts`、`ribbon-designer/shared/arcgisProValidation.ts`

---

## 1. 背景与目标

`designer-app` 功能已完备（M1 设计器 / M2 验算 / 大众化改造并发布 v1.0.0），但用户判断 UI 未达可发布水平，确认三个痛点：

1. **布局结构** — 空间浪费、控件库被裁切
2. **画布保真度** — 画布不像 ArcGIS Pro 的 ribbon
3. **视觉精致度** — 密度偏"企业内网工具"感

**交互手感（拖拽/选中/快捷键的顺滑度）明确不在本次范围内。**

**目标**：达到可对外发布的观感与保真度，且不破坏既有验收标准「设计器里拖的样子 = Pro 里的样子」。

---

## 2. 调研结论（全部实测，非估计）

| # | 结论 | 证据 |
|---|---|---|
| R1 | 控件库第二行被裁且**不可达** | `.next-bottom-palette` 写死 `max-height:176px` + `overflow-y:hidden`；子元素 `.next-palette-cards` 实需 239px，溢出 41px；祖先 `.next-workbench`/`.next-shell` 均 `overflow:hidden`，故无任何滚动路径 |
| R2 | 画布**没有页签条** | DOM 为 `next-canvas > next-ribbon-area > next-group`，画布内无任何 tab 元素；页签只存在于左侧栏 |
| R3 | 画布空间利用率低 | 画布 1003×694；`next-ribbon-area` 高 340 且分组顶部对齐，1 个分组宽 291 → 横向填充 **29.1%**，纵向 49% |
| R4 | 右栏是固定死列 | `.next-side { width:320px; flex:0 0 auto }`，空态仅一行居中灰字，占屏宽 22.2% |
| R5 | 密度参数偏紧 | `--fs-base:12px`、`--sp-*:2/4/6/8/10/12/16`、`--radius:2px` |
| R6 | `metadata.name` 身份双重 | 既是 `projectTitle()` 的显示名，又是导出包 `<Name>`(:738)与 `moduleCaption`(:223)，还是 `addInId` GUID 种子(:221) |
| R7 | 保存会覆盖项目名 | `Designer.tsx:1004` 用文件名覆盖 `document.metadata.name` |

### 2.1 调研中发现的额外缺陷（非 UI，但阻断可发布）

**导出插件的身份 GUID 每次编辑都在变。**

```
commit()                              ← 所有文档改动的唯一入口
  → cloneDocumentWithTimestamp()      ← 刷新 metadata.lastUpdated = nowIso()
    → addInId = stableGuid(`${assemblyName}:${metadata.id}:${metadata.name}:${lastUpdated}`)
      → Config.daml <AddInInfo id="{...}">
```

`stableGuid` 是 4 段 FNV-1a 哈希，输入变一位则 GUID 全变。

**机制经实证确认**：ArcGIS Pro 用 `<AddInInfo id>` 作为插件安装目录名 —— 本机 `Documents\ArcGIS\AddIns\ArcGISPro\` 下 4 个 GUID 目录与各自包内 `<AddInInfo id>` **4/4 完全一致**。

> 注意：那 4 个是 4 个**不同**插件，不是同一插件的重复。它们证明的是**机制**（目录名 = `AddInInfo id`），不是后果。

**推论**（由上述机制直接得出，**尚未实测**）：id 每次编辑都变 → 每次导出装进不同目录 → Pro 里累积多份同名插件，而不是更新已有那份。实施时先按 A4a 复现确认，再动手修。

---

## 3. 已锁定决策

| # | 决策 | 备注 |
|---|---|---|
| D1 | 画布**单模**：加 Pro 页签条，分组编辑入口改为**悬浮编辑条** | 用户否掉了"编辑态/预览态"双模 |
| D2 | 右栏空态改为**文档结构树**（页签→分组→控件），选中控件时切回属性表单 | |
| D3 | **项目名 = 插件名 = `metadata.name`**，双击可改，标题栏恒显示 | 不做"项目名/插件名"拆分 |
| D4 | 密度放宽与视觉层级重做**都做** | |
| D5 | 视觉确认走**真实 app**（dev server + Playwright 截图），不另开 mockup 工具 | |
| D6 | 画布多余的纵向空间**让给底部控件库** | |
| D7 | 控件库卡片**渲染真实 mock**，三个尺寸同时展示 | ⚠️ 推翻既有决定，见 §6 |
| D8 | 修正 `addInId` 抖动（§2.1） | 本次调研发现，属阻断项 |

---

## 4. 分期与设计

### P1 · 密度标尺 —— 已完成

只改 `designer.css` 的 `:root`，11 个 token：

| Token | 前 | 后 | | Token | 前 | 后 |
|---|---|---|---|---|---|---|
| `--fs-lg` | 13px | 15px | | `--sp-5` | 10px | 12px |
| `--fs-base` | 12px | 13px | | `--sp-6` | 12px | 16px |
| `--fs-sm` | 11px | 12px | | `--sp-8` | 16px | 24px |
| `--fs-xs` | 10px | 11px | | `--radius` | 2px | 4px |
| `--h-ctl` | 26px | 28px | | `--h-ctl-sm` | 22px | 24px |
| `--h-ctl-xs` | 18px | 20px | | | | |

- 间距阶现读作 **2/4/6/8/12/16/24**（sp-4 之后 1.5× 递进）
- **`--cell` 恒 32px 未动**（与 `core/ribbonLayout.ts` 的 `RIBBON_CELL` 联动，铁律）
- 实测确认这 11 个 token **只在 `:root` 定义一次**，暗色块仅覆盖颜色不覆盖尺寸，故无需双改
- 已完成 commit 前的对照验证（双主题、1360×860、同状态）

**遗留**：字号变大后控件库内容需求更高（239px → 约 260px），R1 的裁切会更明显。P2-1 必须紧跟。

---

### P2 · 缺陷与新功能

#### P2-1 控件库裁切（修复 R1）

**文件**：`src/ui/designer.css` → `.next-bottom-palette`

```css
/* 前 */
max-height: 176px;
overflow-y: hidden;

/* 后 */
max-height: min(40vh, 280px);
overflow-y: auto;
```

**理由**：`176px` 是单行卡片的假设，实际 9 种控件在常规宽度下必为 2 行（实需 239px，P1 后约 260px）。改为按视口比例设上限并允许纵向滚动，保证任何窗口尺寸下内容都可达。

**验证**：在 1360×860（默认）、1100×700（最小）、1920×1080 三档下，用 Playwright 断言 `.next-palette-cards` 的 `bottom ≤ .next-bottom-palette` 的 `bottom`，或断言 palette 的 `scrollHeight ≤ clientHeight`。

#### P2-2 尺寸徽章 → 空间图示

**文件**：`src/ui/Designer.tsx:1866-1885`、`src/ui/designer.css`

现状把占格降级成文字：`<small>{footprintLabel(item.type, candidate)}</small>` → 渲染 "1x1"。

改为按 `getFootprint()` 返回的 `{w, h}` 渲染等比方块图（`aspect-ratio: w / h`）。`getFootprint` **已在 `Designer.tsx:74` 导入**，无需新增依赖。

**占格基准表**（`core/ribbonLayout.ts` `getFootprint`）：

| 类型 | small | middle | large |
|---|---|---|---|
| button / tool / checkbox | 1×1 | 2×1 | 2×3 |
| menu / splitButton | 1×1 | 2×1 | 2×2 |
| gallery / toolPalette | 1×1 | 3×1 | 3×3 |
| gallery（`inline` 变体） | — | 5×1 | 5×3 |
| comboBox / editBox | 2×1 | 3×1 | 4×1 |
| 任意类型（`menuStyle` 变体） | — | 2×1 | 2×3 |

**无障碍**：文字占格**必须保留**，降级进 `title` 与 `aria-label`。纯图示读屏读不出占格。

**验证**：断言徽章元素的 `offsetWidth/offsetHeight` 比值 == `w/h`（容差 ±0.1）。

#### P2-3 项目名可修改（D3）

**文件**：`src/ui/Designer.tsx`、`src/core/arcgisProValidation.ts`（+ 镜像文件）

| 步骤 | 改动 |
|---|---|
| a | `ProjectEntry` 增加 `name: string` 字段 |
| b | `StoredProjectMeta` 增加 `name`，会话恢复时读回 |
| c | `makeProjectEntry()` 用 `document.metadata.name` 初始化 `name` |
| d | `projectTitle()` 去掉 `filePath` 分支，恒返回 `project.name` |
| e | 侧栏项目名 + 标题栏项目名 → 双击转内联 `<input>`；空值回退 `未命名` |
| f | 改名同步写入 `entry.name` 与 `document.metadata.name`，并走 `commit()` 入 undo 栈 |
| g | **拆雷甲**：`Designer.tsx:1004` 保存时**不再**用文件名覆盖 `metadata.name`。从 `.json` 打开项目时，以文件名（去 `.json` 扩展名）初始化 `entry.name`；此后保存/另存均不再改写 `name` |
| h | **拆雷乙**：`arcgisProValidation.ts:221` 的 `addInId` 种子去掉 `metadata.name` **与** `metadata.lastUpdated`，只保留稳定字段 |

**种子修正的确切形式**：

```ts
// 前
stableGuid(`${merged.assemblyName}:${document.metadata.id}:${document.metadata.name}:${document.metadata.lastUpdated}`)
// 后
stableGuid(`${merged.assemblyName}:${document.metadata.id}`)
```

- ⚠️ **两个变体必须镜像改**：`designer-app/src/core/arcgisProValidation.ts` 与 `ribbon-designer/shared/arcgisProValidation.ts`（CLAUDE.md 铁律）
- **无迁移代价**：现有 `addInId` 本就随每次编辑抖动，不存在"稳定身份被破坏"的问题；此改动是纯修复（§2.1）

**注意**：`<AddInInfo version="...">` 由 `buildVersionFromDocument()` 从 `lastUpdated` 派生，**本次不改**。版本随编辑递增是合理的（表示内容已变），与身份稳定性是两件事。

#### P2-4 导出身份缺陷（D8，§2.1）

即 P2-3 的步骤 h。单列是因为它是**正确性缺陷**而非 UI 问题，且可独立交付。若用户希望缩小本次范围，可单独拆出。

---

### P3 · 画布重构

#### P3-1 画布页签条（D1，修复 R2）

**文件**：`src/ui/Designer.tsx`（画布渲染块 1750-1798）、`src/ui/designer.css`（06 画布段）

在 `.next-ribbon-area` 上方新增 `.next-canvas-tabs`，渲染 `document.tabs`：

- 点击页签 → 切换 `activeTabId`，与侧栏 `.next-tab-item` **双向联动**（任一处切换，另一处同步高亮）
- 当前页签的 `keytip` 显示在页签上（Pro 的实际行为）
- 保留现有空态 `.next-empty-canvas`
- 视觉上贴合 ArcGIS Pro 的 tab row（选中页签下边缘与 ribbon 条带相接）

**验证**：画布内存在与 `document.tabs.length` 等量的页签元素；点画布页签后侧栏对应项 `.active` 同步；反向亦然。

#### P3-2 悬浮编辑条（D1）

**文件**：`src/ui/Designer.tsx`（`RibbonGroupView` 2222-2270）、`src/ui/designer.css`

把 `.next-group-tools`（分组名输入框 / −列 / +列 / 复制 / 删除）与 `.next-group-footer` 的**批量尺寸**从常显改为**选中或悬停时浮现**，位置在分组框**外**上方。

**硬约束**：

- **用 `visibility: hidden` / `visible`，禁用 `display: none`**。`display:none` 会把按钮移出 tab 序，键盘用户永远够不到——这是无障碍回归，违反 CLAUDE.md 既有不变量。
- 分组容器需可聚焦（`tabindex`）或用 `:focus-within`，保证纯键盘可触发
- **拖拽进行中必须抑制浮出**，否则拖控件经过分组时编辑条会闪烁
- 浮层不得遮挡相邻分组的控件（多分组并排时的 z-index 与定位）

**验证**：
- 键盘：Tab 进入分组 → 编辑条出现 → 可继续 Tab 到各按钮
- 拖拽：拖一个控件横穿多个分组，编辑条不出现
- 无障碍：`npm run dev` + Playwright 注入 axe-core 双主题扫描零违规

#### P3-3 画布与控件库的空间分配（D6）

**文件**：`src/ui/designer.css`（06 / 10 两段）、`src/ui/Designer.tsx`

- 画布收紧至 ribbon 条带实际所需高度（不再无条件占据剩余全部空间）
- 在画布与控件库之间加**可拖拽分隔条**，高度由用户决定并**跨会话记忆**（复用 `gispro-ribbon-designer-lib-category` 同款 localStorage 机制）
- 控件库最小/最大高度的边界需明确，避免拖成 0 或占满全屏

**未定项**：分隔条的默认分位（建议画布 55% / 控件库 45%）在实施时用实机截图定。

---

### P4 · 右栏文档结构树（D2）

**文件**：新增 `src/ui/DocumentOutline.tsx`；`src/ui/Designer.tsx`（`next-side` 渲染块 1800-1826）；`src/ui/designer.css`

- 树形结构：`tabs → groups → controls` 三级
- 空态（未选中控件）渲染这棵树；选中控件时切回 `Inspector`
- 点击页签 → 切换 `activeTabId`；点击分组 → 选中分组；点击控件 → 选中控件并滚动定位到画布上对应位置
- 与画布选中态双向同步（当前选中项高亮）
- 需处理长文档的滚动与折叠

**验证**：断言树节点数量与 `document.tabs/groups/controls` 一致；点击树节点后画布对应元素有选中态。

---

### P5 · 控件库卡片渲染真实 mock（D7）

**文件**：`src/ui/Designer.tsx`（控件库渲染块 1866-1888）、`src/ui/designer.css`（10 段）、可能需扩展 `src/ui/ControlMock.tsx`

卡片布局（三尺寸同时展示）：

```
┌─ 按钮 ─────────────────────────────┐
│ 执行一次性命令，例如打开窗口、导出…  │
│  ┌────┐   ┌────────┐   ┌────────┐  │
│  │ ▣  │   │ ▣ 按钮 │   │ ▣ 按钮 │  │
│  │    │   │        │   │        │  │
│  └────┘   └────────┘   │        │  │
│   小       中          └────────┘  │
│  1x1      2x1            大 2x3    │
└────────────────────────────────────┘
```

- 点/拖任一格即出**该尺寸**的控件（与现有"按住徽章拖出"行为一致，只是从文字徽章升级为实体）
- `ControlMock` 现吃 `RibbonControl`，控件库需为每个 类型×尺寸 合成对象；`arcgisProValidation.ts` 的 `createLeafControl` 可复用
- ⚠️ **推翻既有决定**，见 §6

**待实测项**：9 类型 × 3 尺寸 = 27 个 mock，各自触发 `getIconUrl`。Rust 侧 `OnceLock` 缓存 + 前端缓存应能吸收，但**需实测首屏耗时**；若明显劣化，回退为"仅当前选中尺寸渲染 mock，其余两格用空间图示"。

**验证**：首屏渲染耗时对比（改前 vs 改后）；axe 双主题零违规。

---

## 5. 分期依赖

```
P1 ✅ ──→ P2-1 ──→ P2-2
          P2-3 ──→ P2-4   (可与 P2-1/2-2 并行)
P1 ✅ ──→ P3-1 ──→ P3-2 ──→ P3-3
P1 ✅ ──→ P4               (独立)
P3-3 ──→ P5                (P5 依赖控件库拿到高度)
```

**P1 是所有后续项的前置**：它确立字距标尺，后做的组件若基于旧标尺则全部返工。P1 已完成。

---

## 6. 本次推翻的既有决定

| 既有决定 | 出处 | 本次改为 | 理由 |
|---|---|---|---|
| 控件库"不渲染 mock 实体" | `CLAUDE.md` 控件库双层设计段 | 卡片渲染真实 mock，三尺寸同展 | 该决定的成立前提是"紧凑卡要全量类型一次显示，渲染实体塞不下"。P3-3 给了控件库更多纵向空间并允许用户调节，前提不再成立 |
| 项目名与文件名绑定（保存覆盖） | `Designer.tsx:1004` | 项目名独立、恒显示、可改 | D3；原行为会让改名功能一保存即失效 |

**实施 P5 后需同步更新 `CLAUDE.md` 的控件库描述**，否则后续改动会照旧文档改回去。

---

## 7. 验收标准

| # | 标准 | 检查方式 |
|---|---|---|
| A1 | 控件库在 1100×700 ~ 1920×1080 全区间内容完整可达 | Playwright 断言几何（P2-1） |
| A2 | 尺寸徽章按真实占格等比渲染 | 断言宽高比 == `w/h`（P2-2） |
| A3 | 项目名可改且保存后不被覆盖 | 改名 → 保存 → 重开，断言名字保持（P2-3） |
| A4a | **先复现**：修复前，同一设计稿导出两次（中间编辑过）得到**不同** `addInId` | 导出两次，解包比对 `<AddInInfo id>`。复现成功才证明 §2.1 的推论成立，才值得动手修 |
| A4b | 修复后，同一设计稿导出两次（中间编辑过）得到**相同** `addInId` | 同 A4a 步骤 |
| A5 | 画布页签条与侧栏页签双向联动 | 点击后断言两侧选中态（P3-1） |
| A6 | 纯键盘可达分组编辑条 | Tab 走查，编辑条出现且可继续 Tab 到按钮（P3-2） |
| A7 | 拖拽经过分组时编辑条不闪现 | 拖拽脚本 + 截图比对（P3-2） |
| A8 | 结构树与文档结构一致且点击定位有效 | 断言节点数与点击后选中态（P4） |
| A9 | 浅色/暗色 axe-core 违规**均为 0** | `npm run dev` + 注入 axe-core 4.10.2 扫描；**必须轮询等样式落地再扫**，否则读到旧背景色产生假违规（CLAUDE.md 记录过这个坑） |
| A10 | `npx tsc --noEmit` 与 `cargo test --lib` 通过 | CI 同款命令 |
| A11 | 改 Rust 公共结构体时 `cargo test --test import_addin_test --test export_addin_test --no-run` 通过 | 本项不改 Rust，但若波及需跑（CLAUDE.md：CI 只跑 `--lib`，集成测试会悄悄烂掉） |

---

## 8. 范围外（明确不做）

- **交互手感**：拖拽吸附、选中手感、快捷键顺滑度 — 用户明确未选
- **`<AddInInfo version>` 的派生逻辑**：保持从 `lastUpdated` 派生
- **DAML 生成器的其余逻辑**：仅动 `addInId` 种子一处，其余不碰
- **网格/碰撞/DAML 生成与解析的既有算法**：`src/core/` 除 `addInId` 外不改（CLAUDE.md：不要重写已验证的逻辑）
- **旧 Web 设计器 `ribbon-designer/` 的功能**：只做镜像改动（`shared/arcgisProValidation.ts`），不加新特性
- **图标体系**：Tabler 图标包、`icon-gen`、用户图标导入均不动
- **既有配色 token 的值**：一个不动（P1 只改尺寸类 token）。新增组件若需要新颜色，按 §10 的 token 铁律新增（两主题都出值），但**不改动任何既有配色 token 的值**

---

## 9. 风险与未决

| 风险 | 影响 | 处置 |
|---|---|---|
| P1 动全局标尺 | 可能触发对比度/热区的无障碍回归 | A9 双主题 axe 扫描；`--focus-ring` 未动故焦点环不受影响 |
| 悬浮编辑条用 `visibility` | 若误用 `display:none` 会静默丢失键盘可达性 | A6 专项 Tab 走查；写进 P3-2 硬约束 |
| 27 个 mock 的图标加载 | 首屏可能变慢 | P5 待实测项，有明确回退方案 |
| `addInId` 种子变更 | 存量设计稿下次导出会换 GUID | **无实际损失**：现 GUID 本就每次编辑都变（§2.1），修复只会让它首次稳定 |
| 控件库可拖拽分隔条 | 拖到极端值可能破坏布局 | P3-3 明确 min/max 边界 |
| P1 后裁切更明显 | 中间态体验比改前更差 | P2-1 必须紧跟 P1 上线，不可单独发布 P1 |

**已给默认值的可调参数**（不需再决策，实施时觉得不对再改）：P3-3 分隔条默认分位 = 画布 55% / 控件库 45%；P5 劣化回退阈值 = 新增 mock 使首屏渲染 > 300ms，即回退为"仅选中尺寸渲染 mock、其余两格用空间图示"。

---

## 10. 已确认的既有约束（实施时不可违反）

- `--cell` 恒 32px，与 `core/ribbonLayout.ts` 的 `RIBBON_CELL=32` 联动
- `designer.css` 中 `:root` / `[data-theme='dark']` 之外不允许裸 hex/rgb；新颜色必须双主题都出值
- 所有弹窗必须走 `Modal.tsx`（手写 `<div class="next-modal">` 会丢掉 role/aria-modal/焦点陷阱/焦点归还）
- `.next-shell input/select/textarea` 依赖 `color: inherit`，不可去掉
- `ribbon-designer/shared/arcgisProValidation.ts` 与 `designer-app/src/core/arcgisProValidation.ts` 必须镜像改
- 画布孤岛：暗色下 `.next-ribbon-control`/`.icon-cell` 作用域内 `--ink-*` 被重定义为 `--island-*`，新增自设颜色需同步该层
