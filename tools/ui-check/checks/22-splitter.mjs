import { ok } from '../assert.mjs';

export const name = 'P3-3 分隔条可拖拽、可键盘调节、且跨会话记忆';

const PALETTE_KEY = 'gispro-ribbon-designer-palette-height';
const PALETTE_MIN = 120;
const PALETTE_MAX = 460;
const PALETTE_DEFAULT = 320;

// 控件库高度是「用户偏好」与「窗口给不给得起」的交集：渲染高度 = min(偏好, 本屏可用)。
// 这里的「本屏可用」不由常量决定，所以下面按两档窗口实测，而不是只测常量上下界。
// ribbon 所需高度从 DOM 现推（页签条实测高 + ribbon 区的 min-height + 上下内边距），
// 不写死 413 —— 将来改预留高度或页签高度，断言跟着走。
const ribbonNeed = (page) =>
  page.evaluate(() => {
    const area = document.querySelector('.next-ribbon-area');
    const tabs = document.querySelector('.next-canvas-tabs');
    const cs = getComputedStyle(area);
    return Math.ceil(
      tabs.getBoundingClientRect().height +
        parseFloat(cs.minHeight) +
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom),
    );
  });

const canvasHeight = (page) =>
  page.locator('.next-canvas').evaluate((el) => el.getBoundingClientRect().height);

export default async function (page) {
  const splitter = page.locator('.next-splitter');
  const palette = page.locator('.next-bottom-palette');
  const paletteHeight = () =>
    palette.evaluate((el) => el.getBoundingClientRect().height);

  ok((await splitter.count()) === 1, '应存在分隔条');
  ok(
    (await splitter.getAttribute('role')) === 'separator',
    '分隔条应有 role="separator"',
  );
  ok(
    (await splitter.getAttribute('aria-orientation')) === 'horizontal',
    '分隔条应声明 aria-orientation="horizontal"',
  );

  const before = await paletteHeight();
  ok(
    Math.abs(before - PALETTE_DEFAULT) < 2,
    `首次进入控件库高度应为默认 ${PALETTE_DEFAULT}，实际 ${before}`,
  );

  // 下面这一段要验的是「常量的界」（120/460）。1360×860 下窗口只放得下约 368，
  // 会把 460 钳掉、让常量上界测不到，所以先换成足够高的窗口，让常量的界成为唯一约束。
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.waitForTimeout(200);

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

  // ===== 窗口钳制不变量：画布永远保得住整条 ribbon =====
  // 分组也随草稿被 run.mjs 的初始化脚本清掉，先补一个，ribbon 的「所需高度」才是真的
  // （有分组时才有编辑条预留那 40px）。
  await page.getByRole('button', { name: '新增分组' }).first().click();
  await page.waitForTimeout(200);

  for (const [width, height] of [
    [1360, 860],
    [1100, 700],
  ]) {
    await page.setViewportSize({ width, height });
    // 把一个「大到窗口装不下」的偏好写进存储再加载：460 是能过初值校验的最大值
    // （更大被判非法回默认，反而测不到钳制）。这正是「用户把控件库拉到最大，
    // 然后把窗口缩小」的真实场景。
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [PALETTE_KEY, String(PALETTE_MAX)],
    );
    await page.reload();
    await page.waitForSelector('.next-shell');
    await page.getByRole('button', { name: '新增分组' }).first().click();
    await page.waitForTimeout(300);

    const need = await ribbonNeed(page);
    const canvasH = await canvasHeight(page);
    ok(
      canvasH >= need - 0.5,
      `${width}×${height}：控件库偏好 ${PALETTE_MAX} 时画布只剩 ${Math.round(canvasH)}，` +
        `ribbon 需要 ${need}——画布被压变形了`,
    );

    const rendered = await paletteHeight();
    ok(
      rendered <= PALETTE_MAX + 0.5,
      `${width}×${height}：控件库渲染高度 ${Math.round(rendered)} 超过了偏好上限 ${PALETTE_MAX}`,
    );
    ok(
      rendered >= PALETTE_MIN - 0.5,
      `${width}×${height}：钳制后控件库 ${Math.round(rendered)} 低于下限 ${PALETTE_MIN}，下限在这档窗口应仍够得到`,
    );

    // 钳制要落在控件库自己身上（它 flex-shrink 吸回装不下的部分），不能靠祖先裁掉：
    // 被 .next-workbench 裁掉的那截，用户滚也滚不到。
    const clipped = await page.evaluate(() => {
      const box = document.querySelector('.next-bottom-palette').getBoundingClientRect();
      return Math.round(box.bottom - window.innerHeight);
    });
    ok(
      clipped <= 0,
      `${width}×${height}：控件库底边超出窗口 ${clipped}px，被裁掉的部分够不到`,
    );

    // 窗口钳制是「这一屏渲染得更矮」，不是「把用户偏好改小」——否则用户换回大窗口
    // 就再也拿不回原来的高度。
    const stillStored = await page.evaluate((key) => localStorage.getItem(key), PALETTE_KEY);
    ok(
      Number(stillStored) === PALETTE_MAX,
      `${width}×${height}：窗口钳制不该改写用户偏好，存储里应是 ${PALETTE_MAX}，实际 ${stillStored}`,
    );
  }

  // 最小窗口（1100×700，应用窗口的 minHeight）下下限仍要够得到：钳制只砍掉装不下的
  // 部分，不能把可用区顶到下限之上。
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(200);
  await splitter.focus();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const minReached = await paletteHeight();
  ok(
    Math.abs(minReached - PALETTE_MIN) < 2,
    `1100×700：方向键应能把控件库压到下限 ${PALETTE_MIN}，实际 ${minReached}`,
  );
}
