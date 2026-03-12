/**
 * E2E Test: Coupon Redeem Flow (핵심 사용자 여정 #3)
 *
 * Member 쿠폰 입력 → 프로 연결 플로우:
 *  1. Login as Member → Redeem 페이지
 *  2. 쿠폰 코드 입력
 *  3. 활성화 성공 → 프로 연결 확인
 *  4. 연습 탭으로 이동 가능 확인
 *
 * @playwright
 * @feature F-012
 */

import { test, expect } from '@playwright/test';

test.describe('Coupon Redeem Flow (Member)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'new-member@hellonext.io');
    await page.click('[data-testid="email-login-btn"]');
    await page.waitForURL('/redeem');
  });

  test('should display coupon input form', async ({ page }) => {
    await expect(page.locator('input[placeholder*="XXXX"]')).toBeVisible();
    await expect(page.locator('button:has-text("쿠폰 활성화")')).toBeVisible();
  });

  test('should auto-format coupon code with dash', async ({ page }) => {
    const input = page.locator('input[placeholder*="XXXX"]');
    await input.fill('ABCD1234');

    // Should auto-format to ABCD-1234
    await expect(input).toHaveValue('ABCD-1234');
  });

  test('should disable submit for short codes', async ({ page }) => {
    const input = page.locator('input[placeholder*="XXXX"]');
    await input.fill('ABC');

    const submitBtn = page.locator('button:has-text("쿠폰 활성화")');
    await expect(submitBtn).toBeDisabled();
  });

  test('should show error for invalid code', async ({ page }) => {
    const input = page.locator('input[placeholder*="XXXX"]');
    await input.fill('AAAA-BBBB');
    await page.click('button:has-text("쿠폰 활성화")');

    // Should show error message
    await expect(page.locator('text=유효하지 않은')).toBeVisible({ timeout: 5000 });
  });

  test('should show success and navigate to practice', async ({ page }) => {
    // Use a pre-seeded valid coupon code
    const input = page.locator('input[placeholder*="XXXX"]');
    await input.fill('TEST-CODE');
    await page.click('button:has-text("쿠폰 활성화")');

    // Success screen
    await expect(page.locator('text=쿠폰 활성화 완료')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=유효기간')).toBeVisible();

    // Navigate to practice
    await page.click('button:has-text("연습 시작하기")');
    await page.waitForURL('/practice');
  });
});
