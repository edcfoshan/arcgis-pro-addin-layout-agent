import { eq, ok } from '../assert.mjs';

export const name = 'P5 拖拽幽灵尺寸不被控件库 mock 规则压小';

// 幽灵是「被拿起来的预览」，契约尺寸恒为 --cell × 3（= 96px）见 .drag-ghost .next-control-mock。
// 探到的小/大两个尺寸徽章都必须给出同样大小的幽灵：若有人把 P5 里那条库内自动尺寸的规则
// 从 `.library-mock-stage .next-control-mock` 放宽回 `.next-control-mock.mode-library`，
// 同特异性下它会连幽灵一起改掉，幽灵会缩成内容尺寸（约 32×49），这里必须 FAIL。
const CELLS = 3;

export default async function (page) {
  const cell = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')),
  );
  ok(Number.isFinite(cell), `读不到 --cell，实际 ${cell}`);
  const expected = cell * CELLS;

  const card = page.locator('.library-compact-card').filter({ hasText: '按钮' }).first();
  ok((await card.count()) > 0, '找不到「按钮」卡片');

  // 小(1×1) 与 大(2×3) 两个尺寸都拖一次：幽灵若按真实占格缩放，两者的幽灵会长得不一样，
  // 而它的契约是恒定的拿取预览，故两边必须同为 expected×expected。
  for (const [index, sizeLabel] of [
    [0, '小'],
    [2, '大'],
  ]) {
    const badge = card.locator('button').nth(index);
    const box = await badge.boundingBox();
    ok(box, `找不到${sizeLabel}尺寸徽章`);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y - 80, { steps: 8 });

    const ghost = page.locator('.drag-ghost');
    eq(await ghost.count(), 1, `拖起${sizeLabel}尺寸后应出现 .drag-ghost`);
    const mock = ghost.locator('.next-control-mock');
    eq(await mock.count(), 1, `幽灵里应有 .next-control-mock`);

    const mockBox = await mock.boundingBox();
    ok(
      Math.abs(mockBox.width - expected) <= 1 && Math.abs(mockBox.height - expected) <= 1,
      `${sizeLabel}尺寸的幽灵 mock 应为 ${expected}×${expected}，实际 ${Math.round(mockBox.width)}×${Math.round(mockBox.height)}` +
        `（被控件库那条自动尺寸规则压小了？它必须收窄到 .library-mock-stage 之内）`,
    );

    // 外框 = mock + 1px 边框
    const ghostBox = await ghost.boundingBox();
    ok(
      Math.abs(ghostBox.width - (expected + 2)) <= 2 &&
        Math.abs(ghostBox.height - (expected + 2)) <= 2,
      `${sizeLabel}尺寸的幽灵外框应约 ${expected + 2}×${expected + 2}，实际 ${Math.round(ghostBox.width)}×${Math.round(ghostBox.height)}`,
    );

    // 放回控件库上方再松手：不要落在画布上，免得凭空多出一个控件影响下一轮几何
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    ok((await page.locator('.drag-ghost').count()) === 0, '松手后幽灵应消失');
  }
}
