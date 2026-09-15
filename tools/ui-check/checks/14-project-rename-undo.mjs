import { eq, ok } from '../assert.mjs';

export const name = 'P2-3 改名后 undo 不会把文档里的插件名带回旧值';

const NEW_NAME = '改名工程A';

// 不变量：document.metadata.name === project.name（entry.name 是权威，文档里是它的镜像）。
// 项目名属项目元数据（与 filePath、collapsed 同类），不是画布内容，
// 所以 undo 恢复历史快照时不该把旧名带回来。
export default async function (page) {
  const sidebarName = page.locator('.next-project-name').first();
  ok((await sidebarName.count()) > 0, '找不到侧栏项目名');

  const readNames = () =>
    page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem('gispro-ribbon-designer-projects') ?? '{}');
      const id = meta.activeProjectId;
      const doc = JSON.parse(localStorage.getItem(`gispro-ribbon-designer-doc-${id}`) ?? '{}');
      return {
        entryName: meta.projects?.find((project) => project.id === id)?.name ?? null,
        docName: doc?.metadata?.name ?? null,
      };
    });

  // 一次文档级编辑，压入该项目的 undo 栈（新增页签是无需拖拽就能做到的画布编辑）
  const tabs = () => page.locator('.next-tab-item').count();
  const tabsBefore = await tabs();
  ok(tabsBefore >= 1, `空白项目应已有页签，实际 ${tabsBefore}`);
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(250);
  eq(await tabs(), tabsBefore + 1, '新增页签后页签数');

  // 改名：改 entry.name 与 document.metadata.name，不进 undo 栈
  await sidebarName.dblclick();
  const input = page.locator('input[aria-label="项目名称"]');
  await input.fill(NEW_NAME);
  await input.press('Enter');
  await page.waitForTimeout(250);
  eq((await readNames()).docName, NEW_NAME, '改名后文档里的插件名');

  // Ctrl+Z 恢复的是历史快照
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  eq(await tabs(), tabsBefore, 'Ctrl+Z 应撤销掉刚新增的页签（确认 undo 确实执行了）');

  const { entryName, docName } = await readNames();
  eq(entryName, NEW_NAME, '侧栏项目名（entry.name）');
  eq(docName, NEW_NAME, '文档里的插件名（document.metadata.name）被历史快照带回了旧值');

  const title = (await page.locator('.window-title').first().innerText()).trim();
  ok(title.includes(NEW_NAME), `标题栏应仍显示「${NEW_NAME}」，实际「${title}」`);
  eq((await sidebarName.innerText()).trim(), NEW_NAME, '侧栏显示的项目名');
}
