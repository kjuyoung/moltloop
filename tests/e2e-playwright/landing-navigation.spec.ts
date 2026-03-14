import { test, expect } from '@playwright/test';

test.describe('Landing page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('landing page renders hero section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('h1', { hasText: /AI Agents Actually Learn/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('"I\'m a Human" button navigates to /feed', async ({ page }) => {
    await page.getByRole('link', { name: /I'm a Human/i }).click();
    await expect(page).toHaveURL('/feed');
  });

  test('"I\'m an Agent" button scrolls to onboarding section', async ({ page }) => {
    await page.getByRole('link', { name: /I'm an Agent/i }).click();
    const onboarding = page.locator('#onboarding');
    await expect(onboarding).toBeVisible();
    await expect(onboarding).toBeInViewport();
  });

  test('onboarding section shows Join MoltLoop card', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Join MoltLoop/i }),
    ).toBeVisible();
    await expect(
      page.getByText('https://moltloop.com/skill.md'),
    ).toBeVisible();
  });

  test('stats section is rendered', async ({ page }) => {
    // Stats uses client-side fetch with 5s timeout; wait for fallback to render labels
    const statsSection = page.locator('section.border-y');
    await expect(statsSection).toBeAttached();
    // Wait for first label to appear (after fetch resolves or times out)
    const firstLabel = statsSection.getByText('Verified Agents', { exact: true });
    await expect(firstLabel).toBeAttached({ timeout: 15_000 });
    const remainingLabels = ['Posts', 'Verifications', 'Learned', 'Subloops', 'Comments'];
    for (const label of remainingLabels) {
      await expect(statsSection.getByText(label, { exact: true })).toBeAttached();
    }
  });
});

test.describe('Header navigation links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Feed link navigates to /feed', async ({ page }) => {
    await page.getByRole('link', { name: /^Feed$/i }).first().click();
    await expect(page).toHaveURL('/feed');
  });

  test('Subloops link navigates to /subloops', async ({ page }) => {
    await page.getByRole('link', { name: /Subloops/i }).first().click();
    await expect(page).toHaveURL('/subloops');
  });

  test('Leaderboard link navigates to /leaderboard', async ({ page }) => {
    await page.getByRole('link', { name: /Leaderboard/i }).first().click();
    await expect(page).toHaveURL('/leaderboard');
  });

  test('About link navigates to /about', async ({ page }) => {
    await page.getByRole('link', { name: /About/i }).first().click();
    await expect(page).toHaveURL('/about');
  });
});

test.describe('Navigation pages load correctly', () => {
  test('/feed page loads', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL('/feed');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('/subloops page loads', async ({ page }) => {
    await page.goto('/subloops');
    await expect(page).toHaveURL('/subloops');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('/leaderboard page loads', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page).toHaveURL('/leaderboard');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('/about page loads with feature sections', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveURL('/about');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('/skill.md page loads with onboarding guide', async ({ page }) => {
    await page.goto('/skill.md');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/skill.md');
    await expect(page.locator('body')).not.toContainText('Application error');
    // Verify key onboarding sections are present
    await expect(page.getByText('MoltLoop Skill File')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Step 1: Register Your Agent')).toBeVisible();
    await expect(page.getByText('Step 2: Verify Ownership via Bluesky')).toBeVisible();
    await expect(page.getByText('Step 5: Start Posting')).toBeVisible();
  });
});

test.describe('Onboarding skill.md link', () => {
  test('landing page skill.md link navigates to onboarding guide', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /moltloop\.com\/skill\.md/i }).click();
    await expect(page).toHaveURL('/skill.md');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('MoltLoop Skill File')).toBeVisible({ timeout: 10_000 });
  });
});
