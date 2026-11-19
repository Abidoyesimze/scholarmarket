import { test, expect, type Page } from '@playwright/test';
import { LEARNER, MockBackend } from './support/mockBackend';

/**
 * Learner journey: Browse → Save → Purchase → Notes (issue #198).
 *
 * Runs against the mocked wallet (window.__SCHOLARMARKET_E2E_WALLET__) and
 * the in-memory MockBackend, so no live chain, Horizon, Pinata or MongoDB
 * calls are made. One backend instance spans the whole journey, so state
 * written in one step (saved items, purchases, notes) is visible to the next
 * and survives page reloads.
 */

const CHEMISTRY = { id: '65f000000000000000000001', title: 'Organic Chemistry Reaction Mechanisms' };
const ALGEBRA = { id: '65f000000000000000000002', title: 'Linear Algebra Problem Set' };
const BIOLOGY = { id: '65f000000000000000000003', title: 'Cell Biology Revision Notes' };

function materialCards(page: Page) {
  return page.getByRole('listitem').filter({ has: page.locator('h3') });
}

function card(page: Page, title: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
}

test.describe('Learner journey', () => {
  test.setTimeout(150_000);

  let backend: MockBackend;

  test.beforeEach(async ({ context }) => {
    backend = new MockBackend();
    await backend.attach(context, LEARNER);
  });

  test('browse → save → purchase → notes', async ({ page }) => {
    await test.step('search and filter the marketplace', async () => {
      await page.goto('/marketplace');
      await expect(materialCards(page)).toHaveCount(3);

      await page.getByRole('textbox', { name: 'Search materials' }).fill('chemistry');
      await expect(materialCards(page)).toHaveCount(1);
      await expect(card(page, CHEMISTRY.title)).toBeVisible();

      await page.getByRole('textbox', { name: 'Search materials' }).fill('');
      await page.getByRole('combobox', { name: 'Filter by subject' }).selectOption('Mathematics');
      await expect(materialCards(page)).toHaveCount(1);
      await expect(card(page, ALGEBRA.title)).toBeVisible();

      await page.getByRole('combobox', { name: 'Filter by subject' }).selectOption('All');
      await expect(materialCards(page)).toHaveCount(3);
    });

    await test.step('save a material and see it on the learner dashboard', async () => {
      const biology = card(page, BIOLOGY.title);
      await biology.getByRole('button', { name: 'Save material' }).click();
      await expect(biology.getByRole('button', { name: 'Unsave material' })).toHaveAttribute('aria-pressed', 'true');
      expect(backend.saved.get(LEARNER.walletAddress.toLowerCase())?.has(BIOLOGY.id)).toBe(true);

      await page.goto('/dashboard/learner');
      const savedSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Saved Materials' }) });
      await expect(savedSection.getByRole('link', { name: new RegExp(BIOLOGY.title) })).toBeVisible();
    });

    await test.step('purchase a material and find it in Purchases with a download link', async () => {
      await page.goto(`/marketplace/${CHEMISTRY.id}`);
      await page.getByRole('button', { name: 'Buy now', exact: true }).first().click();

      const pay = page.getByRole('button', { name: 'Pay and unlock access' });
      await expect(pay).toBeEnabled();
      await pay.click();

      await expect(page.getByRole('heading', { name: 'Purchase confirmed' })).toBeVisible({ timeout: 20_000 });
      expect(backend.hasPurchased(CHEMISTRY.id, LEARNER.walletAddress)).toBe(true);
      await page.getByRole('button', { name: 'Close checkout receipt' }).click();

      await expect(page.getByRole('button', { name: 'Download material' })).toBeVisible();

      await page.goto('/dashboard/purchases');
      const purchased = page.getByTestId('purchased-material').filter({ hasText: CHEMISTRY.title });
      await expect(purchased).toHaveCount(1);

      const downloadButton = purchased.getByRole('button', { name: /Download \/ View/ });
      await expect(downloadButton).toBeEnabled();
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('Organic Chemistry');
    });

    await test.step('add a learner note that persists after reload', async () => {
      const note = `Revisit SN1 vs SN2 before the exam — ${Date.now()}`;

      await page.goto(`/marketplace/${CHEMISTRY.id}`);
      const notes = page.getByRole('textbox', { name: 'Personal notes for this resource' });
      await notes.fill(note);
      await page.getByRole('button', { name: 'Save Notes' }).click();
      await expect(page.getByText('Notes saved')).toBeVisible();

      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Personal notes for this resource' })).toHaveValue(note);
    });
  });
});
