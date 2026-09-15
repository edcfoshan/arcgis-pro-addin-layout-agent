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

  // 选中态必须落在「底色」上就能区分。钉死这条是因为踩过特异度坑：
  // 通用规则 .next-shell button (0,1,1) 会压过裸 .next-canvas-tab (0,1,0)，让选中与
  // 未选中都渲染成 --bg-surface —— 当时检查全绿、视觉却分不出选中态，靠肉眼读计算样式才发现。
  const tabBgs = async () => {
    await page.mouse.move(700, 620); // 挪开鼠标：排除 :hover 干扰，只比静止态
    await page.waitForTimeout(200);
    return {
      active: await page
        .locator('.next-canvas-tab.active')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      idle: await page
        .locator('.next-canvas-tab:not(.active)')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    };
  };
  const assertSelectedDistinct = (label, bgs) =>
    ok(
      bgs.active !== bgs.idle,
      `${label}：选中页签底色应与未选中不同（两者都是 ${bgs.active}）`,
    );

  // run.mjs 统一起始于浅色，两个主题都要咬住
  assertSelectedDistinct('浅色', await tabBgs());

  // 切到暗色（产品默认主题）。走真实 UI 切，不用 addInitScript —— 那会被 run.mjs 的初始化覆盖。
  const lightStripBg = await page
    .locator('.next-canvas-tabs')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator('button[title="设置"]').click();
  await page.waitForTimeout(200);
  await page.locator('.settings-seg button', { hasText: '暗色' }).click();
  // 主题切换后样式约 1 秒才真正落地：等到条带底色确实变了再断言，
  // 否则读到的是旧主题的值，会得到假结论。
  await page.waitForFunction(
    (before) =>
      document.documentElement.dataset.theme === 'dark' &&
      getComputedStyle(document.querySelector('.next-canvas-tabs')).backgroundColor !== before,
    lightStripBg,
    { timeout: 10000 },
  );
  assertSelectedDistinct('暗色', await tabBgs());
}
