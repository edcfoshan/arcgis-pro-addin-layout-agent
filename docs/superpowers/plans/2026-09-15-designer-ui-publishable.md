# 设计器 UI 可发布化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `designer-app` 的 UI 做到可对外发布的水准——布局不浪费、画布像 ArcGIS Pro、视觉不再是"企业内网工具"感，并修掉一个会让 Pro 累积重复插件的导出身份缺陷。

**Architecture:** 分两层验证。布局/样式/DOM 行为用 Playwright 断言脚本（新建 `tools/ui-check/`，仿 `tools/icon-gen` 的自带 package.json 模式，开发侧不进 CI）；纯 TS 逻辑（DAML 生成）用 `node --experimental-strip-types` 的 `.mts` 脚本（仿既有 `tools/test-daml-roundtrip.mts`）。所有 UI 改动集中在 `designer-app/src/ui/Designer.tsx` 与 `designer-app/src/ui/designer.css`，核心逻辑层 `src/core/` 只动 `addInId` 种子一处。

**Tech Stack:** Tauri 2 · React 19 · TypeScript 6 · Vite 8 · Playwright（仅 `tools/ui-check/`）· Node 22 `--experimental-strip-types`

**Spec:** `docs/superpowers/specs/2026-09-15-designer-ui-publishable-design.md`

## Global Constraints

以下约束来自 spec §10，**每个任务都隐含包含**，违反即任务未完成：

- `--cell` 恒 **32px**，与 `designer-app/src/core/ribbonLayout.ts` 的 `RIBBON_CELL=32` 联动，**不可改值**。
- `designer.css` 中 `:root` / `:root[data-theme='dark']` 之外**不允许裸 hex/rgb**；新颜色必须先加 token，且**两个主题都要出值**。
- 所有弹窗必须走 `Modal.tsx`；手写 `<div className="next-modal">` 会丢掉 `role="dialog"` / `aria-modal` / 初始焦点 / 焦点陷阱 / 焦点归还五件事。
- `.next-shell input/select/textarea` 依赖 `color: inherit` 取色，不可去掉（去掉会在暗色下退回 UA 黑字，对比度 1.6:1）。
- `ribbon-designer/shared/arcgisProValidation.ts` 与 `designer-app/src/core/arcgisProValidation.ts` **必须镜像改**，只改一边会导致打包链与设计器产出的 DAML 不一致。
- 画布孤岛：暗色下 `:root[data-theme='dark'] .next-ribbon-control, .icon-cell` 作用域内把 `--ink-*` 重定义成了 `--island-*`。给孤岛新增自设颜色时**必须同步这一层**。
- UI 文案、控件库名称、代码注释**均为中文**。
- 含中文的 `.ps1` 必须带 **UTF-8 BOM**（PS 5.1 无 BOM 按 GBK 解析会撕碎引号）。
- 焦点环是两个 token，**别合并**：`--focus-ring`（实心，专职焦点指示）与 `--accent-focus`（半透明，只剩拖拽预览填充一个用途）。

## 前置条件

执行前必须在**另一个终端**把 dev server 跑起来，全程保持：

```bash
cd designer-app && npm run dev      # http://localhost:1420
```

`tools/ui-check` 的断言全部打在这个地址上。端口若被占用，用 `UI_CHECK_URL` 覆盖。

## 文件结构

**新建**
| 路径 | 职责 |
|---|---|
| `tools/ui-check/package.json` | ui-check 工具自身的依赖（仅 playwright），不进 designer-app、不进 CI |
| `tools/ui-check/run.mjs` | 检查运行器：起浏览器、注入确定性初始状态、逐个跑 `checks/*.mjs`、汇总退出码 |
| `tools/ui-check/assert.mjs` | 两个断言原语 `ok` / `eq` |
| `tools/ui-check/checks/*.mjs` | 每个检查一个文件，默认导出一个 `async (page) => void` |
| `tools/ui-check/node-checks/addin-id.mts` | 纯 TS 检查：DAML 生成产物的 `<AddInInfo id>` 稳定性 |
| `designer-app/src/ui/DocumentOutline.tsx` | P4 的右栏文档结构树组件 |

**修改**
| 路径 | 涉及任务 | 改动性质 |
|---|---|---|
| `designer-app/src/ui/designer.css` | 2,3,6,7,8,9,10 | 加规则、改 `.next-bottom-palette` 的写死高度 |
| `designer-app/src/ui/Designer.tsx` | 3,4,6,7,8,9,10 | 加组件/状态、改渲染块 |
| `designer-app/src/core/arcgisProValidation.ts` | 5 | 只改 `addInId` 种子一行 |
| `ribbon-designer/shared/arcgisProValidation.ts` | 5 | 同上，镜像 |
| `CLAUDE.md` | 11 | 同步被推翻的控件库决定 |

**不动**：`src/core/` 其余文件（除 `addInId` 种子一处）、`ControlMock.tsx` 的既有渲染逻辑（P5 直接用它的 `mode="library"`，不改它）、图标体系、配色 token 的值。

---

## Task 1: 验证脚手架

先把"能跑断言"这件事本身做出来。没有它，后面每个任务都只能靠肉眼，等于没有回归网。

**Files:**
- Create: `tools/ui-check/package.json`
- Create: `tools/ui-check/assert.mjs`
- Create: `tools/ui-check/run.mjs`
- Create: `tools/ui-check/checks/00-smoke.mjs`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `tools/ui-check/checks/<name>.mjs` 的契约——默认导出 `async (page: import('playwright').Page) => void`，抛错即失败；可选具名导出 `name: string` 作为显示名。后续所有 UI 任务都按这个契约写检查。

- [ ] **Step 1: 写冒烟检查（此时必然失败——运行器还不存在）**

创建 `tools/ui-check/checks/00-smoke.mjs`：

```js
import { eq, ok } from '../assert.mjs';

export const name = '冒烟：dev server 可达且设计器已挂载';

export default async function (page) {
  eq(await page.title(), 'ArcGIS Pro Add-In Ribbon 布局设计器', '页面标题');
  ok((await page.locator('.next-shell').count()) === 1, '应挂载 .next-shell');
  ok((await page.locator('.library-compact-card').count()) > 0, '控件库应渲染出卡片');
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && node run.mjs smoke
```

Expected: 报错退出，信息含 `Cannot find module` 或 `ERR_MODULE_NOT_FOUND`——运行器与 `assert.mjs` 都还不存在。

- [ ] **Step 3: 建 assert.mjs**

创建 `tools/ui-check/assert.mjs`：

```js
// 两个断言原语。抛出的 Error 会被 run.mjs 捕获并计为该检查失败。
export const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

export const eq = (actual, expected, msg) =>
  ok(Object.is(actual, expected), `${msg} —— 期望 ${expected}，实际 ${actual}`);
```

- [ ] **Step 4: 建 package.json 并装依赖**

创建 `tools/ui-check/package.json`：

```json
{
  "name": "ui-check",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node run.mjs"
  },
  "dependencies": {
    "playwright": "^1.63.0"
  }
}
```

```bash
cd tools/ui-check && npm install
```

Expected: `node_modules/` 出现，`package-lock.json` 生成。

- [ ] **Step 5: 建运行器**

创建 `tools/ui-check/run.mjs`：

```js
// UI 机械验收：对 dev server 跑断言，读计算样式与几何。
// 用法：npm run check [过滤词]      （在 tools/ui-check 下）
//       UI_CHECK_URL=http://localhost:1420 npm run check
import { chromium } from 'playwright';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.join(import.meta.dirname, 'checks');
const BASE = process.env.UI_CHECK_URL ?? 'http://localhost:1420';
const VIEWPORT = { width: 1360, height: 860 };
const filter = process.argv[2];

const files = (await readdir(DIR)).filter((f) => f.endsWith('.mjs')).sort();
const targets = filter ? files.filter((f) => f.includes(filter)) : files;
if (!targets.length) {
  console.error(`没有匹配的检查：${filter ?? '(全部)'}`);
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

// 起始状态必须确定：跳过欢迎浮层、固定浅色主题、清掉上次会话。
// 不清 localStorage 全量是因为「主题」「欢迎」这两项本身就要固定，
// 其余草稿槽由各检查自己按需铺设。
await page.addInitScript(() => {
  localStorage.setItem('gispro-ribbon-designer-welcome-seen', '1');
  localStorage.setItem('gispro-ribbon-designer-theme', 'light');
});

let failed = 0;
for (const file of targets) {
  const mod = await import(pathToFileURL(path.join(DIR, file)).href);
  const label = mod.name ?? file;
  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.next-shell', { timeout: 5000 });
    await mod.default(page);
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${label}\n        ${String(error.message).split('\n')[0]}`);
  }
}

await browser.close();
console.log(
  failed ? `\n${failed} / ${targets.length} 个检查失败` : `\n全部通过（${targets.length}）`,
);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 6: 跑冒烟，确认通过**

先确认 dev server 在跑，然后：

```bash
cd tools/ui-check && npm run check smoke
```

Expected:
```
  PASS  冒烟：dev server 可达且设计器已挂载

全部通过（1）
```

若报 `page.goto: net::ERR_CONNECTION_REFUSED`，说明 dev server 没起——回到「前置条件」。

- [ ] **Step 7: 提交**

```bash
git add tools/ui-check
git commit -m "test: 建 UI 机械验收脚手架（Playwright 断言 + 确定性初始状态）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: P2-1 控件库不再被裁

**这是 P1 之后最紧急的一条**：P1 放大字号后控件库内容需求从 239px 涨到约 260px，而容器写死 176px，中间态比改前更差，不可单独发布。

**Files:**
- Modify: `designer-app/src/ui/designer.css`（`.next-bottom-palette`，约 1281-1292 行）
- Test: `tools/ui-check/checks/10-palette-reachable.mjs`

**Interfaces:**
- Consumes: Task 1 的检查契约
- Produces: 无新接口；`.next-bottom-palette` 的纵向溢出行为变为可滚

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/10-palette-reachable.mjs`：

```js
import { ok } from '../assert.mjs';

export const name = 'P2-1 控件库在常规窗口尺寸下内容完整可达';

// 默认窗口 1360×860、最小窗口 1100×700、全屏 1920×1080
const SIZES = [[1360, 860], [1100, 700], [1920, 1080]];

export default async function (page) {
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);

    const overflowY = await page
      .locator('.next-bottom-palette')
      .evaluate((el) => getComputedStyle(el).overflowY);
    ok(
      overflowY === 'auto' || overflowY === 'scroll',
      `${width}×${height}：控件库纵向必须可滚，实际 overflow-y=${overflowY}`,
    );

    // 滚到底，最后一张卡片必须完整落在容器可视区内
    await page.locator('.next-bottom-palette').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(150);

    const lastReachable = await page.evaluate(() => {
      const box = document.querySelector('.next-bottom-palette').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.library-compact-card')];
      if (!cards.length) return false;
      const last = cards[cards.length - 1].getBoundingClientRect();
      return last.bottom <= box.bottom + 1 && last.top >= box.top - 1;
    });
    ok(lastReachable, `${width}×${height}：滚到底后最后一张卡片仍不在可视区内`);
  }
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check palette
```

Expected: FAIL，信息含 `控件库纵向必须可滚，实际 overflow-y=hidden`。

- [ ] **Step 3: 改 CSS**

在 `designer-app/src/ui/designer.css` 的 `.next-bottom-palette` 规则里，把：

```css
  max-height: 176px;
  overflow-x: auto;
  overflow-y: hidden;
```

改为：

```css
  /* 176px 是「卡片只有一行」的旧假设。9 种控件在常规宽度下必为两行
     （P1 放大字号后实需约 260px），写死高度会让第二行永久不可达。
     改为按视口比例设上限并允许纵向滚动，保证任何窗口尺寸下内容都够得到。 */
  max-height: min(40vh, 280px);
  overflow-x: auto;
  overflow-y: auto;
```

- [ ] **Step 4: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check palette
```

Expected: PASS。若在 1100×700 失败，说明 `40vh` 太小（=280px 上限未生效时为 280px，应足够）——检查是否被 `min()` 之内的 `280px` 卡住；把 `280px` 提到 `300px` 再跑。

- [ ] **Step 5: 人工确认观感没坏**

打开 `http://localhost:1420`，在 1360×860 下：

- 控件库能看到完整两行（第二行是「输入框 / 复选框」）
- 容器内可纵向滚动
- 分类 segment（全部/命令/容器/输入）随内容一起滚，不吸顶错位

- [ ] **Step 6: 提交**

```bash
git add designer-app/src/ui/designer.css tools/ui-check/checks/10-palette-reachable.mjs
git commit -m "fix: 控件库第二行永久不可达——写死 max-height 176px 改为可滚

P1 放大字号后内容需求涨到约 260px，176px 上限 + overflow-y:hidden
让第二行卡片既看不到也滚不到。改为 min(40vh, 280px) + overflow-y:auto。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: P2-2 尺寸徽章改成空间图示

把「1x1」这种纯文字换成按真实占格比例的方块图，拖之前就能看出控件占多大地方。

**Files:**
- Modify: `designer-app/src/ui/Designer.tsx`（控件库卡片渲染块，约 1866-1885 行）
- Modify: `designer-app/src/ui/designer.css`（10 底部控件库段）
- Test: `tools/ui-check/checks/11-footprint-chip.mjs`

**Interfaces:**
- Consumes: `getFootprint(type, size, variant?) => { w: number; h: number }`（已在 `Designer.tsx:74` 导入）；`footprintLabel(type, size, variant?) => string`（同处已导入）
- Produces: DOM 契约——每个尺寸徽章 button 内含 `<span class="footprint-chip" data-footprint="2x1">`，`data-footprint` 的值等于 `footprintLabel()` 的返回。Task 10 会复用这个属性。

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/11-footprint-chip.mjs`：

```js
import { ok } from '../assert.mjs';

export const name = 'P2-2 尺寸徽章按真实占格等比渲染';

// 「按钮」的三种尺寸：小 1×1、中 2×1、大 2×3（见 core/ribbonLayout.ts getFootprint）
const EXPECTED = [
  ['1x1', 1],
  ['2x1', 2],
  ['2x3', 2 / 3],
];

export default async function (page) {
  const card = page.locator('.library-compact-card').filter({ hasText: '按钮' }).first();
  ok((await card.count()) > 0, '找不到「按钮」卡片');

  for (const [label, ratio] of EXPECTED) {
    const chip = card.locator(`.footprint-chip[data-footprint="${label}"]`).first();
    ok((await chip.count()) > 0, `找不到占格为 ${label} 的图示`);

    const box = await chip.boundingBox();
    ok(box, `${label} 的图示没有尺寸（可能 display:none 或宽高为 0）`);

    const actual = box.width / box.height;
    ok(
      Math.abs(actual - ratio) < 0.1,
      `${label}：宽高比期望 ${ratio.toFixed(2)}，实际 ${actual.toFixed(2)}（${box.width}×${box.height}）`,
    );
  }

  // 无障碍：纯图示读屏读不出占格，文字必须留在 button 的可访问名里
  const title = await card.locator('button').first().getAttribute('title');
  ok(title && title.includes('1x1'), `徽章 button 的 title 应含占格文字，实际 ${title}`);
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check footprint
```

Expected: FAIL，信息含 `找不到占格为 1x1 的图示`。

- [ ] **Step 3: 改 JSX**

在 `designer-app/src/ui/Designer.tsx` 的控件库卡片渲染块里，把这段：

```tsx
                        >
                          {SIZE_LABELS[candidate]}
                          <small>{footprintLabel(item.type, candidate)}</small>
                        </button>
```

替换为：

```tsx
                        >
                          {SIZE_LABELS[candidate]}
                          <small>
                            {/* 占格用等比方块图示表达：1×1 是方格、2×1 是横条、2×3 是竖矩形 */}
                            <span
                              className="footprint-chip"
                              data-footprint={footprintLabel(item.type, candidate)}
                              style={
                                {
                                  '--fw': getFootprint(item.type, candidate).w,
                                  '--fh': getFootprint(item.type, candidate).h,
                                } as CSSProperties
                              }
                              aria-hidden
                            />
                          </small>
                        </button>
```

同时把该 button 的 `title` 改成自带尺寸名与占格的完整可访问名——找到同一 button 上已有的 `title={...}` 行，改为：

```tsx
                          title={`${item.label} · ${SIZE_LABELS[candidate]} · ${footprintLabel(item.type, candidate)}`}
                          aria-label={`${item.label} ${SIZE_LABELS[candidate]} 尺寸，占 ${footprintLabel(item.type, candidate)} 格`}
```

**不传 variant**：`LibraryControlDefinition`（`core/types.ts:141`）**没有 `variant` 字段**，字段是 `type / label / shortDescription / supportedSizes / defaultCaption / defaultTooltip / defaultBehavior / defaultAiNotes / icon`。控件库展示的是默认变体，而 `getFootprint` 的第三参 `variant` 本身可选——与同一行既有的 `footprintLabel(item.type, candidate)` 调用保持一致即可。

（若 `CSSProperties` 未导入，在文件顶部已有的 React type import 中补上；`getFootprint` 与 `footprintLabel` 已在第 65-78 行的 `../core/ribbonLayout` 导入块中，无需新增。）

- [ ] **Step 4: 改 CSS**

在 `designer-app/src/ui/designer.css` 的「10 底部控件库」段，找到 `.library-compact-sizes button` 规则之前，插入：

```css
/* 尺寸徽章里的占格图示：一个网格单位固定 6px，故不同占格之间可直接目视比较大小。
   --fw / --fh 由 JSX 从 getFootprint() 注入。 */
.footprint-chip {
  display: block;
  margin: 0 auto;
  /* 必须显式 border-box：本仓库没有全局 box-sizing 重置，默认是 content-box，
     1px 边框会把盒子撑成 (w*6+2)×(h*6+2)。那样 2×1 会渲染成 14×8=1.75 而非 2，
     Task 3 的宽高比断言（容差 0.1）会假失败。 */
  box-sizing: border-box;
  width: calc(var(--fw, 1) * 6px);
  height: calc(var(--fh, 1) * 6px);
  max-width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: 1px;
  background: var(--bg-ctl);
}
```

并把同段里的 `.library-compact-sizes button` 规则补一条，让三个徽章的图示底部对齐（徽章本身高度不同，不对齐会参差）：

```css
.library-compact-sizes button small {
  display: block;
  min-height: 20px;
}
```

- [ ] **Step 5: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check footprint
```

Expected: PASS。

- [ ] **Step 6: 人工确认观感**

打开 `http://localhost:1420`，看底部控件库：

- 「按钮」卡片三个徽章下方分别是 方格 / 横条 / 竖矩形，比例与 `1x1 / 2x1 / 2x3` 一致
- 「画廊」大尺寸应是最宽的矩形（3×3）
- 「下拉框」大尺寸应是最扁的长条（4×1）
- 暗色主题下图示边框与底色可见（切主题再看一遍）

- [ ] **Step 7: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/11-footprint-chip.mjs
git commit -m "feat: 尺寸徽章的文字占格改为等比空间图示

getFootprint() 本就返回 {w,h}，原先被降级成 '2x1' 文字。改为按比例
渲染方块图（一个网格单位 6px），拖之前即可目视比较控件占格大小。
文字占格保留在 title 与 aria-label，读屏仍可获取。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: P2-3 项目名可修改

**Files:**
- Modify: `designer-app/src/ui/Designer.tsx`（`ProjectEntry` 203-210、`StoredProjectMeta` 212-218、`makeProjectEntry` 218-230、`projectTitle` 555-560、侧栏 1595-1620、标题栏项目名、保存路径 1004）
- Test: `tools/ui-check/checks/12-project-rename.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `ProjectEntry.name: string`；`StoredProjectMeta.name: string`；`projectTitle(project) => string` 恒返回 `project.name`。Task 9 的文档结构树会用 `projectTitle()` 显示项目名。

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/12-project-rename.mjs`：

```js
import { eq, ok } from '../assert.mjs';

export const name = 'P2-3 项目名可双击修改并贯通到标题栏与草稿';

const NEW_NAME = '测试改名工程';

export default async function (page) {
  const sidebarName = page.locator('.next-project-name').first();
  ok((await sidebarName.count()) > 0, '找不到侧栏项目名');

  await sidebarName.dblclick();

  const input = page.locator('input[aria-label="项目名称"]');
  ok((await input.count()) === 1, '双击后应出现项目名输入框');

  await input.fill(NEW_NAME);
  await input.press('Enter');
  await page.waitForTimeout(200);

  eq(await page.locator('.next-project-name').first().innerText(), NEW_NAME, '侧栏项目名');

  // 标题栏中央的项目名必须同步（它是同一份状态的另一处呈现）
  const titleBar = await page.locator('header').innerText();
  ok(titleBar.includes(NEW_NAME), `标题栏应显示新项目名，实际 header 文本：${titleBar}`);

  // 草稿槽里的 metadata.name 必须一起改（项目名 = 插件名，导出包靠它）
  const draftName = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('gispro-ribbon-designer-projects') ?? '{}');
    const id = meta.activeProjectId;
    const doc = JSON.parse(localStorage.getItem(`gispro-ribbon-designer-doc-${id}`) ?? '{}');
    return doc?.metadata?.name ?? null;
  });
  eq(draftName, NEW_NAME, '草稿槽 metadata.name');

  // 空名必须回退，不允许出现空标题
  const input2 = page.locator('.next-project-name').first();
  await input2.dblclick();
  const input3 = page.locator('input[aria-label="项目名称"]');
  await input3.fill('');
  await input3.press('Enter');
  await page.waitForTimeout(200);
  ok(
    (await page.locator('.next-project-name').first().innerText()).trim().length > 0,
    '清空项目名后应回退为「未命名」而不是空串',
  );
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check rename
```

Expected: FAIL，信息含 `双击后应出现项目名输入框`（`input[aria-label="项目名称"]` 不存在）。

- [ ] **Step 3: 给 ProjectEntry 加 name 字段**

在 `designer-app/src/ui/Designer.tsx` 的 `ProjectEntry` 接口（约 203 行）里加一行：

```ts
interface ProjectEntry {
  id: string;
  name: string;
  document: RibbonDocument;
  filePath: string | null;
  dirty: boolean;
  activeTabId: string;
  collapsed: boolean;
}
```

在 `StoredProjectMeta` 接口（约 212 行）里同样加：

```ts
interface StoredProjectMeta {
  id: string;
  name: string;
  filePath: string | null;
  dirty: boolean;
  activeTabId: string;
  collapsed: boolean;
}
```

- [ ] **Step 4: makeProjectEntry 初始化 name**

在 `makeProjectEntry`（约 218 行）的返回对象里加 `name`，并允许通过 opts 覆盖：

```ts
const makeProjectEntry = (
  document: RibbonDocument,
  opts: { id?: string; name?: string; filePath?: string | null; dirty?: boolean } = {},
): ProjectEntry => ({
  id: opts.id ?? createId('proj'),
  name: opts.name ?? document.metadata.name ?? '未命名',
  document,
  filePath: opts.filePath ?? null,
  dirty: opts.dirty ?? true,
  activeTabId: document.tabs[0]?.id ?? '',
  collapsed: false,
});
```

- [ ] **Step 5: 会话恢复读写 name**

在 `loadInitialSession`（约 232 行）里，会话元数据还原项目的两处（读 `StoredProjectMeta` 构造 `ProjectEntry` 的地方）补上 `name`。形如：

```ts
        const entry = makeProjectEntry(document, {
          id: meta.id,
          name: meta.name,
          filePath: meta.filePath,
          dirty: meta.dirty,
        });
        entry.activeTabId = meta.activeTabId;
        entry.collapsed = meta.collapsed;
        return entry;
```

并在写会话元数据的地方（把 `ProjectEntry[]` 映射成 `StoredProjectMeta[]` 处）补 `name: project.name`。

**兼容旧数据**：老会话没有 `name` 字段，`meta.name` 会是 `undefined`，`makeProjectEntry` 的 `?? '未命名'` 会兜住——但更好的回退是 `document.metadata.name`，因为那才是老版本真正的显示名。所以读取时写成 `name: meta.name ?? document.metadata.name`。

- [ ] **Step 6: projectTitle 去掉 filePath 分支**

把（约 555 行）：

```ts
  const projectTitle = (project: ProjectEntry) =>
    project.filePath
      ? splitPath(project.filePath).name.replace(/\.json$/i, '')
      : project.document.metadata.name || '未命名';
```

改为：

```ts
  // 项目名是独立的用户可编辑字段，恒显示它——不再回退到文件名。
  // 原因：metadata.name 同时是导出包里 <AddInInfo>/<Name> 的插件名，
  // 若被文件名顶掉，用户改的名一保存就失效（见 spec §2.1 / D3）。
  const projectTitle = (project: ProjectEntry) => project.name || '未命名';
```

- [ ] **Step 7: 拆雷甲——保存不再覆盖 metadata.name**

在约 1004 行，把：

```ts
        metadata: { ...entry.document.metadata, name: name.replace(/\.json$/i, '') },
```

改为：

```ts
        // 保存不再用文件名覆盖 metadata.name（拆雷甲）：
        // 项目名是用户资产，也是导出包的插件名，不能被文件系统命名绑架。
        metadata: entry.document.metadata,
```

**同时**：从 `.json` **打开**项目时（该分支在 `addProject` 里，搜 `filePath` 与 `dirty` 的赋值处），新建 ProjectEntry 要一并设 `name`，**且两个分量的顺序不能反**——文档自带的 `metadata.name` 优先，文件名（去 `.json`）只在文档无名字时兜底：

```ts
        name: opts.filePath
          ? base.metadata.name || splitPath(opts.filePath).name.replace(/\.json$/i, '')
          : undefined,
```

> 2026-09-15 执行时修正：本步原文写的是「把文件名（去 `.json`）写进 `name`」，与本任务 Step 14 要求的「改名→另存为→重开仍显示新名」自相矛盾（文件名会顶掉用户刚改的名）。实现改为**文档名优先、文件名只作回退**，与本步 Step 6 的「项目名恒显示 `project.name`」一致。

- [ ] **Step 8: 侧栏项目名改成可双击编辑**

把侧栏里的（约 1612 行）：

```tsx
                <span className="next-project-name">{projectTitle(project)}</span>
```

替换为：

```tsx
                {renamingProjectId === project.id ? (
                  <input
                    className="next-project-name-input"
                    aria-label="项目名称"
                    autoFocus
                    defaultValue={projectTitle(project)}
                    onBlur={(event) => commitProjectName(project.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitProjectName(project.id, event.currentTarget.value);
                      }
                      if (event.key === 'Escape') setRenamingProjectId(null);
                    }}
                  />
                ) : (
                  <span
                    className="next-project-name"
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setRenamingProjectId(project.id);
                    }}
                  >
                    {projectTitle(project)}
                  </span>
                )}
```

- [ ] **Step 9: 加状态与提交函数**

在组件顶部状态区（与其他 `useState` 并列处）加：

```ts
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
```

在 `addTabTo` 之类的既有项目级操作函数附近加：

```ts
  // 改名：同步 entry.name 与 document.metadata.name。
  // 空名回退「未命名」，不允许产生空标题。
  // 项目名属项目元数据，不进文档 undo 栈（undo 管的是画布内容）。
  const commitProjectName = (projectId: string, raw: string) => {
    setRenamingProjectId(null);
    const entry = projectsRef.current.find((project) => project.id === projectId);
    if (!entry) return;
    const next = raw.trim() || '未命名';
    if (entry.name === next) return;
    updateProject(projectId, {
      name: next,
      dirty: true,
      document: {
        ...entry.document,
        metadata: { ...entry.document.metadata, name: next },
      },
    });
  };
```

`updateProject(id, patch: Partial<ProjectEntry>)` 是文件里既有的项目级更新入口（`Designer.tsx:356`），脏标记就走它的 `dirty: true`——**不存在 `touchProject` 这样的函数**，别去造一个。

**为什么改名不进 undo 栈**：CLAUDE.md 记的 undo 语义是"每项目独立双栈 + `commit()` 单一入口"，管的是画布内容。项目名是文件级元数据（与 `filePath`、`collapsed` 同类），和它们一样不进栈。

- [ ] **Step 10: 标题栏同步**

标题栏中央已在读 `activeProjectTitle`（约 560 行），而 `activeProjectTitle` 派生自 `projectTitle(activeProject)`，第 6 步改完后会自动跟随。**确认**：搜 `activeProjectTitle` 的渲染处，确保它直接或间接来自 `projectTitle()`，而不是来自 `currentFile`。

- [ ] **Step 11: 加输入框样式**

在 `designer-app/src/ui/designer.css` 的「04 左侧页签栏」段，`.next-project-name` 规则之后加：

```css
.next-project-name-input {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--h-ctl-sm);
  padding: 0 var(--sp-3);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--bg-surface);
  color: inherit;
  font: inherit;
}
```

`color: inherit` 不可省——`.next-shell input` 默认不继承 color，暗色下会退回 UA 黑字。

- [ ] **Step 12: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check rename
```

Expected: PASS。

- [ ] **Step 13: 类型检查**

```bash
cd designer-app && npx tsc --noEmit
```

Expected: 无输出（通过）。若报 `Property 'name' is missing`，说明还有构造 `ProjectEntry` 的地方没补 `name`——搜 `makeProjectEntry(` 与直接的对象字面量。

- [ ] **Step 14: 人工验收保存路径（浏览器验不了，必须走 Tauri）**

这条对应验收标准 A3，Playwright 无法覆盖（保存走 `invoke`）：

```bash
cd designer-app && npm run tauri dev
```

1. 双击项目名改成「我的工具箱」
2. `Ctrl+S` → 另存为 `test-rename.json`
3. **关掉应用重开**
4. 打开 `test-rename.json`

Expected: 标题栏显示「我的工具箱」（而不是 `test-rename`）。若显示 `test-rename`，说明还有别处在覆盖 `metadata.name`——搜 `metadata.name` 的所有赋值点。

- [ ] **Step 15: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/12-project-rename.mjs
git commit -m "feat: 项目名可双击修改，并与文件名解耦

ProjectEntry 新增独立 name 字段，projectTitle() 恒返回它而不再回退
文件名；保存时不再用文件名覆盖 metadata.name（拆雷甲）。项目名同时
是导出包的插件名，原先「改名→保存→被文件名顶掉」使功能形同虚设。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: P2-4 导出身份 GUID 修正

**先复现，再修。** spec §2.1 的推论（每次编辑换 GUID）尚未实测，A4a 就是补这一刀。若复现失败，停止本任务并回报——说明推论有误。

**Files:**
- Create: `tools/ui-check/node-checks/addin-id.mts`
- Modify: `designer-app/src/core/arcgisProValidation.ts:221`
- Modify: `ribbon-designer/shared/arcgisProValidation.ts`（同位置，镜像）
- Modify: `tools/ui-check/package.json`（加 `check:node` 脚本）

**Interfaces:**
- Consumes: `buildConfigDaml(document, overrides?) => string`（`arcgisProValidation.ts:872` 导出）
- Produces: 无新接口

- [ ] **Step 1: 写复现脚本**

创建 `tools/ui-check/node-checks/addin-id.mts`：

```ts
// 断言：同一设计稿在不同编辑时刻（metadata.lastUpdated 不同）导出，
// <AddInInfo id> 必须保持一致。ArcGIS Pro 用该 id 作插件安装目录名，
// id 抖动会导致 Pro 里累积多份同名插件而非更新已有那份。
// 用法：node --experimental-strip-types tools/ui-check/node-checks/addin-id.mts
import { buildConfigDaml } from '../../../designer-app/src/core/arcgisProValidation.ts';
import type { RibbonDocument } from '../../../designer-app/src/core/types.ts';

// 最小可导出的文档：一个页签、一个分组、一个按钮。
// 不引 demoLayout 是为了让本检查的输入完全自足、不受别处改动影响。
const makeDoc = (lastUpdated: string): RibbonDocument =>
  ({
    metadata: {
      id: 'doc_stable0001',
      name: '恒定插件名',
      app: 'gispro-ribbon-designer',
      schemaVersion: '1.0',
      lastUpdated,
    },
    tabs: [
      {
        id: 'tab_1',
        caption: '测试页签',
        keytip: 'T1',
        groupIds: ['grp_1'],
      },
    ],
    groups: [
      {
        id: 'grp_1',
        caption: '测试分组',
        subgroupIds: ['sub_1'],
      },
    ],
    subgroups: [
      {
        id: 'sub_1',
        controlIds: ['ctl_1'],
        layout: { columns: 8 },
      },
    ],
    controls: [
      {
        id: 'ctl_1',
        type: 'button',
        caption: '测试按钮',
        size: 'large',
        tooltip: '测试用',
        aiNotes: '',
        icon: {},
        behavior: { className: 'Test.Button', target: 'Test', arguments: {} },
        layout: { x: 0, y: 0, w: 2, h: 3 },
        children: [],
      },
    ],
    // 返回类型标注已是 RibbonDocument，tsc 会在此校验字段完整性——
    // 若报缺字段，照提示补齐。不要用 as 强转绕过去（那会屏蔽掉这个校验）。
  });

const extractAddInId = (daml: string): string => {
  const match = daml.match(/<AddInInfo[^>]*\bid="([^"]+)"/i);
  if (!match) throw new Error('生成的 DAML 里找不到 <AddInInfo id="...">');
  return match[1];
};

const early = extractAddInId(buildConfigDaml(makeDoc('2026-01-01T00:00:00.000Z')));
const late = extractAddInId(buildConfigDaml(makeDoc('2026-09-15T12:34:56.000Z')));

console.log(`  早期编辑时刻的 addInId：${early}`);
console.log(`  后期编辑时刻的 addInId：${late}`);

if (early !== late) {
  console.error('\nFAIL：同一设计稿在不同编辑时刻导出，插件身份 GUID 不同。');
  console.error('      ArcGIS Pro 会把它装进不同目录，导致同名插件在 Pro 里累积。');
  process.exit(1);
}

console.log('\nPASS：插件身份 GUID 稳定。');
```

- [ ] **Step 2: 跑它，确认复现（A4a）**

```bash
node --experimental-strip-types tools/ui-check/node-checks/addin-id.mts
```

Expected: **FAIL**，两个 GUID 不同。这就是复现成功——证明 spec §2.1 的推论成立。

> 若此处 **PASS**（两个 GUID 相同），**停止本任务并回报**：说明 `lastUpdated` 没有进入种子，推论有误，spec §2.1 需要修正。

- [ ] **Step 3: 修 designer-app 侧**

在 `designer-app/src/core/arcgisProValidation.ts` 约 218-222 行，把：

```ts
    addInId:
      merged.addInId ||
      stableGuid(
        `${merged.assemblyName}:${document.metadata.id}:${document.metadata.name}:${document.metadata.lastUpdated}`,
      ),
```

改为：

```ts
    // 插件身份 GUID 只由稳定字段派生。
    // 原先种子里含 metadata.name 与 metadata.lastUpdated，而 commit() 每次
    // 编辑都会刷新 lastUpdated —— 于是拖一个控件再导出，GUID 就变了，
    // ArcGIS Pro 会把它当成全新插件装进新目录，同名插件不断累积。
    addInId: merged.addInId || stableGuid(`${merged.assemblyName}:${document.metadata.id}`),
```

- [ ] **Step 4: 镜像改 shared 侧**

在 `ribbon-designer/shared/arcgisProValidation.ts` 做出**完全相同**的改动（该文件行号约 217-221，内容一致）。

改完后核对两文件该函数体一致：

```bash
diff <(sed -n '210,230p' designer-app/src/core/arcgisProValidation.ts) <(sed -n '209,229p' ribbon-designer/shared/arcgisProValidation.ts)
```

Expected: 只有行号偏移造成的空行差异，逻辑无差异。（两个文件历史上就允许存在少量偏移，关键是 `addInId` 那一行的表达式完全一致。）

- [ ] **Step 5: 跑检查，确认通过（A4b）**

```bash
node --experimental-strip-types tools/ui-check/node-checks/addin-id.mts
```

Expected: **PASS**，两个 GUID 相同。

- [ ] **Step 6: 接进 ui-check 的 npm 脚本**

在 `tools/ui-check/package.json` 的 `scripts` 里加一行：

```json
    "check:node": "node --experimental-strip-types node-checks/addin-id.mts"
```

跑一遍确认：

```bash
cd tools/ui-check && npm run check:node
```

Expected: PASS。

- [ ] **Step 7: 确认没碰坏 DAML 生成**

```bash
node --experimental-strip-types tools/test-daml-roundtrip.mts
```

Expected: 通过（该脚本比对 DAML 往返一致性，`addInId` 变更不应影响结构）。

- [ ] **Step 8: 提交**

```bash
git add designer-app/src/core/arcgisProValidation.ts ribbon-designer/shared/arcgisProValidation.ts tools/ui-check
git commit -m "fix: 插件身份 GUID 随每次编辑抖动，导致 Pro 里累积重复插件

addInId 种子含 metadata.name 与 metadata.lastUpdated，而 commit() 每次
编辑都刷新 lastUpdated。ArcGIS Pro 用 <AddInInfo id> 作安装目录名（本机
4 个 GUID 目录 4/4 与各自包内 id 一致），故每次导出都装进新目录而非更新。
种子改为只含稳定字段 assemblyName + metadata.id。两个变体已镜像修改。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: P3-1 画布页签条

画布现在完全没有页签——它是 Pro ribbon 最显眼的特征，缺了它画布认不出是 ribbon。

**Files:**
- Modify: `designer-app/src/ui/Designer.tsx`（画布渲染块 1750-1798）
- Modify: `designer-app/src/ui/designer.css`（06 画布段）
- Test: `tools/ui-check/checks/20-canvas-tabs.mjs`

**Interfaces:**
- Consumes: `document.tabs: RibbonTab[]`（含 `id` / `caption` / `keytip` / `groupIds`）；`activeTabId`；既有的切换页签入口（侧栏 `.next-tab-item` 的 onClick 所用同一个 setter）
- Produces: DOM 契约——画布页签条 `.next-canvas-tabs`，每个页签 `button.next-canvas-tab`，选中态加 `.active` 并带 `aria-selected="true"`。Task 9 的结构树点击页签时复用同一 setter。

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/20-canvas-tabs.mjs`：

```js
import { eq, ok } from '../assert.mjs';

export const name = 'P3-1 画布页签条存在、可切换、且与侧栏双向联动';

export default async function (page) {
  // 先加一个页签，确保有得切
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(200);

  const canvasTabs = page.locator('.next-canvas-tab');
  const sidebarTabs = page.locator('.next-tab-item');

  const canvasCount = await canvasTabs.count();
  const sidebarCount = await sidebarTabs.count();
  ok(canvasCount > 0, '画布上应有页签条');
  eq(canvasCount, sidebarCount, '画布页签数应等于侧栏页签数');

  // 点画布上的第一个页签
  await canvasTabs.first().click();
  await page.waitForTimeout(200);

  eq(
    await canvasTabs.first().getAttribute('aria-selected'),
    'true',
    '画布页签选中态',
  );
  eq(
    (await sidebarTabs.first().getAttribute('class'))?.includes('active'),
    true,
    '侧栏对应页签应同步高亮',
  );

  // 反向：点侧栏最后一个页签
  await sidebarTabs.last().click();
  await page.waitForTimeout(200);

  eq(
    (await canvasTabs.last().getAttribute('class'))?.includes('active'),
    true,
    '画布页签应跟随侧栏切换',
  );

  // keytip 应显示在页签上（Pro 的实际行为）
  const keytip = await canvasTabs.first().innerText();
  ok(/T\d/.test(keytip), `画布页签应含 keytip，实际文本：${keytip}`);
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check canvas-tabs
```

Expected: FAIL，信息含 `画布上应有页签条`。

- [ ] **Step 3: 加画布页签条 JSX**

在 `designer-app/src/ui/Designer.tsx` 的画布渲染块，把：

```tsx
            <section className="next-canvas">
              <div className="next-ribbon-area">
```

改为：

```tsx
            <section className="next-canvas">
              {/* Pro 的 ribbon 顶部有一条页签条，这是它最显眼的特征。
                  点击与侧栏 .next-tab-item 走同一个入口 activateProject，双向联动。 */}
              <div className="next-canvas-tabs" role="tablist" aria-label="Ribbon 页签">
                {document.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={`next-canvas-tab${tab.id === activeTabId ? ' active' : ''}`}
                    aria-selected={tab.id === activeTabId}
                    onClick={() => activateProject(activeProject.id, tab.id)}
                    title={tab.caption}
                  >
                    <span className="next-canvas-tab-caption">{tab.caption}</span>
                    <span className="next-canvas-tab-keytip">{tab.keytip}</span>
                  </button>
                ))}
              </div>
              <div className="next-ribbon-area">
```

**切页签必须走 `activateProject(projectId, tabId)`** —— 这是侧栏页签用的同一个入口（`Designer.tsx:1633` 的 `onClick={() => activateProject(project.id, tab.id)}`）。**文件里不存在 `setActiveTabId` 这样的 setter**：页签切换走 `activateProject` → `updateProject(id, { activeTabId })`，它同时会 `setSelectedControlId(null)`。绕过它直接改 `activeTabId` 会漏掉选中态清理，画布上会残留一个属于旧页签的选中控件。

- [ ] **Step 4: 加样式**

在 `designer-app/src/ui/designer.css` 的「06 画布」段，`.next-ribbon-area` 规则**之前**插入：

```css
/* 画布页签条：还原 ArcGIS Pro 的 ribbon tab row。
   贴在 .next-canvas 顶部，选中页签底色与下方 ribbon 条带同色，形成「选中页签接续到条带」的观感。 */
.next-canvas-tabs {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-1);
  padding: 0 var(--sp-5);
  border-bottom: 1px solid var(--border);
  background: var(--bg-chrome);
  flex: 0 0 auto;
}

.next-canvas-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--h-ctl);
  padding: 0 var(--sp-5);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--radius) var(--radius) 0 0;
  background: transparent;
  color: var(--ink-2);
  font-size: var(--fs-base);
  cursor: pointer;
}

.next-canvas-tab:hover {
  color: var(--ink);
  background: var(--bg-sunken);
}

.next-canvas-tab.active {
  border-color: var(--border);
  background: var(--bg-surface);
  color: var(--accent-ink);
  font-weight: 600;
}

.next-canvas-tab-keytip {
  color: var(--ink-4);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check canvas-tabs
```

Expected: PASS。

- [ ] **Step 6: 无障碍复扫**

```bash
cd tools/ui-check && npm run check smoke   # 确认整体没崩
```

然后打开 `http://localhost:1420` 切换到暗色，肉眼确认页签条在暗色下文字可读、选中态与未选中态可区分。

- [ ] **Step 7: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/20-canvas-tabs.mjs
git commit -m "feat: 画布补上 Pro 的 ribbon 页签条并与侧栏双向联动

画布原先 DOM 里没有任何 tab 元素，页签只存在于左侧栏，导致画布看不出
是 Pro 的 ribbon。新增 .next-canvas-tabs，与侧栏走同一个切换入口。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: P3-2 悬浮编辑条

把分组卡上常显的编辑入口（分组名输入框 / −列 / +列 / 复制 / 删除 / 批量尺寸）改为选中或悬停时浮现在分组框**外**上方。

**这个任务最容易埋无障碍回归**：`display: none` 会把按钮移出 tab 序，键盘用户永远够不到。必须用 `visibility`。

**Files:**
- Modify: `designer-app/src/ui/Designer.tsx`（`RibbonGroupView` 2222-2270）
- Modify: `designer-app/src/ui/designer.css`（06 画布段的 `.next-group-tools` / `.next-group-footer`）
- Test: `tools/ui-check/checks/21-group-tools-keyboard.mjs`

**Interfaces:**
- Consumes: Task 6 的页签条（无直接依赖，但同在画布区）
- Produces: DOM 契约——`.next-group-tools` 与 `.next-group-actions` 在非交互态 `visibility: hidden`，悬停/聚焦时 `visible`；分组容器 `.next-group` 可聚焦

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/21-group-tools-keyboard.mjs`：

```js
import { ok } from '../assert.mjs';

export const name = 'P3-2 分组编辑条键盘可达且拖拽时不闪现';

export default async function (page) {
  const group = page.locator('.next-group').first();
  const tools = group.locator('.next-group-tools');
  ok((await tools.count()) === 1, '分组内应有编辑条');

  // 关键：非交互态必须是 visibility:hidden，不能是 display:none —
  // display:none 会把按钮移出 tab 序，键盘用户永远够不到。
  const idleDisplay = await tools.evaluate((el) => getComputedStyle(el).display);
  ok(idleDisplay !== 'none', '编辑条不可用 display:none——会丢失键盘可达性');

  const idleVisibility = await tools.evaluate((el) => getComputedStyle(el).visibility);
  ok(idleVisibility === 'hidden', `非交互态应为 visibility:hidden，实际 ${idleVisibility}`);

  // 键盘：Tab 进分组后编辑条应可见，且能继续 Tab 到里面的按钮
  await group.focus();
  await page.waitForTimeout(200);
  const focusedVisibility = await tools.evaluate((el) => getComputedStyle(el).visibility);
  ok(focusedVisibility === 'visible', '分组获得焦点后编辑条应可见');

  const focusedReachable = await tools
    .locator('button')
    .first()
    .evaluate((el) => {
      el.focus();
      return document.activeElement === el;
    });
  ok(focusedReachable, '编辑条内的按钮必须可被聚焦');
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check group-tools
```

Expected: FAIL，信息含 `非交互态应为 visibility:hidden`（当前编辑条是常显的 `display:flex`）。

- [ ] **Step 3: 让分组可聚焦**

在 `RibbonGroupView`（约 2222 行）的 `<section className="next-group" ...>` 上补两个属性：

```tsx
    <section
      className="next-group"
      tabIndex={0}
      aria-label={`分组 ${group.caption}`}
      style={{ '--group-cols': spec.cols } as CSSProperties}
```

（保留原有的 `onContextMenu`。）

- [ ] **Step 4: 把批量尺寸从 footer 移到编辑条**

`RibbonGroupView` 里现在有两个 chrome 区：顶部的 `.next-group-tools` 和底部的 `.next-group-footer`（内含 `.next-group-caption` 与 `.next-group-batch`）。**分组名要留在 footer**（Pro 的真实形态就是分组名在底部），**批量尺寸要挪进顶部编辑条**。

把 footer 里的：

```tsx
      <div className="next-group-footer">
        <div className="next-group-caption">{group.caption}</div>
        <div className="next-group-batch">
          <span>批量尺寸</span>
          {(['large', 'middle', 'small'] as const).map((size) => (
            <button key={size} onClick={() => onResizeGroup(group.id, size)}>
              {SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </div>
```

改为：

```tsx
      <div className="next-group-footer">
        <div className="next-group-caption">{group.caption}</div>
      </div>
```

并把被移出的批量尺寸块，插进 `.next-group-tools` 内、删除按钮之后：

```tsx
        <div className="next-group-batch">
          <span>批量尺寸</span>
          {(['large', 'middle', 'small'] as const).map((size) => (
            <button key={size} onClick={() => onResizeGroup(group.id, size)}>
              {SIZE_LABELS[size]}
            </button>
          ))}
        </div>
```

- [ ] **Step 5: 改样式——悬浮/聚焦才显示**

在 `designer-app/src/ui/designer.css` 的「06 画布」段，`.next-group` 规则里补 `position: relative`，并给 `.next-group-tools` 换成浮层样式：

```css
.next-group {
  position: relative;   /* 悬浮编辑条的定位基准 */
  /* …其余原有声明保持不变… */
}

/* 分组编辑条：平时隐藏，悬停或获得焦点时浮现在分组框「上方外部」。
   必须用 visibility 而非 display——display:none 会把按钮移出 tab 序，
   键盘用户永远够不到（无障碍回归）。 */
.next-group-tools {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  z-index: var(--z-pop);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-height: 28px;
  margin-bottom: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
  box-shadow: var(--shadow-2);
  color: var(--ink-2);
  font-size: var(--fs-sm);
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--t-fast) var(--ease), visibility var(--t-fast) var(--ease);
}

.next-group:hover .next-group-tools,
.next-group:focus-within .next-group-tools {
  visibility: visible;
  opacity: 1;
}

/* 拖拽进行中抑制浮现，否则拖控件横穿分组时编辑条会一路闪烁 */
.next-shell.dragging .next-group-tools {
  visibility: hidden;
  opacity: 0;
}
```

- [ ] **Step 6: 加拖拽中的类名**

在 `designer-app/src/ui/Designer.tsx` 里找到根 shell 的 className（形如 `<div className="next-shell">`），改为带条件：

```tsx
      <div className={`next-shell${drag ? ' dragging' : ''}`}>
```

`drag` 是既有的拖拽状态变量（`DragState | null`）。

- [ ] **Step 7: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check group-tools
```

Expected: PASS。

- [ ] **Step 8: 手工验键盘走查**

打开 `http://localhost:1420`：

1. 鼠标移到画布外（确保没有 hover）
2. 反复按 `Tab`，直到焦点落到分组上
3. Expected：编辑条浮现，继续按 `Tab` 能依次走到「分组名 / −列 / +列 / 复制 / （删除）/ 批量尺寸 大 中 小」
4. `Shift+Tab` 反向也应正常，最终能走出去（不会把焦点困住）

- [ ] **Step 9: 手工验拖拽不闪**

从底部控件库按住一个卡片拖到画布上，横向扫过分组区域。

Expected: 编辑条全程不出现。

- [ ] **Step 10: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/21-group-tools-keyboard.mjs
git commit -m "feat: 分组编辑条改为悬浮，画布恢复 Pro 的干净观感

编辑入口（分组名/列数/复制/删除/批量尺寸）原先常显在分组卡上，而 Pro
的分组只有「控件在上、分组名在下」两样，导致画布始终像编辑器而非 ribbon。
改为悬停或聚焦时浮现在分组框外上方。用 visibility 而非 display，保住
键盘可达性；拖拽中抑制浮现，避免横穿分组时闪烁。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: P3-3 画布与控件库的空间分配

把画布多余的纵向空间让给底部控件库，并给用户一条可拖拽的分隔条自己调节。

**Files:**
- Modify: `designer-app/src/ui/designer.css`（06 画布段、10 控件库段）
- Modify: `designer-app/src/ui/Designer.tsx`（画布行与控件库之间插入分隔条）
- Test: `tools/ui-check/checks/22-splitter.mjs`

**Interfaces:**
- Consumes: Task 2 已让 `.next-bottom-palette` 可滚
- Produces: DOM 契约——`.next-splitter` 分隔条（`role="separator"`、`aria-orientation="horizontal"`、`tabIndex=0`）；localStorage 键 `gispro-ribbon-designer-palette-height`

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/22-splitter.mjs`：

```js
import { ok } from '../assert.mjs';

export const name = 'P3-3 分隔条可拖拽、可键盘调节、且跨会话记忆';

export default async function (page) {
  const splitter = page.locator('.next-splitter');
  ok((await splitter.count()) === 1, '应存在分隔条');
  ok(
    (await splitter.getAttribute('role')) === 'separator',
    '分隔条应有 role="separator"',
  );

  const paletteHeight = () =>
    page.locator('.next-bottom-palette').evaluate((el) => el.getBoundingClientRect().height);

  const before = await paletteHeight();

  // 键盘：聚焦后用方向键调高
  await splitter.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  const afterUp = await paletteHeight();
  ok(afterUp > before, `上方向键应增高控件库：${before} → ${afterUp}`);

  // 跨会话记忆
  const stored = await page.evaluate(() =>
    localStorage.getItem('gispro-ribbon-designer-palette-height'),
  );
  ok(stored !== null, '高度应写入 localStorage');
  ok(Math.abs(Number(stored) - afterUp) < 2, `存储值 ${stored} 应与实际高度 ${afterUp} 一致`);

  await page.reload();
  await page.waitForSelector('.next-shell');
  await page.waitForTimeout(250);
  const afterReload = await paletteHeight();
  ok(
    Math.abs(afterReload - afterUp) < 4,
    `刷新后应恢复记忆高度：期望约 ${afterUp}，实际 ${afterReload}`,
  );
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check splitter
```

Expected: FAIL，信息含 `应存在分隔条`。

- [ ] **Step 3: 加分隔条 JSX**

在 `designer-app/src/ui/Designer.tsx` 里，`.next-canvas-row` 的 `</main>` 之后、`<section className="next-bottom-palette"` 之前，插入：

```tsx
          {/* 画布与控件库之间的可拖拽分隔条。画布不再无条件吃掉剩余空间，
              用户可以把空间分给控件库——P5 的卡片 mock 需要更多高度。 */}
          <div
            className="next-splitter"
            role="separator"
            aria-orientation="horizontal"
            aria-label="调整控件库高度"
            tabIndex={0}
            onPointerDown={startPaletteResize}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                nudgePaletteHeight(16);
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                nudgePaletteHeight(-16);
              }
            }}
          />
```

- [ ] **Step 4: 加状态与处理函数**

在组件状态区加：

```ts
  const PALETTE_MIN = 120;
  const PALETTE_MAX = 460;
  const PALETTE_KEY = 'gispro-ribbon-designer-palette-height';

  const [paletteHeight, setPaletteHeight] = useState<number>(() => {
    const raw = Number(localStorage.getItem(PALETTE_KEY));
    return Number.isFinite(raw) && raw >= PALETTE_MIN && raw <= PALETTE_MAX ? raw : 320;
  });

  useEffect(() => {
    localStorage.setItem(PALETTE_KEY, String(Math.round(paletteHeight)));
  }, [paletteHeight]);

  const clampPalette = (value: number) =>
    Math.min(PALETTE_MAX, Math.max(PALETTE_MIN, value));

  const nudgePaletteHeight = (delta: number) =>
    setPaletteHeight((current) => clampPalette(current + delta));

  const startPaletteResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = paletteHeight;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      // 向上拖 → 控件库变高
      setPaletteHeight(clampPalette(startHeight + (startY - moveEvent.clientY)));
    };
    const onUp = () => {
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
```

`PALETTE_MIN` / `PALETTE_MAX` / `PALETTE_KEY` 三个常量若放在组件内会被每次渲染重建，移到组件外的模块级常量区。

- [ ] **Step 5: 把高度接到控件库上**

给 `<section className="next-bottom-palette" ...>` 加内联高度：

```tsx
          <section
            className="next-bottom-palette"
            aria-label="控件库"
            style={{ height: paletteHeight, maxHeight: 'none' }}
          >
```

`maxHeight: 'none'` 是为了压过 CSS 里的 `max-height`，让内联的 `height` 说了算。

- [ ] **Step 6: 同步改 CSS**

在 `designer-app/src/ui/designer.css` 里：

`.next-bottom-palette` 的 `max-height: min(40vh, 280px);` 一行改为 `max-height: none;`（高度改由内联样式控制），保留 `overflow-y: auto`。

在「06 画布」段末尾加分隔条样式：

```css
/* 画布/控件库之间的分隔条。视觉上是一条细线，热区用 ::after 撑到 8px。 */
.next-splitter {
  position: relative;
  flex: 0 0 auto;
  height: 4px;
  margin: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-chrome);
  cursor: ns-resize;
}

.next-splitter::after {
  content: '';
  position: absolute;
  inset: -4px 0;
}

.next-splitter:hover,
.next-splitter:focus-visible {
  background: var(--accent-soft);
}
```

- [ ] **Step 7: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check splitter
```

Expected: PASS。

- [ ] **Step 8: 跑全量检查，确认没有互相撞坏**

```bash
cd tools/ui-check && npm run check
```

Expected: 全部 PASS（含 Task 2 的 palette 检查——它断言 `overflow-y` 可滚，本任务保留了 `auto`，应仍通过）。

若 Task 2 的检查失败，说明 `max-height: none` 让内容全展开了、不再需要滚动——那是对的，但检查写死了「必须可滚」。此时把 Task 2 检查的断言放宽为「或全部可见，或可滚」，并把 Task 2 的提交一并修正。

- [ ] **Step 9: 手工验边界**

打开 `http://localhost:1420`：

- 把分隔条往上拖到顶 → 控件库到 460px 就停住，画布仍留有可用高度（若画布被压到 ribbon 条带放不下，把 `PALETTE_MAX` 调小）
- 往下拖到底 → 控件库到 120px 停住，不会拖成 0
- 缩放窗口到 1100×700 → 布局不破，控件库仍可滚

- [ ] **Step 10: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/22-splitter.mjs
git commit -m "feat: 画布与控件库之间加可拖拽分隔条，空间分配交给用户

画布原先无条件吃掉剩余纵向空间（ribbon 条带只占 340px，画布高 694px，
下半屏纯空白）。改为分隔条可拖拽 + 方向键可调 + 跨会话记忆，
为 P5 的卡片 mock 腾出高度。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: P4 右栏文档结构树

右栏 320px 现在空态只是一行灰字，占屏宽 22.2% 却什么都没干。

**Files:**
- Create: `designer-app/src/ui/DocumentOutline.tsx`
- Modify: `designer-app/src/ui/Designer.tsx`（`next-side` 渲染块 1800-1826）
- Modify: `designer-app/src/ui/designer.css`（09 右侧属性面板段）
- Test: `tools/ui-check/checks/30-outline.mjs`

**Interfaces:**
- Consumes: `document: RibbonDocument`（tabs/groups/controls）；`activeTabId`；`activateProject(projectId, tabId)`（既有的页签切换入口，`Designer.tsx:381`）；`selectedControlId`；`setSelectedControlId(id)`
- Produces: `DocumentOutline` 组件，props 形状见下

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/30-outline.mjs`：

```js
import { eq, ok } from '../assert.mjs';

export const name = 'P4 右栏空态渲染文档结构树，点击可定位';

export default async function (page) {
  const outline = page.locator('.next-outline');
  ok((await outline.count()) === 1, '未选中控件时右栏应显示结构树');

  // 加一个页签，让树有多级
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(200);

  const tabNodes = page.locator('.next-outline-tab');
  const sidebarTabs = page.locator('.next-tab-item');
  eq(await tabNodes.count(), await sidebarTabs.count(), '树里的页签数应等于侧栏页签数');

  // 点树里的第二个页签 → 画布页签条同步
  await tabNodes.last().click();
  await page.waitForTimeout(200);
  eq(
    (await page.locator('.next-canvas-tab').last().getAttribute('class'))?.includes('active'),
    true,
    '点结构树应切换画布页签',
  );

  // 点树里的控件 → 右栏切成属性表单，且画布控件被选中
  const controlNode = page.locator('.next-outline-control').first();
  ok((await controlNode.count()) > 0, '树里应有控件节点');
  await controlNode.click();
  await page.waitForTimeout(200);

  ok(
    (await page.locator('.next-inspector').count()) === 1,
    '选中控件后右栏应切为属性表单',
  );
  ok(
    (await page.locator('.next-ribbon-control.selected').count()) >= 1,
    '画布上对应控件应呈选中态',
  );

  // 取消选中后回到结构树
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok((await page.locator('.next-outline').count()) === 1, '取消选中后应回到结构树');
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check outline
```

Expected: FAIL，信息含 `未选中控件时右栏应显示结构树`。

- [ ] **Step 3: 建 DocumentOutline 组件**

创建 `designer-app/src/ui/DocumentOutline.tsx`：

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { RibbonDocument } from '../core/types';

// 右栏空态：把当前文档的 页签 → 分组 → 控件 三级结构摊开，
// 既是导航入口，也填掉了右栏 320px 的死区。
export function DocumentOutline({
  document,
  activeTabId,
  selectedControlId,
  onSelectTab,
  onSelectControl,
}: {
  document: RibbonDocument;
  activeTabId: string;
  selectedControlId: string | null;
  onSelectTab: (tabId: string) => void;
  onSelectControl: (controlId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setCollapsed((current) => ({ ...current, [id]: !current[id] }));

  return (
    <nav className="next-outline" aria-label="文档结构">
      <div className="next-outline-head">文档结构</div>
      <ul className="next-outline-list">
        {document.tabs.map((tab) => {
          const groups = tab.groupIds
            .map((groupId) => document.groups.find((group) => group.id === groupId))
            .filter(Boolean);
          const isCollapsed = collapsed[tab.id] ?? false;

          return (
            <li key={tab.id}>
              <div className={`next-outline-row next-outline-tab${tab.id === activeTabId ? ' active' : ''}`}>
                <button
                  type="button"
                  className="next-outline-toggle"
                  aria-label={isCollapsed ? `展开 ${tab.caption}` : `折叠 ${tab.caption}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(tab.id)}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <button
                  type="button"
                  className="next-outline-label"
                  onClick={() => onSelectTab(tab.id)}
                >
                  {tab.caption}
                </button>
              </div>

              {!isCollapsed ? (
                <ul className="next-outline-list">
                  {groups.map((group) => {
                    const subgroup = document.subgroups.find(
                      (item) => item.id === group!.subgroupIds[0],
                    );
                    const controls = (subgroup?.controlIds ?? [])
                      .map((controlId) =>
                        document.controls.find((control) => control.id === controlId),
                      )
                      .filter(Boolean);

                    return (
                      <li key={group!.id}>
                        <div className="next-outline-row next-outline-group">
                          <span className="next-outline-spacer" />
                          <span className="next-outline-label muted">{group!.caption}</span>
                        </div>
                        <ul className="next-outline-list">
                          {controls.map((control) => (
                            <li key={control!.id}>
                              <button
                                type="button"
                                className={`next-outline-row next-outline-control${
                                  control!.id === selectedControlId ? ' active' : ''
                                }`}
                                onClick={() => onSelectControl(control!.id)}
                              >
                                <span className="next-outline-spacer" />
                                <span className="next-outline-label">{control!.caption}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: 接进右栏**

在 `designer-app/src/ui/Designer.tsx` 的右栏渲染块（约 1800-1826 行），把空态那段：

```tsx
              ) : (
                <div className="next-empty-inspector">
                  <span>点击画布上的控件编辑属性</span>
                </div>
              )}
```

替换为：

```tsx
              ) : (
                <DocumentOutline
                  document={document}
                  activeTabId={activeTabId}
                  selectedControlId={selectedControlId}
                  onSelectTab={(tabId) => activateProject(activeProject.id, tabId)}
                  onSelectControl={(controlId) => setSelectedControlId(controlId)}
                />
              )}
```

**注意**：`onSelectTab` 必须与 Task 6 画布页签条、侧栏用**同一个** setter。

在文件顶部加导入：

```tsx
import { DocumentOutline } from './DocumentOutline';
```

- [ ] **Step 5: 加样式**

在 `designer-app/src/ui/designer.css` 的「09 右侧属性面板」段，`.next-empty-inspector` 规则之后加：

```css
/* 右栏结构树 */
.next-outline {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.next-outline-head {
  flex: 0 0 auto;
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 var(--sp-5);
  border-bottom: 1px solid var(--border-soft);
  color: var(--ink-2);
  font-size: var(--fs-base);
  font-weight: 600;
}

.next-outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
}

.next-outline-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-height: var(--h-ctl-sm);
  padding: 0 var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-size: var(--fs-base);
  text-align: left;
  cursor: pointer;
}

.next-outline-row:hover {
  background: var(--bg-sunken);
}

.next-outline-row.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.next-outline-toggle {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.next-outline-spacer {
  width: 16px;
  flex: 0 0 16px;
}

.next-outline-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.next-outline-label.muted {
  color: var(--ink-3);
  cursor: default;
}

/* 缩进：分组一级、控件两级 */
.next-outline-list .next-outline-list {
  padding-left: var(--sp-5);
}
```

- [ ] **Step 6: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check outline
```

Expected: PASS。

- [ ] **Step 7: 类型检查**

```bash
cd designer-app && npx tsc --noEmit
```

Expected: 无输出。

- [ ] **Step 8: 无障碍复扫（本任务新增了交互元素，必须重扫）**

按 CLAUDE.md 的方法，用 Playwright 注入 axe-core 扫浅色与暗色：

```bash
cd designer-app && npm run dev
```

在浏览器控制台注入 `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js`，跑 `axe.run()`。

Expected: 浅色与暗色 `violations` 均为空数组。

> ⚠️ **切主题后必须轮询等计算样式变成新值再扫**，否则会读到旧背景色产生假违规（CLAUDE.md 记录过这个坑，等待约 1 秒）。

- [ ] **Step 9: 提交**

```bash
git add designer-app/src/ui/DocumentOutline.tsx designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/30-outline.mjs
git commit -m "feat: 右栏空态改为文档结构树

右栏固定 320px（占屏宽 22.2%），未选中控件时只有一行灰字提示，是块死区。
改为渲染 页签→分组→控件 三级树，点击可切换页签/选中控件并定位。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: P5 控件库卡片渲染真实 mock

**这个任务推翻了 CLAUDE.md 里的一条既有决定**，理由见 spec §6：旧决定的成立前提是"紧凑卡要全量类型一次显示，渲染实体塞不下"，而 Task 8 给了控件库可调高度，前提不再成立。

**Files:**
- Modify: `designer-app/src/ui/Designer.tsx`（控件库卡片渲染块）
- Modify: `designer-app/src/ui/designer.css`（10 底部控件库段）
- Test: `tools/ui-check/checks/40-library-mock.mjs`

**Interfaces:**
- Consumes: `ControlMock`（`./ControlMock`，**扁平 props**：`type / caption / size / iconFile / mode / variant / separator / children`，见 `ControlMock.tsx:135`；已有 `mode="library"`）；Task 2 的可滚容器；Task 3 的 `.footprint-chip`；Task 8 的可调高度
- Produces: DOM 契约——每张卡片内含 `.library-compact-mocks`，其中每个尺寸一个 `.library-mock-cell` 带 `data-size` 属性

- [ ] **Step 1: 写失败的检查**

创建 `tools/ui-check/checks/40-library-mock.mjs`：

```js
import { eq, ok } from '../assert.mjs';

export const name = 'P5 控件库卡片渲染三尺寸真实 mock';

export default async function (page) {
  const card = page.locator('.library-compact-card').filter({ hasText: '按钮' }).first();
  ok((await card.count()) > 0, '找不到「按钮」卡片');

  const cells = card.locator('.library-mock-cell');
  eq(await cells.count(), 3, '「按钮」卡片应渲染三个尺寸的 mock');

  for (const size of ['small', 'middle', 'large']) {
    ok(
      (await card.locator(`.library-mock-cell[data-size="${size}"]`).count()) === 1,
      `缺少 ${size} 尺寸的 mock 单元格`,
    );
  }

  // 每个单元格里必须有真实渲染的控件 mock，而不是空占位
  const rendered = await card.locator('.library-mock-cell .next-control-mock').count();
  eq(rendered, 3, '三个单元格里都应有 .next-control-mock');

  // 大尺寸的 mock 必须真的比小尺寸大（验证按真实尺寸渲染，不是等比缩放）
  const smallBox = await card
    .locator('.library-mock-cell[data-size="small"] .next-control-mock')
    .boundingBox();
  const largeBox = await card
    .locator('.library-mock-cell[data-size="large"] .next-control-mock')
    .boundingBox();
  ok(
    largeBox.height > smallBox.height,
    `大尺寸 mock 应高于小尺寸：小 ${smallBox.height}px，大 ${largeBox.height}px`,
  );

  // Task 3 的占格图示必须保留（同一信息不能因为加了 mock 就丢掉）
  ok(
    (await card.locator('.footprint-chip').count()) === 3,
    '占格图示不应被 mock 取代',
  );
}
```

- [ ] **Step 2: 跑它，确认失败**

```bash
cd tools/ui-check && npm run check library-mock
```

Expected: FAIL，信息含 `「按钮」卡片应渲染三个尺寸的 mock`。

- [ ] **Step 3: 确认 ControlMock 的调用形态（不需要合成 control 对象）**

`ControlMock`（`designer-app/src/ui/ControlMock.tsx:135`）接受的是**扁平 props，不是 `RibbonControl` 对象**：

```tsx
export function ControlMock({ type, caption, size, iconFile, mode = 'canvas', variant, separator, children }: {
  type: RibbonControl['type'];
  caption: string;
  size: RibbonControlSize;
  iconFile?: string;
  mode?: 'canvas' | 'library';       // ← 已经有 library 模式，直接可用
  variant?: RibbonControl['variant'];
  separator?: boolean;
  children?: ControlChild[];
})
```

**所以不需要造任何"合成 control"的辅助函数** —— 直接把 `LibraryControlDefinition` 的字段摊平传进去即可。控件库的字段名与 props 的对应关系是：

| ControlMock prop | 来自 `LibraryControlDefinition` |
|---|---|
| `type` | `item.type` |
| `caption` | `item.label` |
| `size` | 当前遍历到的 `candidate` |
| `mode` | 写死 `'library'` |

（`LibraryControlDefinition` 没有 `variant` 字段，不传即可——控件库展示的是默认变体。）

- [ ] **Step 4: 改卡片 JSX**

在控件库卡片渲染块里，找到 `.library-compact-sizes` 那个 `<div>`，把它的**内容**改为「每个尺寸一格：上 mock、下徽章」：

```tsx
                    <div className="library-compact-sizes">
                      {item.supportedSizes.map((candidate) => (
                        <div key={candidate} className="library-mock-cell" data-size={candidate}>
                          <div className="library-mock-stage" aria-hidden>
                            <ControlMock
                              type={item.type}
                              caption={item.label}
                              size={candidate}
                              mode="library"
                            />
                          </div>
                          <button
                            type="button"
                            className={candidate === size ? 'active' : ''}
                            title={`${item.label} · ${SIZE_LABELS[candidate]} · ${footprintLabel(item.type, candidate)}`}
                            aria-label={`${item.label} ${SIZE_LABELS[candidate]} 尺寸，占 ${footprintLabel(item.type, candidate)} 格`}
                            onClick={() => setLibSize((current) => ({ ...current, [item.type]: candidate }))}
                            onPointerDown={(event) =>
                              startDrag(event, {
                                kind: 'new',
                                definition: item,
                                size: candidate,
                              })
                            }
                          >
                            {SIZE_LABELS[candidate]}
                            <small>
                              <span
                                className="footprint-chip"
                                data-footprint={footprintLabel(item.type, candidate)}
                                style={
                                  {
                                    '--fw': getFootprint(item.type, candidate).w,
                                    '--fh': getFootprint(item.type, candidate).h,
                                  } as CSSProperties
                                }
                                aria-hidden
                              />
                            </small>
                          </button>
                        </div>
                      ))}
                    </div>
```

**注意 `mode="library"`**：`ControlMock` 的 `mode` 决定它挂 `mode-canvas` 还是 `mode-library` 类名。画布上的控件用的是 `mode-canvas`（走 `.next-control-mock.mode-canvas` 那套尺寸/间距），控件库卡片里应该用 `mode-library`，否则会拿到画布专属的样式。若发现 library 模式下样式不对，改 `designer.css` 里 `.mode-library` 的规则，**不要去改 `mode-canvas`**——那会波及画布。

- [ ] **Step 5: 加样式**

在 `designer-app/src/ui/designer.css` 的「10 底部控件库」段，替换或补充：

```css
/* 三个尺寸横向摊开，每格：上为真实 mock、下为可点/可拖的尺寸徽章。
   点击或拖出任一格即产出该尺寸的控件。 */
.library-compact-sizes {
  display: flex;
  gap: var(--sp-4);
  align-items: flex-end;
}

.library-mock-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
}

/* 舞台固定高度，保证三个尺寸的徽章底部对齐、卡片高度一致 */
.library-mock-stage {
  display: grid;
  place-items: center;
  min-height: calc(var(--cell) * 3);
  min-width: calc(var(--cell) * 2);
}

/* 卡片宽度随内容走，描述行不再被 180px 卡住 */
.library-compact-desc {
  max-width: 260px;
}
```

`.library-compact-desc` 的 `max-width` 从 180px 提到 260px——卡片变宽了，描述行不该再被旧宽度截断。**若不想动它，删掉这条**，以实机观感为准。

- [ ] **Step 6: 跑检查，确认通过**

```bash
cd tools/ui-check && npm run check library-mock
```

Expected: PASS。

- [ ] **Step 7: 实测首屏耗时（spec 标注的待实测项）**

```bash
cd tools/ui-check && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
  await p.addInitScript(() => {
    localStorage.setItem('gispro-ribbon-designer-welcome-seen', '1');
    localStorage.setItem('gispro-ribbon-designer-theme', 'light');
  });
  await p.goto('http://localhost:1420', { waitUntil: 'load' });
  await p.waitForSelector('.library-mock-cell');
  const t = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return Math.round(nav.loadEventEnd - nav.startTime);
  });
  console.log('首屏 load 耗时:', t, 'ms');
  await b.close();
});
"
```

Expected: **< 300ms**。

**若 ≥ 300ms**：按 spec §9 的既定回退方案执行——只对**当前选中尺寸**渲染 mock，其余两格保留 Task 3 的占格图示。具体做法是把 `ControlMock` 包在条件里：

```tsx
                          <div className="library-mock-stage" aria-hidden>
                            {candidate === size ? (
                              <ControlMock
                                type={item.type}
                                caption={item.label}
                                size={candidate}
                                mode="library"
                              />
                            ) : (
                              <span
                                className="footprint-chip"
                                data-footprint={footprintLabel(item.type, candidate)}
                                style={
                                  {
                                    '--fw': getFootprint(item.type, candidate).w,
                                    '--fh': getFootprint(item.type, candidate).h,
                                  } as CSSProperties
                                }
                              />
                            )}
                          </div>
```

并在提交信息里记下实测值与选择。

- [ ] **Step 8: 无障碍复扫**

同 Task 9 Step 8 的方法，浅色与暗色各扫一次 axe-core。

Expected: `violations` 均为空数组。

> 注意：mock 内部有大量装饰性元素，若 axe 报出无关违规，用 `aria-hidden` 把它们移出无障碍树（`library-mock-stage` 已加，若不够则在 `ControlMock` 根节点补）。

- [ ] **Step 9: 提交**

```bash
git add designer-app/src/ui/Designer.tsx designer-app/src/ui/designer.css tools/ui-check/checks/40-library-mock.mjs
git commit -m "feat: 控件库卡片渲染三尺寸真实 mock（推翻「不渲染 mock 实体」旧决定）

旧决定的成立前提是紧凑卡要全量类型一次显示、渲染实体塞不下；P3-3 给了
控件库可调高度后前提不再成立。每格上为真实 mock、下为可点可拖的尺寸
徽章，占格图示保留。首屏耗时实测见提交附注。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: 同步 CLAUDE.md 里被推翻的决定

**不更新这份文档，下一个改动的人会照旧描述把控件库改回去。** 这是 spec §6 明确要求的收尾。

**Files:**
- Modify: `CLAUDE.md`（UI 设计系统段、图标系统段的控件库描述）
- Modify: `CLAUDE.md`（已知约束与坑段：补一条关于 addInId 的）

**Interfaces:**
- Consumes: Task 3、4、5、6、7、8、9、10 的全部产出
- Produces: 无（文档）

- [ ] **Step 1: 更新控件库描述**

在 `CLAUDE.md` 的「## UI 设计系统」段，找到描述底部控件库双层结构的那句（含「不渲染 mock 实体」），改为准确描述新行为：

```
- 底部控件库**双层**：上层特性分类 segment(全部/命令/容器/输入,lucide 图标,选择跨会话记忆 `gispro-ribbon-designer-lib-category`),下层卡片(每类型一卡:描述行 + **三个尺寸各一格,每格上为真实控件 mock、下为可点可拖的尺寸徽章**)。
  - 2026-09-15 改：原为「紧凑卡不渲染 mock 实体」,理由是紧凑卡要全量类型一次显示、渲染实体塞不下。画布/控件库改为可拖拽分隔条(记忆键 `gispro-ribbon-designer-palette-height`)后控件库能拿到更多高度,前提不再成立,故改为渲染真实 mock。
  - 占格用 `.footprint-chip` 等比图示表达(一个网格单位 6px),文字占格保留在 `title`/`aria-label` 供读屏
```

- [ ] **Step 2: 补一条已知约束**

在 `CLAUDE.md` 的「## 已知约束与坑(Windows 环境)」段追加：

```
- **`addInId` 的种子只能含稳定字段**:ArcGIS Pro 用 Config.daml 的 `<AddInInfo id>` 作插件安装目录名(本机 `Documents\ArcGIS\AddIns\ArcGISPro\` 下目录名与包内 id 逐一对应),所以这个 GUID 一变,Pro 就把它当全新插件装进新目录、同名插件不断累积。2026-09-15 修过一次:种子原先含 `metadata.name` 与 `metadata.lastUpdated`,而 `commit()`(所有文档改动的唯一入口)每次都刷新 `lastUpdated`,导致拖一个控件再导出 GUID 就变。现种子为 `assemblyName + metadata.id`。**改 `resolveOptions` 时不要往种子里加任何可变字段**,回归检查见 `tools/ui-check/node-checks/addin-id.mts`
```

- [ ] **Step 3: 补一条验证方式**

在 `CLAUDE.md` 的「## 常用命令」段末尾追加：

```powershell
# UI 机械验收(需先起 dev server;首次用要先 npm install)
cd tools/ui-check && npm install      # 仅首次,装 playwright
npm run check                         # 跑全部断言
npm run check palette                 # 按文件名过滤
npm run check:node                    # 纯 TS 检查(DAML 产物,不需要浏览器)
```

- [ ] **Step 4: 核对没有残留的旧描述**

```bash
grep -n "不渲染 mock" CLAUDE.md
```

Expected: 只应出现在第 1 步新增的「2026-09-15 改」说明句里（作为历史记录），不应再有指导性的旧表述。

- [ ] **Step 5: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 同步控件库渲染 mock 的新决定与 addInId 约束

P5 推翻了「紧凑卡不渲染 mock 实体」，旧描述会误导后续改动改回去。
另补 addInId 种子只能含稳定字段的约束与回归检查入口。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## 收尾：全量验收

所有任务完成后，跑一遍 spec §7 的验收标准。

- [ ] **跑全部自动化检查**

```bash
cd designer-app && npx tsc --noEmit     # 应无输出
cd ../tools/ui-check && npm run check    # 应全部 PASS
npm run check:node                       # 应 PASS
cd ../../designer-app && cargo test --lib  # 应全绿
```

- [ ] **构建通过**

```bash
cd designer-app && npm run build
```

Expected: tsc + vite build 均无错误。

- [ ] **对照 spec §7 逐条核对**

| # | 标准 | 本计划中的位置 |
|---|---|---|
| A1 | 控件库内容完整可达 | Task 2 |
| A2 | 尺寸徽章等比渲染 | Task 3 |
| A3 | 项目名可改且保存不覆盖 | Task 4（自动化 + Step 14 人工） |
| A4a | 修复前 GUID 抖动可复现 | Task 5 Step 2 |
| A4b | 修复后 GUID 稳定 | Task 5 Step 5 |
| A5 | 画布页签条双向联动 | Task 6 |
| A6 | 纯键盘可达编辑条 | Task 7 Step 1/8 |
| A7 | 拖拽经过不闪现 | Task 7 Step 9 |
| A8 | 结构树一致且可定位 | Task 9 |
| A9 | 双主题 axe 零违规 | Task 9 Step 8、Task 10 Step 8 |
| A10 | tsc 与 cargo test --lib 通过 | 收尾 |
| A11 | Rust 集成测试可编译 | 本计划不改 Rust，跳过 |

- [ ] **发布前必做**

P1 已改工作区但**尚未提交/发版**。spec §9 记着：P1 单独存在时控件库裁切比改前更明显。因此**要么连 Task 2 一起发，要么 P1 不发**。发布流程照 `CLAUDE.md` 的「发布与更新」段走。
