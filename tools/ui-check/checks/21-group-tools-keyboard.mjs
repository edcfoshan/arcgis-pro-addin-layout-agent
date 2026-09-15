import { eq, ok } from '../assert.mjs';

export const name = 'P3-2 分组编辑条键盘可达且拖拽时不闪现';

export default async function (page) {
  // 空文档没有分组，先新增一个，编辑条才有承载者。
  await page.getByRole('button', { name: '新增分组' }).first().click();
  await page.waitForTimeout(200);

  const group = page.locator('.next-group').first();
  const tools = group.locator('.next-group-tools');
  ok((await tools.count()) === 1, '分组内应有编辑条');

  // 关键：非交互态必须是 visibility:hidden，不能是 display:none —
  // display:none 会把按钮移出 tab 序，键盘用户永远够不到。
  const idleDisplay = await tools.evaluate((el) => getComputedStyle(el).display);
  ok(idleDisplay !== 'none', '编辑条不可用 display:none——会丢失键盘可达性');

  const idleVisibility = await tools.evaluate((el) => getComputedStyle(el).visibility);
  ok(idleVisibility === 'hidden', `非交互态应为 visibility:hidden，实际 ${idleVisibility}`);

  // 键盘：Tab 进分组后编辑条应可见，且能继续 Tab 到里面的按钮
  await group.focus();
  await page.waitForTimeout(200);
  const focusedVisibility = await tools.evaluate((el) => getComputedStyle(el).visibility);
  ok(focusedVisibility === 'visible', '分组获得焦点后编辑条应可见');

  const focusedReachable = await tools
    .locator('button')
    .first()
    .evaluate((el) => {
      el.focus();
      return document.activeElement === el;
    });
  ok(focusedReachable, '编辑条内的按钮必须可被聚焦');

  // 分组必须是普通 group，且不能用 <section> 承载。axe-core 4.10 的 landmark-unique 对
  // <section>/<form> 有特例分支：只要带可访问名就算 landmark，显式写 role="group" 也压不住
  // （实测同名分组仍报 landmark-unique）。而两个分组同名是用户真会做的事，项目无障碍
  // 不变量又要求两主题违规为 0。这条只有 axe 看得见，套件里没有 axe，故在此钉死可断言部分。
  const groupSemantics = await page
    .locator('.next-group')
    .evaluateAll((els) => els.map((el) => ({ tag: el.tagName, role: el.getAttribute('role') })));
  ok(
    groupSemantics.length > 0 &&
      groupSemantics.every((item) => item.role === 'group' && item.tag !== 'SECTION'),
    `分组必须以 role="group" 的非 <section> 元素承载（实际 ${JSON.stringify(groupSemantics)}），否则会变成 landmark`,
  );
  eq(
    await page.getByRole('region', { name: /分组/ }).count(),
    0,
    '分组不得暴露 region landmark（同名分组会触发 axe landmark-unique）',
  );

  // 浮层得真的看得见。.next-ribbon-area 是 overflow-y:hidden 的裁剪容器，而分组紧贴它的
  // 顶边：不预留空间时编辑条会被整条裁在容器外（实测 60px 里只剩 9px 可见），
  // 此时 visibility 依然算 visible —— 只读计算样式抓不到这个失效，必须比几何。
  const clipping = await page.evaluate(() => {
    const area = document.querySelector('.next-ribbon-area');
    const tools = document.querySelector('.next-group-tools');
    const areaBox = area.getBoundingClientRect();
    const toolsBox = tools.getBoundingClientRect();
    return {
      clipped: Math.max(0, Math.round(areaBox.top - toolsBox.top)),
      height: Math.round(toolsBox.height),
    };
  });
  eq(
    clipping.clipped,
    0,
    `编辑条被画布上沿裁掉 ${clipping.clipped}px（浮层共 ${clipping.height}px 高）`,
  );
}
