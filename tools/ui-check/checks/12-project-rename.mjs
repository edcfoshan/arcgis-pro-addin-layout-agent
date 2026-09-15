import { eq, ok } from '../assert.mjs';

export const name = 'P2-3 项目名可双击修改并贯通到标题栏与草稿';

const NEW_NAME = '测试改名工程';

export default async function (page) {
  const sidebarName = page.locator('.next-project-name').first();
  ok((await sidebarName.count()) > 0, '找不到侧栏项目名');

  await sidebarName.dblclick();

  const input = page.locator('input[aria-label="项目名称"]');
  ok((await input.count()) === 1, '双击后应出现项目名输入框');

  await input.fill(NEW_NAME);
  await input.press('Enter');
  await page.waitForTimeout(200);

  eq(await page.locator('.next-project-name').first().innerText(), NEW_NAME, '侧栏项目名');

  // 标题栏中央的项目名必须同步（它是同一份状态的另一处呈现）
  const titleBar = await page.locator('header').innerText();
  ok(titleBar.includes(NEW_NAME), `标题栏应显示新项目名，实际 header 文本：${titleBar}`);

  // 草稿槽里的 metadata.name 必须一起改（项目名 = 插件名，导出包靠它）
  const draftName = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('gispro-ribbon-designer-projects') ?? '{}');
    const id = meta.activeProjectId;
    const doc = JSON.parse(localStorage.getItem(`gispro-ribbon-designer-doc-${id}`) ?? '{}');
    return doc?.metadata?.name ?? null;
  });
  eq(draftName, NEW_NAME, '草稿槽 metadata.name');

  // 键盘路径：项目名必须能聚焦，聚焦后按 F2 进入改名态——否则改名只有鼠标可达，
  // 是 WCAG 2.1.1（键盘）Level A 失败。这条断言的作用就是「有人把 F2/tabIndex 拿掉就 FAIL」。
  const KBD_NAME = '键盘改的名';
  await page.locator('.next-project-name').first().press('F2');
  const kbdInput = page.locator('input[aria-label="项目名称"]');
  eq(await kbdInput.count(), 1, '聚焦项目名后按 F2 应出现项目名输入框（键盘进入改名态）');
  await kbdInput.fill(KBD_NAME);
  await kbdInput.press('Enter');
  await page.waitForTimeout(200);
  eq(await page.locator('.next-project-name').first().innerText(), KBD_NAME, 'F2 改名后侧栏项目名');
  eq(
    await kbdInput.count(),
    0,
    'Enter 提交后应退出改名态',
  );

  // Escape 取消：改名态关闭，且名字保持原值（不能把半截输入提交掉）
  await page.locator('.next-project-name').first().press('F2');
  const escInput = page.locator('input[aria-label="项目名称"]');
  eq(await escInput.count(), 1, '第二次 F2 也应进入改名态');
  await escInput.fill('不该被保存的名字');
  await escInput.press('Escape');
  await page.waitForTimeout(200);
  eq(await page.locator('input[aria-label="项目名称"]').count(), 0, 'Escape 应关闭改名输入框');
  eq(
    await page.locator('.next-project-name').first().innerText(),
    KBD_NAME,
    'Escape 取消后项目名不应改变',
  );

  // 空名必须回退，不允许出现空标题
  const input2 = page.locator('.next-project-name').first();
  await input2.dblclick();
  const input3 = page.locator('input[aria-label="项目名称"]');
  await input3.fill('');
  await input3.press('Enter');
  await page.waitForTimeout(200);
  ok(
    (await page.locator('.next-project-name').first().innerText()).trim().length > 0,
    '清空项目名后应回退为「未命名」而不是空串',
  );
}
