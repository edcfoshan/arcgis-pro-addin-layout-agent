import { ok } from '../assert.mjs';

export const name = 'P3-3 分隔条可拖拽、可键盘调节、且跨会话记忆';

// 与 run.mjs 同一来源，保证播种脚本注入到的就是本轮被测的那个页面。
const BASE = process.env.UI_CHECK_URL ?? 'http://localhost:1420';

const PALETTE_KEY = 'gispro-ribbon-designer-palette-height';
const PALETTE_MIN = 120;
const PALETTE_MAX = 460;

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

  // 播种脚本必须用 URL 标记门控。run.mjs 的初始化脚本会在「每一次导航」清空 localStorage，
  // 而 Playwright 按注册顺序执行 init script —— 本检查后注册，就会「先清空、再播种」，
  // 播种反而赢，并且这个脚本会一直跟着 page 走、泄漏给后面的检查（今天没爆只是因为
  // files.sort() 恰好把本文件排在最后）。run.mjs 每次都导航到裸 BASE，标记不在，脚本自然失效。
  await page.addInitScript((key) => {
    const seed = location.search.match(/palette-seed=(\d+)/);
    if (seed) localStorage.setItem(key, seed[1]);
  }, PALETTE_KEY);

  // 带标记加载：等价于「用户偏好是这个值，重新打开设计器」。裸 URL 不播种。
  const loadWithSeed = async (value) => {
    await page.goto(`${BASE}?palette-seed=${value}`, { waitUntil: 'load' });
    await page.waitForSelector('.next-shell');
    await page.waitForTimeout(250);
  };

  ok((await splitter.count()) === 1, '应存在分隔条');
  ok(
    (await splitter.getAttribute('role')) === 'separator',
    '分隔条应有 role="separator"',
  );
  ok(
    (await splitter.getAttribute('aria-orientation')) === 'horizontal',
    '分隔条应声明 aria-orientation="horizontal"',
  );

  // 干净存储下首次进入：高度没有「默认常量」这回事，初值是按真实内容量出来的
  // （钳在 120–460）。写死 320 的那版是按印象估的，实测内容要 450，估小了正好把卡片
  // 裁掉一截。这里比「存下来的偏好」与「内容高度」——渲染高度在这一屏被窗口钳到 368
  // （画布地板那条不变量），拿它比不出默认值对不对。
  const before = await paletteHeight();
  const contentHeight = await page.evaluate(
    () => document.querySelector('.next-bottom-palette').scrollHeight,
  );
  const defaultPreference = await page.evaluate((key) => Number(localStorage.getItem(key)), PALETTE_KEY);
  ok(
    Math.abs(defaultPreference - Math.min(contentHeight, PALETTE_MAX)) < 2,
    `首次进入的默认高度应按内容自适应：期望 ${Math.min(contentHeight, PALETTE_MAX)}` +
      `（内容 ${contentHeight} 钳在上限 ${PALETTE_MAX}），实际 ${defaultPreference}`,
  );
  ok(
    before >= PALETTE_MIN - 0.5,
    `首次进入控件库渲染高度 ${before} 低于下限 ${PALETTE_MIN}`,
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

  // 重新加载后恢复。注入的是应用自己写下的那个值（stored），不是编造的。
  await loadWithSeed(stored);
  const afterReload = await paletteHeight();
  ok(
    Math.abs(afterReload - afterUp) < 4,
    `重新加载后应恢复记忆高度：期望约 ${afterUp}，实际 ${afterReload}`,
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
    await loadWithSeed(PALETTE_MAX);
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

  // ===== 钳制态下「变大」手势不得把偏好改小 =====
  // 循环停在 1100×700（偏好 460、生效 208）。此时按 Up：锚点取偏好与生效高度的较大者，
  // 加不动 → 必须是 no-op。若锚成生效高度，460 会被反降成 224：同一个键在钳制前后语义相反。
  await splitter.focus();
  const beforeNudgeUp = await paletteHeight();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  const nudgedUp = await paletteHeight();
  ok(
    Math.abs(nudgedUp - beforeNudgeUp) < 1,
    `钳制态按 Up 应是 no-op：${beforeNudgeUp} → ${nudgedUp}`,
  );
  const storedAfterNudgeUp = await page.evaluate((key) => localStorage.getItem(key), PALETTE_KEY);
  ok(
    Number(storedAfterNudgeUp) === PALETTE_MAX,
    `钳制态按 Up 不得降级用户偏好：存储 ${storedAfterNudgeUp}，应为 ${PALETTE_MAX}`,
  );

  // 换回大窗口，偏好应原样回来（这条是上一条的意义所在）
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.waitForTimeout(250);
  const restored = await paletteHeight();
  ok(
    Math.abs(restored - PALETTE_MAX) < 2,
    `换回大窗口应拿回偏好 ${PALETTE_MAX}，实际 ${restored}`,
  );

  // ===== 最小窗口（1100×700，应用窗口的 minHeight）下下限仍够得到 =====
  // 钳制只砍掉装不下的部分，不能把可用区顶到下限之上。
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
