import { eq, ok } from '../assert.mjs';

export const name = 'P4 右栏空态渲染文档结构树，点击可定位';

export default async function (page) {
  const outline = page.locator('.next-outline');
  ok((await outline.count()) === 1, '未选中控件时右栏应显示结构树');

  // 空白文档既没有分组也没有控件，树只看得到一级。最小装配：新增页签（新页签会自动激活，
  // 保证后面点控件时它确实在画布上），在其中建一个分组，再从控件库拖入一个控件。
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '新增分组' }).first().click();
  await page.waitForTimeout(200);

  const grid = page.locator('.next-grid-board').first();
  await grid.scrollIntoViewIfNeeded();
  const gridBox = await grid.boundingBox();
  ok(gridBox, '画布上应出现分组网格（拖拽落点）');

  const badge = page
    .locator('.library-compact-card')
    .filter({ hasText: '按钮' })
    .first()
    .locator('.library-compact-sizes button')
    .first();
  await badge.scrollIntoViewIfNeeded();
  const badgeBox = await badge.boundingBox();
  ok(badgeBox, '控件库里应有「按钮」的尺寸徽章');
  ok(
    badgeBox.y + badgeBox.height <= 860 && gridBox.y + gridBox.height <= 860,
    `拖拽两端都要在视口内，徽章底 ${Math.round(badgeBox.y + badgeBox.height)}、网格底 ${Math.round(gridBox.y + gridBox.height)}`,
  );

  // 按住徽章拖到网格左上角：pointerdown 起拖，pointerup 落子
  await page.mouse.move(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + 16, gridBox.y + 16, { steps: 8 });
  await page.mouse.move(gridBox.x + 18, gridBox.y + 18, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // 落子会自动选中新控件（右栏此刻是属性表单），先取消选中才看得到结构树
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok((await outline.count()) === 1, '取消选中后右栏应回到结构树');

  // 三级结构：页签 / 分组 / 控件
  const tabNodes = page.locator('.next-outline-tab');
  const sidebarTabs = page.locator('.next-tab-item');
  eq(await tabNodes.count(), await sidebarTabs.count(), '树里的页签数应等于侧栏页签数');
  ok((await page.locator('.next-outline-group').count()) >= 1, '树里应有分组节点');
  ok((await page.locator('.next-outline-control').count()) >= 1, '树里应有控件节点');

  // 点树里的页签 → 画布页签条同步。先切走再切回：两次都是真实的切换
  // （新增页签会自动激活，只点最后一个的话切前切后是同一个页签，等于没测）。
  const canvasTabs = page.locator('.next-canvas-tab');
  await tabNodes.first().click();
  await page.waitForTimeout(200);
  eq(
    (await canvasTabs.first().getAttribute('class'))?.includes('active'),
    true,
    '点结构树应切换画布页签',
  );

  await tabNodes.last().click();
  await page.waitForTimeout(200);
  eq(
    (await canvasTabs.last().getAttribute('class'))?.includes('active'),
    true,
    '点结构树应切换画布页签',
  );

  // 点树里的控件 → 右栏切成属性表单，且画布控件被选中
  const controlNode = page.locator('.next-outline-control').first();
  ok((await controlNode.count()) > 0, '树里应有控件节点');
  await controlNode.click();
  await page.waitForTimeout(200);

  ok((await page.locator('.next-inspector').count()) === 1, '选中控件后右栏应切为属性表单');
  ok(
    (await page.locator('.next-ribbon-control.selected').count()) >= 1,
    '画布上对应控件应呈选中态',
  );

  // 取消选中后回到结构树
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok((await page.locator('.next-outline').count()) === 1, '取消选中后应回到结构树');
}
