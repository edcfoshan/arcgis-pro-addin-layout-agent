import { ok } from '../assert.mjs';

export const name = 'P3-3 分隔条可拖拽、可键盘调节、且跨会话记忆';

const PALETTE_KEY = 'gispro-ribbon-designer-palette-height';
const PALETTE_MIN = 120;
const PALETTE_MAX = 460;
const PALETTE_DEFAULT = 320;

export default async function (page) {
  const splitter = page.locator('.next-splitter');
  ok((await splitter.count()) === 1, '应存在分隔条');
  ok(
    (await splitter.getAttribute('role')) === 'separator',
    '分隔条应有 role="separator"',
  );
  ok(
    (await splitter.getAttribute('aria-orientation')) === 'horizontal',
    '分隔条应声明 aria-orientation="horizontal"',
  );

  const palette = page.locator('.next-bottom-palette');
  const paletteHeight = () =>
    palette.evaluate((el) => el.getBoundingClientRect().height);

  const before = await paletteHeight();
  ok(
    Math.abs(before - PALETTE_DEFAULT) < 2,
    `首次进入控件库高度应为默认 ${PALETTE_DEFAULT}，实际 ${before}`,
  );

  // 键盘可操作：聚焦分隔条后用方向键调高
  await splitter.focus();
  ok(
    await splitter.evaluate((el) => document.activeElement === el),
    '分隔条必须能被键盘聚焦',
  );
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  const afterUp = await paletteHeight();
  ok(afterUp > before, `上方向键应增高控件库：${before} → ${afterUp}`);

  // 跨会话记忆：高度写入 localStorage
  const stored = await page.evaluate((key) => localStorage.getItem(key), PALETTE_KEY);
  ok(stored !== null, '高度应写入 localStorage');
  ok(
    Math.abs(Number(stored) - afterUp) < 2,
    `存储值 ${stored} 应与实际高度 ${afterUp} 一致`,
  );

  // 刷新恢复。注意 run.mjs 的 addInitScript 在「每一次导航（含 reload）」都会清空
  // localStorage，直接 reload 测的是初始化脚本而不是应用的恢复逻辑。故刷新前把应用
  // 自己写下的那个值重新注入（注入的是刚从 localStorage 读到的 stored，不是编造的）。
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [PALETTE_KEY, stored],
  );
  await page.reload();
  await page.waitForSelector('.next-shell');
  await page.waitForTimeout(250);
  const afterReload = await paletteHeight();
  ok(
    Math.abs(afterReload - afterUp) < 4,
    `刷新后应恢复记忆高度：期望约 ${afterUp}，实际 ${afterReload}`,
  );

  // 边界：向上顶到上限就停住，不会无限增长
  await splitter.focus();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  const atMax = await paletteHeight();
  ok(Math.abs(atMax - PALETTE_MAX) < 2, `上界应钳在 ${PALETTE_MAX}，实际 ${atMax}`);

  // 边界：向下压到下限就停住，不会拖成 0
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const atMin = await paletteHeight();
  ok(Math.abs(atMin - PALETTE_MIN) < 2, `下界应钳在 ${PALETTE_MIN}，实际 ${atMin}`);

  // 指针拖拽：从下限往上拖 100px，控件库应随之增高约 100px（不会撞到上界）
  const box = await splitter.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 100, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterDrag = await paletteHeight();
  ok(
    Math.abs(afterDrag - (atMin + 100)) < 6,
    `向上拖 100px 应把控件库垫高约 100px：${atMin} → ${afterDrag}`,
  );
}
