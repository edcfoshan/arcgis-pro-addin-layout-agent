import { eq, ok } from '../assert.mjs';

export const name = 'P5 控件库卡片渲染三尺寸真实 mock';

// 「按钮」的三种尺寸徽章与 mock 的对应关系由 data-size 标注（small/middle/large）。
export default async function (page) {
  const card = page.locator('.library-compact-card').filter({ hasText: '按钮' }).first();
  ok((await card.count()) > 0, '找不到「按钮」卡片');

  const cells = card.locator('.library-mock-cell');
  eq(await cells.count(), 3, '「按钮」卡片应渲染三个尺寸的 mock');

  for (const size of ['small', 'middle', 'large']) {
    ok(
      (await card.locator(`.library-mock-cell[data-size="${size}"]`).count()) === 1,
      `缺少 ${size} 尺寸的 mock 单元格`,
    );
  }

  // 每个单元格里必须有真实渲染的控件 mock，而不是空占位
  const rendered = await card.locator('.library-mock-cell .next-control-mock').count();
  eq(rendered, 3, '三个单元格里都应有 .next-control-mock');

  // 大尺寸的 mock 必须真的比小尺寸大（验证按真实尺寸渲染，不是等比缩放）
  const smallBox = await card
    .locator('.library-mock-cell[data-size="small"] .next-control-mock')
    .boundingBox();
  const largeBox = await card
    .locator('.library-mock-cell[data-size="large"] .next-control-mock')
    .boundingBox();
  ok(
    largeBox.height > smallBox.height,
    `大尺寸 mock 应高于小尺寸：小 ${smallBox.height}px，大 ${largeBox.height}px`,
  );

  // Task 3 的占格图示必须保留（同一信息不能因为加了 mock 就丢掉）
  ok(
    (await card.locator('.footprint-chip').count()) === 3,
    '占格图示不应被 mock 取代',
  );

  // 无障碍：占格图示只靠一条 1px 边框成形，axe 检测不到非文字对比度（WCAG 1.4.11），
  // 这里从解析后的颜色自己算：边框对图示自身底色必须 ≥3:1。
  // run.mjs 统一起始于浅色，两个主题都要咬住 —— 只守浅色的话，暗色那档的比值就是一句
  // 无人守护的声明（改坏了全套仍绿）。
  const chipStyle = () =>
    card.locator('.footprint-chip').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, fill: s.backgroundColor };
    });
  const assertChipContrast = async (label) => {
    const { border, fill } = await chipStyle();
    const ratio = contrastRatio(border, fill);
    ok(
      ratio >= 3,
      `${label}：占格图示边框对比度不足，边框 ${border} 对底色 ${fill} 仅 ${ratio.toFixed(2)}:1，需 ≥3:1`,
    );
  };

  await assertChipContrast('浅色');

  // 切到暗色（产品默认主题）。走真实 UI 切，不用 addInitScript —— 那会被 run.mjs 的初始化覆盖
  // （范式同 20-canvas-tabs.mjs）。
  const lightFill = (await chipStyle()).fill;
  await page.locator('button[title="设置"]').click();
  await page.waitForTimeout(200);
  await page.locator('.settings-seg button', { hasText: '暗色' }).click();
  // 主题切换后样式约 1 秒才真正落地：等到图示底色确实变了再断言，
  // 否则读到的是旧主题的值，会得到假结论。
  await page.waitForFunction(
    (before) =>
      document.documentElement.dataset.theme === 'dark' &&
      getComputedStyle(document.querySelector('.footprint-chip')).backgroundColor !== before,
    lightFill,
    { timeout: 10000 },
  );
  await assertChipContrast('暗色');

  // ===== 默认高度必须装得下卡片 =====
  // 首次使用（干净存储）时的控件库高度是按真实内容量出来的。它曾经写死 320，而实测内容
  // 要 450 —— 默认配置自己就把卡片裁掉一截，用户的头号痛点在我们自己的默认值上重现，
  // 而验收 A1 只要求「滚得到」，所以当时没有任何检查会失败。
  // 判据取结果不取机制：放得下的窗口里，最后一张卡的下缘必须落在控件库可视区内。
  // （窗口给不起时这条不成立，那是画布地板不变量的代价，见 22-splitter.mjs 的钳制断言。）
  await page.setViewportSize({ width: 1920, height: 1080 });
  // 重新导航一次：run.mjs 的初始化脚本会在每次导航清空 localStorage，
  // 于是这一轮又回到「没存过偏好」的首次使用状态。
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.next-shell');
  await page.waitForTimeout(500);

  const fit = await page.evaluate(() => {
    const palette = document.querySelector('.next-bottom-palette');
    const cards = [...document.querySelectorAll('.library-compact-card')];
    const last = cards[cards.length - 1].getBoundingClientRect();
    return {
      count: cards.length,
      lastCardBottom: last.bottom,
      viewBottom: palette.getBoundingClientRect().bottom,
      storedDefault: localStorage.getItem('gispro-ribbon-designer-palette-height'),
    };
  });
  eq(fit.count, 9, '干净存储下控件库应展示全部九张卡');
  ok(
    fit.lastCardBottom <= fit.viewBottom + 0.5,
    `默认高度 ${fit.storedDefault} 装不下卡片：最后一张卡的下缘 ${Math.round(fit.lastCardBottom)}` +
      ` 超出了控件库可视区底部 ${Math.round(fit.viewBottom)}`,
  );
}

// —— 对比度工具：把 rgb()/rgba() 解析成相对亮度再算 WCAG 对比度。 ——
function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  ok(match, `无法解析颜色：${value}`);
  const [r, g, b, a = '1'] = match[1].split(/[,/\s]+/).filter(Boolean);
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg, bg) {
  const a = luminance(parseColor(fg));
  const b = luminance(parseColor(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
