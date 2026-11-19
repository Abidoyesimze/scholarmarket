import { test, expect, type Browser } from '@playwright/test';
import { ADMIN, LEARNER, MockBackend, type Session } from './support/mockBackend';

/**
 * Admin moderation: Report → Review → Delist (issue #201).
 *
 * The learner and the admin each get their own browser context with a
 * signed session cookie, sharing one MockBackend so a report filed by the
 * learner shows up in the admin queue exactly as it would via MongoDB.
 */

const TARGET = { id: '65f000000000000000000003', title: 'Cell Biology Revision Notes' };

async function openAs(browser: Browser, backend: MockBackend, session?: Session) {
  const context = await browser.newContext();
  await backend.attach(context, session);
  const page = await context.newPage();
  return { context, page };
}

test.describe('Admin moderation', () => {
  test.setTimeout(120_000);

  test('learner reports a material, admin reviews and delists it', async ({ browser }) => {
    const backend = new MockBackend();
    const learner = await openAs(browser, backend, LEARNER);
    const admin = await openAs(browser, backend, ADMIN);

    await test.step('learner reports the material', async () => {
      await learner.page.goto(`/marketplace/${TARGET.id}`);
      await learner.page.getByRole('button', { name: 'Report quality issue' }).click();

      const form = learner.page.locator('form').filter({ has: learner.page.getByRole('heading', { name: 'Report Resource' }) });
      await form.getByRole('combobox').selectOption('Copyright violation');
      await form.getByPlaceholder('Please provide details about the issue...').fill('Scanned pages from a published textbook.');
      await form.getByRole('button', { name: 'Submit Report' }).click();

      await expect(learner.page.getByRole('heading', { name: 'Report Submitted' })).toBeVisible();
      expect(backend.reports).toHaveLength(1);
    });

    await test.step('admin sees the report in /admin/moderation and delists', async () => {
      await admin.page.goto('/admin/moderation');
      const row = admin.page.getByTestId('moderation-report').filter({ hasText: TARGET.title });
      await expect(row).toBeVisible();
      await expect(row).toContainText('Copyright violation');
      await expect(row).toContainText(LEARNER.walletAddress);

      await row.getByRole('button', { name: 'Delist' }).click();
      await expect(admin.page.getByText('No flagged items at the moment.')).toBeVisible();
      expect(backend.material(TARGET.id)?.visibility).toBe('delisted');
    });

    await test.step('delisted material disappears from the marketplace', async () => {
      await learner.page.goto('/marketplace');
      await expect(learner.page.getByRole('heading', { name: 'Organic Chemistry Reaction Mechanisms' })).toBeVisible();
      await expect(learner.page.getByRole('heading', { name: TARGET.title })).toHaveCount(0);

      await learner.page.getByRole('textbox', { name: 'Search materials' }).fill('cell biology');
      await expect(learner.page.getByText('No materials match your filters')).toBeVisible();
    });

    await learner.context.close();
    await admin.context.close();
  });

  test('non-admins cannot access /admin/moderation', async ({ browser }) => {
    const backend = new MockBackend();
    backend.reports.push({
      id: '67b000000000000000000099',
      materialId: TARGET.id,
      materialTitle: TARGET.title,
      reason: 'Spam / Advertising',
      description: '',
      reporterAddress: LEARNER.walletAddress,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    });

    for (const session of [LEARNER, undefined]) {
      const { context, page } = await openAs(browser, backend, session);
      await page.goto('/admin/moderation');

      await expect(page.getByTestId('moderation-access-denied')).toBeVisible();
      await expect(page.getByTestId('moderation-queue')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Delist' })).toHaveCount(0);
      await expect(page.getByText(TARGET.title)).toHaveCount(0);

      await context.close();
    }

    expect(backend.material(TARGET.id)?.visibility).toBe('public');
  });
});
