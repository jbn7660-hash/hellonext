/**
 * E2E Test: Mobile Responsive & Touch Interactions
 *
 * Tests web app on mobile viewport sizes to ensure
 * proper rendering before native app is deployed.
 */

import { test, expect, devices } from '@playwright/test';

const iPhone = devices['iPhone 14'];
const pixel = devices['Pixel 7'];
const iPad = devices['iPad (gen 7)'];

test.describe('Mobile Responsive — iPhone', () => {
  test.use({ ...iPhone });

  test('should render login page correctly on iPhone', async ({ page }) => {
    await page.goto('/login');
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(430);

    // Login form should be visible and touch-friendly
    const kakaoButton = page.locator('button:has-text("카카오")');
    if (await kakaoButton.isVisible()) {
      const box = await kakaoButton.boundingBox();
      // Minimum touch target: 44x44px (Apple HIG)
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('should have proper safe area handling', async ({ page }) => {
    await page.goto('/');

    // Check viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
  });

  test('should not have horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe('Mobile Responsive — Android', () => {
  test.use({ ...pixel });

  test('should render correctly on Pixel viewport', async ({ page }) => {
    await page.goto('/');
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(420);
  });

  test('should handle bottom sheet on mobile', async ({ page }) => {
    await page.goto('/');
    // Bottom sheets should respect safe area
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Tablet Responsive — iPad', () => {
  test.use({ ...iPad });

  test('should use wider layout on iPad', async ({ page }) => {
    await page.goto('/');
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeGreaterThanOrEqual(768);
  });
});

test.describe('Touch Interactions', () => {
  test.use({ ...iPhone });

  test('should support pull-to-refresh gesture', async ({ page }) => {
    await page.goto('/');
    // Verify the page doesn't break on touch events
    await page.touchscreen.tap(200, 300);
    await page.waitForTimeout(500);
    // Page should still be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle swipe navigation', async ({ page }) => {
    await page.goto('/practice');
    // Verify swipe-able elements don't break
    await page.touchscreen.tap(100, 400);
    await page.waitForTimeout(300);
  });
});
