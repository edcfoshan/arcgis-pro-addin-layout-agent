import { eq, ok } from '../assert.mjs';

export const name = 'P7 拖拽阈值/取消、键盘插入、同组顺序、越界取消与菜单/侧栏键盘';

const textOrder = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.next-ribbon-control')).map((el) =>
      el.textContent?.trim(),
    ),
  );

export default async function (page) {
  await page.getByRole('button', { name: '新增分组' }).first().click();
  await page.waitForTimeout(150);

  // ===== 拖拽阈值：按下不等于拖拽；超过 5px 才出现幽灵 =====
  await page.locator('.palette-list-item', { hasText: '按钮' }).first().click();
  await page.waitForTimeout(120);
  const badge = page.locator('.palette-size-cell button').nth(1);
  const badgeBox = await badge.boundingBox();
  ok(badgeBox, '找不到按钮中尺寸徽章');
  await page.mouse.move(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  eq(await page.locator('.drag-ghost').count(), 0, 'pointerdown 未超过阈值时不应出现拖拽幽灵');

  await page.mouse.move(badgeBox.x + badgeBox.width / 2 + 18, badgeBox.y + badgeBox.height / 2, {
    steps: 4,
  });
  eq(await page.locator('.drag-ghost').count(), 1, '超过阈值后应进入拖拽');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  eq(await page.locator('.drag-ghost').count(), 0, 'Escape 应取消拖拽');
  eq(await page.locator('.next-ribbon-control').count(), 0, '取消拖拽不应新增控件');
  await page.mouse.up();

  // ===== 键盘/单指针替代路径：选中尺寸后可插入当前分组 =====
  await page.locator('.palette-size-cell button').nth(1).click();
  await page.getByRole('button', { name: '插入到当前分组' }).click();
  await page.waitForTimeout(150);
  eq(await page.locator('.next-ribbon-control').count(), 1, '插入按钮应新增第一个控件');

  await page.locator('.palette-list-item', { hasText: '交互工具' }).first().click();
  await page.locator('.palette-size-cell button').nth(0).click();
  await page.getByRole('button', { name: '插入到当前分组' }).click();
  await page.waitForTimeout(150);
  eq(await page.locator('.next-ribbon-control').count(), 2, '插入按钮应新增第二个控件');

  // ===== 同组右移：指示线在 B 左侧时，最终顺序必须是 B、A =====
  const first = await page.locator('.next-ribbon-control').nth(0).boundingBox();
  const second = await page.locator('.next-ribbon-control').nth(1).boundingBox();
  ok(first && second, '同组顺序测试需要两个控件');
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width * 0.8, second.y + second.height / 2, { steps: 8 });
  await page.waitForTimeout(100);
  eq(await page.locator('.next-drop-line').count(), 1, '同组移动应显示插入线');
  await page.mouse.up();
  await page.waitForTimeout(200);
  const order = await textOrder(page);
  ok(order[0]?.includes('交互工') && order[1]?.includes('按钮'), `同组右移后顺序错误：${order.join(', ')}`);

  // ===== 分组排序越界：指示线消失且不提交顺序 =====
  const groupCount = await page.locator('.next-group').count();
  const handle = await page.locator('.group-drag-handle').first().boundingBox();
  ok(handle, '找不到分组拖拽手柄');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, 10, { steps: 5 });
  await page.waitForTimeout(100);
  eq(await page.locator('.next-group-drop-line').count(), 0, '分组拖拽越界应取消指示线');
  await page.mouse.up();
  await page.waitForTimeout(100);
  eq(await page.locator('.next-group').count(), groupCount, '越界取消不应改变分组数量');

  // ===== 菜单语义与键盘 =====
  await page.getByRole('button', { name: '导入' }).click();
  const menu = page.getByRole('menu', { name: '导入菜单' });
  eq(await menu.count(), 1, '导入弹层应有 menu 语义');
  eq(await menu.locator('[role="menuitem"]').count(), 3, '导入菜单应有 3 个 menuitem');
  await page.keyboard.press('ArrowDown');
  const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim());
  ok(activeText?.includes('导入 DAML'), `方向键应移动菜单焦点，实际：${activeText}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  eq(await page.locator('[role="menu"]').count(), 0, 'Escape 应关闭菜单');

  // ===== 侧栏非激活页签键盘替代 =====
  await page.getByRole('button', { name: '新增页签' }).first().click();
  await page.waitForTimeout(150);
  const inactiveTab = page.getByRole('button', { name: /切换到该页签/ }).first();
  eq(await inactiveTab.count(), 1, '非激活页签应有可聚焦切换按钮');
  await inactiveTab.click();
  await page.waitForTimeout(150);
  const activeCanvasTab = await page.locator('.next-canvas-tab.active').innerText();
  ok(activeCanvasTab.includes('自定义工具箱'), '侧栏键盘/按钮路径应切换激活页签');
}
