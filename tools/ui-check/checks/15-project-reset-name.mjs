import { eq, ok } from '../assert.mjs';

export const name = 'P2-3 清空画布不会把项目名改回「空白 Ribbon」';

const NEW_NAME = '我的工具箱';

// 不变量：任何时刻 document.metadata.name === 所属项目的 name。
// 清空画布是「整份换文档」的路径之一：它塞进来的空白文档自带 metadata.name='空白 Ribbon'，
// 若不重新对齐，侧栏与窗口标题仍显示用户起的名字，而保存的 .json 与导出包 Config.daml 的
// <Name>/moduleCaption 会退回「空白 Ribbon」——界面一个名、插件另一个名。
export default async function (page) {
  const sidebarName = page.locator('.next-project-name').first();
  ok((await sidebarName.count()) > 0, '找不到侧栏项目名');

  const readNames = () =>
    page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem('gispro-ribbon-designer-projects') ?? '{}');
      const id = meta.activeProjectId;
      const doc = JSON.parse(localStorage.getItem(`gispro-ribbon-designer-doc-${id}`) ?? '{}');
      return {
        hasSession: Array.isArray(meta.projects) && meta.projects.length > 0,
        entryName: meta.projects?.find((project) => project.id === id)?.name ?? null,
        docName: doc?.metadata?.name ?? null,
      };
    });

  // 清空按钮只在画布有内容时才弹确认框，先加一个页签（documentHasContent 认 tabs.length > 1）
  const tabs = () => page.locator('.next-tab-item').count();
  const tabsBefore = await tabs();
  ok(tabsBefore >= 1, `空白项目应已有页签，实际 ${tabsBefore}`);
  await page.locator('.next-tab-add').first().click();
  await page.waitForTimeout(250);
  eq(await tabs(), tabsBefore + 1, '新增页签后页签数');

  // 改项目名（改名后 entry.name 与 document.metadata.name 都应是新名）
  await sidebarName.dblclick();
  const input = page.locator('input[aria-label="项目名称"]');
  await input.fill(NEW_NAME);
  await input.press('Enter');
  await page.waitForTimeout(250);
  const renamed = await readNames();
  ok(renamed.hasSession, '会话槽里应有项目');
  eq(renamed.entryName, NEW_NAME, '改名后侧栏项目名');
  eq(renamed.docName, NEW_NAME, '改名后文档里的插件名');

  // 清空：有内容 → 弹确认框 → 确认
  await page.locator('.next-toolbar button', { hasText: '清空' }).click();
  const dialog = page.getByRole('dialog', { name: '清空画布' });
  ok((await dialog.count()) === 1, '清空按钮应弹出确认框');
  await dialog.getByRole('button', { name: '确认清空' }).click();
  await page.waitForTimeout(300);
  ok((await dialog.count()) === 0, '确认后确认框应关闭');
  eq(await tabs(), 1, '清空后应只剩空白文档的单个页签');

  // 不变量：界面名与导出插件名都还是用户起的名字
  const { entryName, docName } = await readNames();
  eq(docName, NEW_NAME, '清空后文档里的插件名（导出包 Config.daml 的 <Name>）');
  eq(entryName, NEW_NAME, '清空后侧栏项目名（entry.name）');
  eq((await sidebarName.innerText()).trim(), NEW_NAME, '清空后侧栏显示的项目名');
  const title = (await page.locator('.window-title').first().innerText()).trim();
  ok(title.includes(NEW_NAME), `清空后标题栏应仍显示「${NEW_NAME}」，实际「${title}」`);
}
