import { ok } from '../assert.mjs';

export const name = 'P2-2 尺寸徽章按真实占格等比渲染';

// 「按钮」的三种尺寸：小 2×1、中 2×1、大 2×3（见 core/ribbonLayout.ts getFootprint）
// 2026-09-17 起小尺寸命令类按 Pro 实机规格改为 2×1（实机小尺寸带文字）
const EXPECTED = [
  ['2x1', 2],
  ['2x1', 2],
  ['2x3', 2 / 3],
];

export default async function (page) {
  // D 形态：先在左栏选中「按钮」，右栏详情展示它的全部尺寸。
  // hasText 会同时命中「分裂按钮」，但「按钮」排在命令组第一位，.first() 即命中。
  await page.locator('.palette-list-item', { hasText: '按钮' }).first().click();
  await page.waitForTimeout(150);
  const detail = page.locator('.palette-detail');
  ok((await detail.count()) > 0, '找不到控件库详情区');

  for (const [label, ratio] of EXPECTED) {
    const chip = detail.locator(`.footprint-chip[data-footprint="${label}"]`).first();
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
  const title = await detail.locator('.palette-size-cell button').first().getAttribute('title');
  ok(title && title.includes('2x1'), `徽章 button 的 title 应含占格文字，实际 ${title}`);
}
