import { eq, ok } from '../assert.mjs';

export const name = 'P5 控件库详情渲染全尺寸真实 mock';

export default async function (page) {
  // D 形态：左栏选中「按钮」，右栏详情展示它的三种尺寸。
  // hasText 会同时命中「分裂按钮」，但「按钮」排在命令组第一位，.first() 即命中。
  await page.locator('.palette-list-item', { hasText: '按钮' }).first().click();
  await page.waitForTimeout(150);
  const detail = page.locator('.palette-detail');

  const cells = detail.locator('.palette-size-cell');
  // 2026-09-17 起每类多一个「图标」形态(小尺寸 1×1 纯图标)
  eq(await cells.count(), 4, '「按钮」详情应渲染三个尺寸加图标形态');

  for (const size of ['small', 'middle', 'large']) {
    ok(
      (await detail.locator(`.palette-size-cell[data-size="${size}"]`).count()) === 1,
      `缺少 ${size} 尺寸的单元格`,
    );
  }

  // 每个单元格里必须有真实渲染的控件 mock，而不是空占位
  const rendered = await detail.locator('.palette-size-cell .next-control-mock').count();
  eq(rendered, 4, '四个单元格里都应有 .next-control-mock');

  // 大尺寸的 mock 必须真的比小尺寸大（验证按真实尺寸渲染，不是等比缩放）
  const smallBox = await detail
    .locator('.palette-size-cell[data-size="small"] .next-control-mock')
    .boundingBox();
  const largeBox = await detail
    .locator('.palette-size-cell[data-size="large"] .next-control-mock')
    .boundingBox();
  ok(
    largeBox.height > smallBox.height,
    `大尺寸 mock 应高于小尺寸：小 ${smallBox.height}px，大 ${largeBox.height}px`,
  );

  // 占格图示必须保留（mock、数字、图示三份信息并存，缺一不可）
  ok(
    (await detail.locator('.footprint-chip').count()) === 4,
    '占格图示不应被 mock 或数字取代',
  );

  // px 角标：标注 mock 的真实渲染尺寸（1 格 = 32px）
  const pxLabel = await detail
    .locator('.palette-size-cell[data-size="large"] .palette-stage-px')
    .textContent();
  eq(pxLabel?.trim(), '64×96px', '大尺寸按钮的 px 角标应为 64×96px');

  // 无障碍：占格图示只靠一条 1px 边框成形，axe 检测不到非文字对比度（WCAG 1.4.11），
  // 这里从解析后的颜色自己算：边框对图示自身底色必须 ≥3:1。
  // run.mjs 统一起始于浅色，两个主题都要咬住 —— 只守浅色的话，暗色那档的比值就是一句
  // 无人守护的声明（改坏了全套仍绿）。
  const chipStyle = () =>
    detail.locator('.footprint-chip').first().evaluate((el) => {
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

  // ===== 默认高度必须装得下完整详情 =====
  // 干净存储（没存过偏好）时的控件库高度是 D 形态详情的完整高度（常量 296）。
  // 判据取结果不取机制：放得下的窗口里，详情尾行（DAML + 操作提示）必须落在
  // 控件库可视区内，不滚就能看到。
  await page.setViewportSize({ width: 1920, height: 1080 });
  // 重新导航一次：run.mjs 的初始化脚本会在每次导航清空 localStorage，
  // 于是这一轮又回到「没存过偏好」的首次使用状态。
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.next-shell');
  await page.waitForTimeout(500);

  const fit = await page.evaluate(() => {
    const palette = document.querySelector('.next-bottom-palette').getBoundingClientRect();
    const meta = document.querySelector('.palette-detail-meta').getBoundingClientRect();
    return {
      storedDefault: localStorage.getItem('gispro-ribbon-designer-palette-height'),
      metaBottom: meta.bottom,
      viewBottom: palette.bottom,
    };
  });
  ok(
    fit.metaBottom <= fit.viewBottom + 0.5,
    `默认高度 ${fit.storedDefault} 装不下完整详情：DAML 尾行下缘 ${Math.round(fit.metaBottom)}` +
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
