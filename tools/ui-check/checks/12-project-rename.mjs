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
