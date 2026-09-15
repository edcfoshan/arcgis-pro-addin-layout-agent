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
