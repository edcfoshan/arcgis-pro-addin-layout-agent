import { eq, ok } from '../assert.mjs';

export const name = '冒烟：dev server 可达且设计器已挂载';

export default async function (page) {
  eq(await page.title(), 'ArcGIS Pro Add-In Ribbon 布局设计器', '页面标题');
  ok((await page.locator('.next-shell').count()) === 1, '应挂载 .next-shell');
  ok((await page.locator('.library-compact-card').count()) > 0, '控件库应渲染出卡片');
}
