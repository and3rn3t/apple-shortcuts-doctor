import { expect, test } from '@playwright/test';
import { fixture, openApp, upload } from './helpers.ts';

test.describe('choosing a file', () => {
  test('is possible from the keyboard alone, with Enter or Space', async ({ page }) => {
    for (const key of ['Enter', 'Space']) {
      await openApp(page);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Choose a file' })).toBeFocused();
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press(key);
      await (await chooser).setFiles(upload('a.json', fixture('mixed-actions.json')));
      await expect(page.getByTestId('summary')).toContainText('Inspected 8 actions');
    }
  });

  test('moves focus to the report so keyboard users land on it', async ({ page }) => {
    await openApp(page);
    await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
    await expect(page.getByRole('heading', { name: 'Report' })).toBeFocused();
  });

  test('works by dropping a file on the zone, highlighting it while dragging over', async ({
    page,
  }) => {
    await openApp(page);
    const zone = page.locator('.dropzone');
    const handle = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['{"WFWorkflowActions":[]}'], 'dropped.json'));
      return transfer;
    });
    await zone.dispatchEvent('dragenter', { dataTransfer: handle });
    await expect(zone).toHaveClass(/dragging/);
    await zone.locator('p').dispatchEvent('dragenter', { dataTransfer: handle });
    await zone.dispatchEvent('dragleave', { dataTransfer: handle });
    await expect(zone).toHaveClass(/dragging/);
    await zone.dispatchEvent('drop', { dataTransfer: handle });
    await expect(zone).not.toHaveClass(/dragging/);
    await expect(page.getByTestId('summary')).toContainText('Inspected 0 actions');
  });

  test('runs the built-in sample without a file', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Try the built-in sample' }).click();
    await expect(page.getByTestId('summary')).toContainText('Inspected 3 actions');
    await expect(page.getByText('uses the output of #1')).toBeVisible();
  });
});

test.describe('the report', () => {
  test('groups findings, lists actions, and links dependent actions together', async ({ page }) => {
    await openApp(page);
    await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
    await expect(page.getByRole('note')).toContainText('Not a safety verdict');
    await expect(page.locator('.action-list > li')).toHaveCount(8);
    // The first dependent action links back to the action it uses, and following the link
    // lands on (and highlights) that action.
    const link = page.locator('.action-list a[href^="#action-"]').first();
    const target = (await link.getAttribute('href')) as string;
    await link.click();
    await expect(page.locator(target)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
  });

  test('says what went wrong for a signed file and links to the guide', async ({ page }) => {
    await openApp(page);
    await page.setInputFiles('input[type=file]', upload('x.shortcut', 'AEA1 signed payload'));
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Signed .shortcut files are not decoded');
    const link = alert.getByRole('link', { name: 'Getting an export' });
    await expect(link).toHaveAttribute('href', /#getting-an-export$/);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('refuses a file over 4 MiB', async ({ page }) => {
    await openApp(page);
    await page.setInputFiles(
      'input[type=file]',
      upload('big.json', Buffer.alloc(5 * 1024 * 1024, 0x20))
    );
    await expect(page.getByRole('alert')).toContainText(
      'Export exceeds the 4 MiB inspection limit.'
    );
  });

  test('fits a phone screen without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);
    await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
    await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
