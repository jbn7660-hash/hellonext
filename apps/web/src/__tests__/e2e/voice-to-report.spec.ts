/**
 * E2E Test: Voice-to-Report Flow (핵심 사용자 여정 #2)
 *
 * Pro 음성 메모 → AI 리포트 생성 플로우:
 *  1. Login as Pro → Dashboard
 *  2. FAB 버튼으로 녹음 시작
 *  3. 녹음 완료 → 파이프라인 진행
 *  4. 리포트 생성 확인 → 편집 → 발행
 *
 * @playwright
 * @feature F-001, F-002, F-003
 */

import { test, expect } from '@playwright/test';

test.describe('Voice-to-Report Flow (Pro)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test-pro@hellonext.io');
    await page.click('[data-testid="email-login-btn"]');
    await page.waitForURL('/dashboard');
  });

  test('should show FAB button on dashboard', async ({ page }) => {
    await expect(page.locator('[data-testid="voice-fab"]')).toBeVisible();
  });

  test('should start recording on FAB press', async ({ page }) => {
    await page.click('[data-testid="voice-fab"]');

    // FAB should transition to recording state
    await expect(page.locator('[data-testid="voice-fab-recording"]')).toBeVisible();
    await expect(page.locator('[data-testid="recording-duration"]')).toBeVisible();
  });

  test('should generate report after recording', async ({ page }) => {
    // Start recording
    await page.click('[data-testid="voice-fab"]');
    await page.waitForTimeout(3000); // Record for 3 seconds

    // Stop recording
    await page.click('[data-testid="voice-fab-recording"]');

    // Should show uploading state
    await page.waitForSelector('[data-testid="voice-fab-uploading"]', { timeout: 5000 });

    // Wait for pipeline completion (Realtime update)
    await page.waitForSelector('[data-testid="voice-fab-done"]', { timeout: 60000 });

    // Navigate to reports
    await page.click('[data-testid="nav-reports"]');
    await page.waitForURL('/reports');

    // Latest report should be visible
    const firstReport = page.locator('[data-testid="report-item"]').first();
    await expect(firstReport).toBeVisible();
  });

  test('should allow editing and publishing report', async ({ page }) => {
    // Navigate to existing draft report
    await page.goto('/reports');
    const draftReport = page.locator('[data-testid="report-item"][data-status="draft"]').first();
    await draftReport.click();

    // Should see report viewer
    await expect(page.locator('[data-testid="report-viewer"]')).toBeVisible();

    // Edit button
    await page.click('[data-testid="edit-report-btn"]');

    // Publish button
    await page.click('[data-testid="publish-report-btn"]');

    // Confirmation dialog
    await page.click('[data-testid="confirm-publish-btn"]');

    // Status should update
    await expect(page.locator('[data-testid="report-status"]')).toContainText('발행됨');
  });
});
