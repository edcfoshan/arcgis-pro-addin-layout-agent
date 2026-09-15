import { eq, ok } from '../assert.mjs';

export const name = 'P5 拖拽幽灵尺寸不被控件库 mock 规则压小；拖拽期间编辑条不闪现';

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

  // ===== A7 的一半：拖拽进行中分组编辑条必须抑制浮现 =====
  // 借本检查已有的真实拖拽手势来验（原先这条只验了「幽灵尺寸」）。先造一个分组并让它
  // 拿到焦点：:focus-within 会让编辑条常显，这正是「拖控件横穿分组时编辑条一路闪烁」
  // 最坏的那个状态。只断「拖拽中有 .dragging 类」是断机制——类名在、样式没生效照样过，
  // 所以断结果：编辑条此刻的计算样式必须不可见。
  await page.getByRole('button', { name: '新增分组' }).first().click();
  await page.waitForTimeout(250);

  const tools = page.locator('.next-group-tools').first();
  const toolsVisibility = () => tools.evaluate((el) => getComputedStyle(el).visibility);
  await page.locator('.next-group').first().focus();
  await page.waitForTimeout(250);
  ok(
    (await toolsVisibility()) === 'visible',
    '前提不成立：分组获得焦点后编辑条应可见（否则「拖拽中不可见」是白捡的）',
  );

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
    try {
      await page.mouse.move(box.x + 40, box.y - 80, { steps: 8 });
      // 编辑条的 visibility 有 120ms 过渡（离散属性在过渡中途仍报旧值），
      // 等它落定再断言，否则读到的是「正在消失」这一瞬间的值。
      await page.waitForTimeout(250);

      // 拖拽中：编辑条必须被压住（键盘焦点还在分组上，松开前不许浮现）
      eq(await page.locator('.next-shell.dragging').count(), 1, '拖拽进行中应标记 .next-shell.dragging');
      const draggingVisibility = await toolsVisibility();
      ok(
        draggingVisibility === 'hidden',
        `拖拽进行中编辑条必须抑制浮现（横穿分组时会一路闪烁），实际 visibility:${draggingVisibility}`,
      );

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
    } finally {
      // 放回控件库上方再松手：不要落在画布上，免得凭空多出一个控件影响下一轮几何。
      // 收在 finally 里：断言抛出时也必须松开按住的左键——否则后面（比如新增的 42-*）
      // 会从「鼠标按着左键」起手，症状稀奇古怪且离现场很远。
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
    }

    ok((await page.locator('.drag-ghost').count()) === 0, '松手后幽灵应消失');
    // 松手后要等一次重渲染（drag 状态清空）编辑条才回来
    await page.waitForTimeout(250);
    ok(
      (await toolsVisibility()) === 'visible',
      '松手后编辑条应恢复浮现（拖拽期的抑制是暂时的）',
    );
  }
}
