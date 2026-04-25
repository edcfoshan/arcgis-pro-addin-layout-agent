import { expect, test } from '@playwright/test';

test('Ribbon 设计器主流程', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByText('Add-In Ribbon 布局设计器')).toBeVisible();
  await expect(page.getByText('Ribbon 画布')).toBeVisible();
  await expect(page.getByTestId('next-side-tab-palette')).toBeVisible();
  await expect(page.getByRole('button', { name: '清空控件' })).toBeVisible();
  await expect(page.getByText('仅宽屏预览')).toBeVisible();
  await expect(page.getByTestId('next-side-tab-palette')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '保存画布' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 Config.daml' })).toBeVisible();
  const palettePanel = page.getByTestId('next-palette-panel');
  await expect(palettePanel).toBeVisible();
  const paletteScroll = await palettePanel.evaluate((node) => {
    const element = node as HTMLElement;
    return {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: window.getComputedStyle(element).overflowY,
    };
  });
  expect(paletteScroll.scrollHeight).toBeGreaterThan(paletteScroll.clientHeight);
  expect(['auto', 'scroll']).toContain(paletteScroll.overflowY);
  await expect(page.getByRole('button', { name: 'Add-In 工具箱' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '地图风格' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /标准|紧凑|折叠/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /\+行|-行/ })).toHaveCount(0);

  await page.getByRole('button', { name: '新增分组' }).click();
  const firstDrop = page.locator('[data-testid^="next-drop-"]').first();
  await expect(firstDrop).toBeVisible();
  await expect(page.getByText('固定3行')).toHaveCount(0);
  await expect(page.locator('.next-group').first().locator('.next-group-tools').getByRole('button', { name: '删除分组' })).toHaveCount(0);
  await expect(page.locator('.next-group').first().locator('.next-group-footer').getByRole('button', { name: '删除分组' })).toHaveCount(0);

  await page.getByRole('button', { name: '新增分组' }).click();
  const secondGroup = page.locator('.next-group').nth(1);
  await expect(secondGroup).toBeVisible();
  await expect(secondGroup.locator('.next-group-tools').getByRole('button', { name: '删除分组' })).toHaveCount(0);
  await expect(secondGroup.locator('.next-group-footer').getByRole('button', { name: '删除分组' })).toBeVisible();

  const firstHelp = page.getByRole('button', { name: '按钮 使用说明', exact: true });
  const firstPopover = page.locator('.library-help-popover').first();
  await expect(firstPopover).toBeHidden();
  await firstHelp.hover();
  await expect(firstPopover).toBeVisible();
  await expect(page.getByText(/开发建议：建议映射为 ExportCommand/)).toBeVisible();

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
  await expect(page.locator('.next-group').first().getByText('按钮')).toBeVisible();

  await page
    .getByTestId('next-palette-button-small')
    .dragTo(firstDrop, { targetPosition: { x: 92, y: 40 } });

  const hasSmallButton = await page.locator('[data-testid^="next-control-button_"]').evaluateAll((nodes) =>
    nodes.some((node) => {
      const style = window.getComputedStyle(node);
      return style.width === '32px' && style.height === '32px';
    }),
  );
  expect(hasSmallButton).toBe(true);

  await addedButton.click();
  await expect(page.getByTestId('next-side-tab-inspector')).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('标题').fill('批量导出');
  await expect(page.getByLabel('标题')).toHaveValue('批量导出');
  await expect(page.locator('.next-json')).toHaveCount(0);
  await page.getByRole('button', { name: '保存画布' }).click();
  await expect(page.getByText('已保存当前画布，下次打开网页会自动恢复')).toBeVisible();
  await page.reload();
  await expect(page.locator('.next-json')).toHaveCount(0);
  const restoredButton = page.locator('[data-testid^="next-control-button_"]').last();
  await expect(restoredButton).toBeVisible();
  await restoredButton.click();
  await expect(page.getByLabel('标题')).toHaveValue('批量导出');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出 JSON/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  const damlDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出 Config\.daml/ }).click();
  const damlDownload = await damlDownloadPromise;
  expect(damlDownload.suggestedFilename()).toBe('Config.daml');

  await secondGroup.locator('.next-group-footer').getByRole('button', { name: '删除分组' }).click();
  await expect(page.locator('.next-group')).toHaveCount(1);
  await expect(page.locator('.next-group').first().locator('.next-group-footer').getByRole('button', { name: '删除分组' })).toHaveCount(0);

  await page.screenshot({ path: 'playwright-ribbon-smoke.png', fullPage: true });
});
