import { expect, test } from '@playwright/test';

test('Ribbon 设计器主流程', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByText('Add-In Ribbon 布局设计器')).toBeVisible();
  await expect(page.getByText('Ribbon 画布')).toBeVisible();
  await expect(page.getByText('控件库')).toBeVisible();
  await expect(page.getByText('仅宽屏预览')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add-In 工具箱' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '地图风格' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /标准|紧凑|折叠/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /\+行|-行/ })).toHaveCount(0);

  await page.getByRole('button', { name: '新增分组' }).click();
  const firstDrop = page.locator('[data-testid^="next-drop-"]').first();
  await expect(firstDrop).toBeVisible();
  await expect(page.getByText('固定3行')).toBeVisible();

  await page
    .getByTestId('next-palette-button-large')
    .dragTo(firstDrop, { targetPosition: { x: 16, y: 40 } });
  await page
    .getByTestId('next-palette-tool-large')
    .dragTo(firstDrop, { targetPosition: { x: 16, y: 40 } });

  await expect(page.getByText(/放不下|不能增高/)).toBeVisible();

  const addedButton = page.locator('[data-testid^="next-control-button_"]').last();
  await expect(addedButton).toBeVisible();
  await expect(addedButton).toHaveCSS('width', '64px');
  await expect(addedButton).toHaveCSS('height', '96px');

  await addedButton.click();
  await page.getByLabel('标题').fill('批量导出');
  await expect(page.locator('.next-json')).toContainText('"caption": "批量导出"');
  await expect(page.locator('.next-json')).toContainText('"layout"');
  await expect(page.locator('.next-json')).toContainText('"w": 2');
  await expect(page.locator('.next-json')).toContainText('"h": 3');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出 JSON/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  await page.screenshot({ path: 'playwright-ribbon-smoke.png', fullPage: true });
});
