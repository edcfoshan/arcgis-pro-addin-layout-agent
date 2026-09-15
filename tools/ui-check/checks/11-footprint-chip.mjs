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
