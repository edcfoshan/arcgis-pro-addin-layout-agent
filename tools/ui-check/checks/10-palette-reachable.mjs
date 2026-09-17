import { ok } from '../assert.mjs';

export const name = 'P2-1 控件库在常规窗口尺寸下内容完整可达';

// 默认窗口 1360×860、最小窗口 1100×700、全屏 1920×1080
const SIZES = [[1360, 860], [1100, 700], [1920, 1080]];

export default async function (page) {
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);

    // D 形态控件库：palette 本体纵向必须可滚（矮窗口被画布地板钳制时靠它兜底）
    const overflowY = await page
      .locator('.next-bottom-palette')
      .evaluate((el) => getComputedStyle(el).overflowY);
    ok(
      overflowY === 'auto' || overflowY === 'scroll',
      `${width}×${height}：控件库纵向必须可滚，实际 overflow-y=${overflowY}`,
    );

    // 左栏类型列表滚到底，最后一项（复选框）必须完整落在列表可视区内
    await page.locator('.palette-list').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(150);

    const listReachable = await page.evaluate(() => {
      const box = document.querySelector('.palette-list').getBoundingClientRect();
      const items = [...document.querySelectorAll('.palette-list-item')];
      if (!items.length) return false;
      const last = items[items.length - 1].getBoundingClientRect();
      return last.bottom <= box.bottom + 1 && last.top >= box.top - 1;
    });
    ok(listReachable, `${width}×${height}：滚到底后最后一个类型项仍不在可视区内`);

    // 右栏详情滚到底，尾行（DAML 值 + 操作提示）必须可达
    await page.locator('.palette-detail').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(150);

    const metaReachable = await page.evaluate(() => {
      const box = document.querySelector('.palette-detail').getBoundingClientRect();
      const meta = document.querySelector('.palette-detail-meta')?.getBoundingClientRect();
      if (!meta) return false;
      return meta.bottom <= box.bottom + 1 && meta.top >= box.top - 1;
    });
    ok(metaReachable, `${width}×${height}：详情滚到底后 DAML 尾行仍不在可视区内`);
  }
}
