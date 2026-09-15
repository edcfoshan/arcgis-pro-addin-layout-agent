import { eq, ok } from '../assert.mjs';

export const name = 'P3-1 画布页签条存在、可切换、且与侧栏双向联动';

export default async function (page) {
  // 先加一个页签，确保有得切
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(200);

  const canvasTabs = page.locator('.next-canvas-tab');
  const sidebarTabs = page.locator('.next-tab-item');

  const canvasCount = await canvasTabs.count();
  const sidebarCount = await sidebarTabs.count();
  ok(canvasCount > 0, '画布上应有页签条');
  eq(canvasCount, sidebarCount, '画布页签数应等于侧栏页签数');

  // 点画布上的第一个页签
  await canvasTabs.first().click();
  await page.waitForTimeout(200);

  eq(
    await canvasTabs.first().getAttribute('aria-selected'),
    'true',
    '画布页签选中态',
  );
  eq(
    (await sidebarTabs.first().getAttribute('class'))?.includes('active'),
    true,
    '侧栏对应页签应同步高亮',
  );

  // 反向：点侧栏最后一个页签
  await sidebarTabs.last().click();
  await page.waitForTimeout(200);

  eq(
    (await canvasTabs.last().getAttribute('class'))?.includes('active'),
    true,
    '画布页签应跟随侧栏切换',
  );

  // keytip 应显示在页签上（Pro 的实际行为）。
  // 取最后一个页签：空白文档自带的首页签 keytip 是 'A'（自定义工具箱），
  // 只有 .next-tab-add 新增的页签 keytip 才是 'T2' 这种 T<n> 形态。
  const keytip = await canvasTabs.last().innerText();
  ok(/T\d/.test(keytip), `画布页签应含 keytip，实际文本：${keytip}`);
}
