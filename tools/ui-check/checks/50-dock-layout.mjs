import { eq, ok } from '../assert.mjs';

export const name = 'P6 三栏停靠布局：两栏到底、控件库夹中、层叠有序、边界可拖';

const BASE = process.env.UI_CHECK_URL ?? 'http://localhost:1420';

export default async function (page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.next-shell');
  await page.waitForTimeout(300);

  // 左右停靠栏纵贯到底：顶边与工作区顶边齐平、底边与工作区底边齐平
  const flush = await page.evaluate(() => {
    const bench = document.querySelector('.next-workbench').getBoundingClientRect();
    const proj = document.querySelector('.next-tab-sidebar').getBoundingClientRect();
    const struct = document.querySelector('.next-side').getBoundingClientRect();
    return {
      projTop: Math.round(proj.top - bench.top),
      projBottom: Math.round(proj.bottom - bench.bottom),
      structTop: Math.round(struct.top - bench.top),
      structBottom: Math.round(struct.bottom - bench.bottom),
    };
  });
  ok(
    flush.projTop === 0 && flush.structTop === 0,
    `左右栏应从工作区顶部开始：项目栏偏差 ${flush.projTop}px，属性栏偏差 ${flush.structTop}px`,
  );
  ok(
    Math.abs(flush.projBottom) <= 1 && Math.abs(flush.structBottom) <= 1,
    `左右栏应纵贯到工作区底边：项目栏偏差 ${flush.projBottom}px，属性栏偏差 ${flush.structBottom}px`,
  );

  // 控件库夹在两栏之间：不通栏（明显窄于工作区）
  const span = await page.evaluate(() => {
    const bench = document.querySelector('.next-workbench').getBoundingClientRect();
    const palette = document.querySelector('.next-bottom-palette').getBoundingClientRect();
    return Math.round((palette.width / bench.width) * 1000) / 1000;
  });
  ok(span < 0.99, `控件库应窄于工作区（夹在两栏之间），实际占宽比 ${span}`);

  // 层叠：左右栏(30) > 控件库(20) > 画布(0)。几何上互不重叠，
  // 顺序在拖拽控件跨板、弹层出现时生效——这里守的是声明本身。
  const zs = await page.evaluate(() => ({
    proj: getComputedStyle(document.querySelector('.next-tab-sidebar')).zIndex,
    struct: getComputedStyle(document.querySelector('.next-side')).zIndex,
    palette: getComputedStyle(document.querySelector('.next-bottom-palette')).zIndex,
    canvas: getComputedStyle(document.querySelector('.next-canvas-row')).zIndex,
  }));
  ok(
    Number(zs.proj) > Number(zs.palette) &&
      Number(zs.struct) > Number(zs.palette) &&
      Number(zs.palette) > Number(zs.canvas),
    `层叠应为 左右栏>控件库>画布，实际 ${JSON.stringify(zs)}`,
  );

  // 竖分隔条语义：role + 方向声明
  const vsplit = page.locator('.next-vsplit').first();
  eq(await vsplit.getAttribute('role'), 'separator', '竖分隔条应有 role="separator"');
  eq(await vsplit.getAttribute('aria-orientation'), 'vertical', '竖分隔条应声明 vertical');

  // 键盘可调宽：聚焦左分隔条按 →，项目栏加宽
  await vsplit.focus();
  const widthBefore = await page
    .locator('.next-tab-sidebar')
    .evaluate((el) => el.getBoundingClientRect().width);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const widthAfter = await page
    .locator('.next-tab-sidebar')
    .evaluate((el) => el.getBoundingClientRect().width);
  ok(widthAfter > widthBefore, `方向键应加宽项目栏：${widthBefore} → ${widthAfter}`);

  // 跨会话记忆：宽度写入 localStorage
  const stored = await page.evaluate(() =>
    localStorage.getItem('gispro-ribbon-designer-proj-width'),
  );
  ok(stored !== null, '项目栏宽度应写入 localStorage');
  ok(
    Math.abs(Number(stored) - widthAfter) < 2,
    `存储值 ${stored} 应与实际宽度 ${widthAfter} 一致`,
  );
}
