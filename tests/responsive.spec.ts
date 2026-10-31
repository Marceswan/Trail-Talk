import { test, expect } from './fixtures';

for (const width of [320, 390, 768, 1024, 1280, 1440, 1920, 2560]) {
  test(`feed and thread scale cleanly at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.post-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const sizing = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return {
        bodyFont: parseFloat(getComputedStyle(document.querySelector('.post-excerpt')!).fontSize),
        searchFont: parseFloat(getComputedStyle(document.querySelector('.search-box input')!).fontSize),
        createHeight: box('.header-create').height,
        searchWidth: box('.search-box').width,
        heroContainsAction: box('.hero-button').bottom <= box('.hero').bottom,
        feedWidth: box('.feed-column').width,
        railVisible: getComputedStyle(document.querySelector('.right-rail')!).display !== 'none',
      };
    });
    expect(sizing.bodyFont).toBeGreaterThanOrEqual(15);
    expect(sizing.searchFont).toBeGreaterThanOrEqual(16);
    expect(sizing.createHeight).toBeGreaterThanOrEqual(44);
    expect(sizing.searchWidth).toBeGreaterThanOrEqual(Math.min(width - 32, 200));
    expect(sizing.heroContainsAction).toBeTruthy();
    expect(sizing.feedWidth).toBeGreaterThanOrEqual(Math.min(width - 32, 440));
    expect(sizing.railVisible).toBe(width >= 1280);
    if (width < 1024) {
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).not.toBeVisible();
    }
    if ([390, 1440, 2560].includes(width)) await page.screenshot({ path: `test-results/feed-${width}.png` });

    await page.goto('/posts/1');
    await expect(page.locator('.thread-post h1')).toBeVisible();
    await expect(page.locator('.comment').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await page.locator('.thread-body').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.locator('.comment').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.comment').last()).toBeInViewport();
    if (width === 390) {
      await page.getByRole('button', { name: 'Create post', exact: true }).click();
      expect(await page.getByLabel('Title', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await expect(page.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
    }
  });
}

test('short landscape screens keep dialogs and navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Create post', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Publish post' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Publish post' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
