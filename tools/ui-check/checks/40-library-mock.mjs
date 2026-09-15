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
  const chip = card.locator('.footprint-chip').first();
  const chipStyle = await chip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, fill: s.backgroundColor };
  });
  const ratio = contrastRatio(chipStyle.border, chipStyle.fill);
  ok(
    ratio >= 3,
    `占格图示边框对比度不足：边框 ${chipStyle.border} 对底色 ${chipStyle.fill} 仅 ${ratio.toFixed(2)}:1，需 ≥3:1`,
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
