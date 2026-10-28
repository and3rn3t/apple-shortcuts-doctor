import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixture, openApp, upload } from './helpers.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function violationsOf(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map(
    violation =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`
  );
}

const STATES: [string, (page: Page) => Promise<void>][] = [
  ['the empty page', async () => undefined],
  [
    'the opened iCloud link help',
    async page => {
      await page.getByText('Have an iCloud link instead?').click();
      await expect(page.getByText(/should start with/)).toBeVisible();
    },
  ],
  [
    'a report',
    async page => {
      await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
      await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
    },
  ],
  [
    'an error message',
    async page => {
      await page.setInputFiles('input[type=file]', upload('x.shortcut', 'AEA1 signed payload'));
      await expect(page.getByRole('alert')).toBeVisible();
    },
  ],
];

for (const scheme of ['light', 'dark'] as const) {
  for (const [label, arrange] of STATES) {
    test(`${label} has no accessibility violations in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      await arrange(page);
      expect(await violationsOf(page)).toEqual([]);
    });
  }
}
