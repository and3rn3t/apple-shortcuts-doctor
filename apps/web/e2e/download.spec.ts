import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { inspectWorkflow, parseExport, renderMarkdown } from '@shortcuts-doctor/core';
import { fixture, openApp, upload } from './helpers.ts';

test.describe('Markdown download', () => {
  for (const name of ['mixed-actions.json', 'mixed-actions.plist', 'mixed-actions.binary.plist']) {
    test(`saves the same Markdown the CLI prints for ${name}, with no request and no values`, async ({
      page,
    }) => {
      const watcher = await openApp(page);
      const bytes = fixture(name);
      await page.setInputFiles('input[type=file]', upload('private-name.shortcut', bytes));
      await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download Markdown report' }).click(),
      ]);

      expect(download.suggestedFilename()).toBe('shortcuts-doctor-report.md');
      const saved = readFileSync(await download.path(), 'utf8');
      expect(saved).toBe(renderMarkdown(inspectWorkflow(parseExport(new Uint8Array(bytes)))));
      expect(saved).toMatch(/^# Shortcuts Doctor report\n/);
      for (const secret of ['private-name', 'example.invalid', 'echo fixture', 'Fixture: mixed']) {
        expect(saved, secret).not.toContain(secret);
      }
      // A blob download is local: no request, and the CSP raised no violation.
      expect(watcher.requestsSinceMark()).toEqual([]);
      expect(await watcher.violations()).toEqual([]);
      expect(watcher.consoleErrors).toEqual([]);
    });
  }

  test('works from the keyboard', async ({ page }) => {
    await openApp(page);
    await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
    const button = page.getByRole('button', { name: 'Download Markdown report' });
    await button.focus();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('shortcuts-doctor-report.md');
  });
});
