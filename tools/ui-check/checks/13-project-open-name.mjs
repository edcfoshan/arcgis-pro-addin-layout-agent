import { ok } from '../assert.mjs';

export const name = 'P2-3 打开 JSON 时项目名取文档里的名字，而不是文件名';

const BASE = process.env.UI_CHECK_URL ?? 'http://localhost:1420';
// 路径用正斜杠:splitPath 两种分隔符都认,而反斜杠在 JS 字面量里容易踩转义陷阱
const FILE_PATH = 'C:/tmp/test-rename.json';
const DOC_NAME = '我的工具箱';

// 浏览器里没有 Tauri，打开文件要过 dialog + read_text_file 两条 IPC。
// 这里只在 IPC 边界打桩（返回一个假路径与一段假 JSON），让真实的
// openDocDialog → loadDocumentFromPath → addProjectFromDocument → addProject 跑起来，
// 断言的正是这条链路算出来的项目名。
//
// 为什么另开 context：run.mjs 的 addInitScript 会在每次导航时清空 localStorage，
// 而打桩必须注入到目标页面；把打桩加到共用 page 上会随其后续导航泄漏给后面所有检查。
// 另开 context 的 init script 只作用于这一页，跑完即关，共用 page 完全不受影响。
export default async function (page) {
  await page.waitForSelector('.next-shell', { timeout: 5000 });
  ok((await page.locator('.next-shell').count()) === 1, '共用 page 应已挂载设计器');

  // 先取一份应用自己写出的合法文档，当「被打开的 JSON」
  const blankDraft = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('gispro-ribbon-designer-doc-'));
    return key ? localStorage.getItem(key) : null;
  });
  ok(blankDraft, '拿不到空白项目的草稿槽，无法构造被打开的 JSON');
  const doc = JSON.parse(blankDraft);
  doc.metadata.name = DOC_NAME;

  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1360, height: 860 } });
  const isolated = await context.newPage();
  try {
    await isolated.addInitScript(
      ([json, fakePath]) => {
        localStorage.clear();
        localStorage.setItem('gispro-ribbon-designer-welcome-seen', '1');
        localStorage.setItem('gispro-ribbon-designer-theme', 'light');
        localStorage.setItem('gispro-ribbon-designer-auto-update', 'off');
        // 事件插件内部钩子(@tauri-apps/api/event.js 会调用它);不打这行,
        // 拖放监听注册会抛 "Cannot read properties of undefined (reading 'unregisterListener')"
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
        let seq = 0;
        window.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { label: 'main', windowLabel: 'main' },
          },
          transformCallback: (callback) => {
            const id = seq++;
            window[`_${id}`] = callback;
            return id;
          },
          convertFileSrc: (path) => path,
          invoke: async (command) => {
            if (command === 'plugin:dialog|open') return fakePath;
            if (command === 'read_text_file') return json;
            if (command === 'get_default_target_dir') return 'C:/tmp';
            if (command === 'plugin:event|listen') return 1;
            return null;
          },
        };
      },
      [JSON.stringify(doc), FILE_PATH],
    );

    await isolated.goto(BASE, { waitUntil: 'load' });
    await isolated.waitForSelector('.next-shell', { timeout: 5000 });
    ok((await isolated.locator('.next-shell').count()) === 1, '打桩后设计器应仍能挂载');

    await isolated.locator('button[title="文件"]').click();
    await isolated.waitForTimeout(150);
    await isolated.locator('.context-menu button', { hasText: '打开…' }).click();
    await isolated.waitForTimeout(600);

    const names = (await isolated.locator('.next-project-name').allInnerTexts()).map((t) => t.trim());
    ok(
      names.includes(DOC_NAME),
      `侧栏应出现文档里的项目名「${DOC_NAME}」，实际 ${JSON.stringify(names)}`,
    );

    const title = (await isolated.locator('.window-title').first().innerText()).trim();
    ok(
      !title.includes('test-rename'),
      `项目名被文件名顶掉了：标题栏显示「${title}」，应为「${DOC_NAME}」`,
    );
    ok(title.includes(DOC_NAME), `标题栏应显示「${DOC_NAME}」，实际「${title}」`);
  } finally {
    await context.close();
  }
}
