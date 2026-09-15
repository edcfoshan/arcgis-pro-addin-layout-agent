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

  // ===== 跨页签定位：树是全量铺开的，画布只渲染激活页签 =====
  // 控件留在第一个页签、人站在第二个页签上时点它，必须先把人带回它所在的页签 ——
  // 否则右栏换成属性表单、画布上却什么都没有（实测过的空态：
  // selectedOnCanvas 0 / ribbonControls 0 / inspector 1）。
  const activeTabIndex = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.next-canvas-tab')].findIndex((el) =>
        el.classList.contains('active'),
      ),
    );

  await canvasTabs.first().click();
  await page.waitForTimeout(250);
  eq(
    await page.locator('.next-ribbon-control').count(),
    0,
    '前提不成立：第一个页签上不该有控件（控件在第二个页签）',
  );

  await page.locator('.next-outline-control').first().click();
  await page.waitForTimeout(300);
  eq(
    await activeTabIndex(),
    (await canvasTabs.count()) - 1,
    '点树里非激活页签的控件应把激活页签切回它所在的页签',
  );
  ok(
    (await page.locator('.next-ribbon-control.selected').count()) >= 1,
    '切回页签后画布上对应控件应呈选中态',
  );

  // ===== 滚动定位：控件被滚出画布视野时，点树里那一条要把它找回来 =====
  // 「控件在视野内」在没溢出时恒真、断言等于没写，故先把画布横向撑开：再加 7 个分组，
  // 然后把 ribbon 条带滚到最右 —— 第一个分组连同它的控件就出了视野。
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  for (let i = 0; i < 7; i += 1) {
    await page.getByRole('button', { name: '新增分组' }).first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);

  const controlInRibbonView = () =>
    page.evaluate(() => {
      const area = document.querySelector('.next-ribbon-area').getBoundingClientRect();
      const control =
        document.querySelector('.next-ribbon-control.selected') ??
        document.querySelector('.next-ribbon-control');
      if (!control) return false;
      const box = control.getBoundingClientRect();
      return box.left >= area.left - 0.5 && box.right <= area.right + 0.5;
    });

  await page.evaluate(() => {
    const area = document.querySelector('.next-ribbon-area');
    area.scrollLeft = area.scrollWidth;
  });
  await page.waitForTimeout(250);
  ok(!(await controlInRibbonView()), '前提不成立：控件仍停在视野内，先滚出去才测得到定位');

  await page.locator('.next-outline-control').first().click();
  await page.waitForTimeout(350);
  ok(
    await controlInRibbonView(),
    '点结构树里的控件应滚动定位到画布上对应位置（spec §4 P4 / 验收 A8）',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok((await page.locator('.next-outline').count()) === 1, '取消选中后应回到结构树');

  // 超长标题必须真的画出省略号。
  // ⚠️ 只断言 scrollWidth > clientWidth 是不够的：那只证明「溢出了」，证明不了省略号被绘制 ——
  // 文字一旦成为匿名 flex item（标签按钮 display:flex/inline-flex），text-overflow 就失效，
  // 同样是溢出、同样像被截断，实际却是硬裁。故做像素 A/B：把同一元素临时改成 text-overflow:clip
  // 再截一张，两张图必须不同；只要省略号没画出来，两者就会逐字节相同。
  const LONG_CAPTION = '很长的页签标题'.repeat(6);
  await page.locator('input[aria-label="页签名称"]').first().fill(LONG_CAPTION);
  await page.waitForTimeout(250);
  const longLabel = page
    .locator('.next-outline-tab .next-outline-label')
    .filter({ hasText: '很长的页签标题' })
    .first();
  ok((await longLabel.count()) === 1, '改名后的页签应出现在结构树里');
  const metrics = await longLabel.evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
    display: getComputedStyle(el).display,
  }));
  ok(
    metrics.scrollW > metrics.clientW,
    `断言前提不成立：长标题没有溢出（scrollW ${metrics.scrollW} / clientW ${metrics.clientW}，display ${metrics.display}）`,
  );

  const withEllipsis = await longLabel.screenshot();
  await longLabel.evaluate((el) => {
    el.style.textOverflow = 'clip';
  });
  await page.waitForTimeout(150);
  const withClip = await longLabel.screenshot();
  ok(
    !withEllipsis.equals(withClip),
    '省略号必须真的绘制：标签一旦回到 display:flex/inline-flex，text-overflow 失效、文字被硬裁（两张截图逐字节相同）',
  );
}
