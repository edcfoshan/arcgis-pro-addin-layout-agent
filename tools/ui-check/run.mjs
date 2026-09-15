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

// 起始状态必须确定：每个检查都从「空 localStorage + 欢迎浮层已读 + 浅色主题」出发。
// 必须先 clear：设计器启动会恢复项目会话与每项目草稿槽（PROJECTS_STORAGE_KEY / draftKey），
// 而所有检查共用同一个 context，前一个检查动过的文档会泄漏进后一个检查。
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('gispro-ribbon-designer-welcome-seen', '1');
  localStorage.setItem('gispro-ribbon-designer-theme', 'light');
});

let failed = 0;
for (const file of targets) {
  // import 与 name 也必须在 try 内：某个检查文件顶层抛错（比如 import 了不存在的模块）时，
  // 冲出循环会让后续检查全不跑、browser.close() 被跳过，留下僵尸浏览器进程。
  // label 先给文件名兜底，取到 mod.name 再覆盖 —— catch 里也就能报出是哪个文件。
  let label = file;
  try {
    const mod = await import(pathToFileURL(path.join(DIR, file)).href);
    label = mod.name ?? file;
    // 视口也是「确定性初始状态」的一部分：所有检查复用同一个 page，
    // 前一个检查改过的视口会泄漏给后一个（曾因此制造静默假通过）。
    // 每轮回到默认视口，将来某个检查忘记复位也不会污染别人。
    await page.setViewportSize(VIEWPORT);
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
