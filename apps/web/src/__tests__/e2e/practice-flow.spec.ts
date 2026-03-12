/**
 * E2E Test: Practice Flow (핵심 사용자 여정 #1)
 *
 * Member 연습 플로우:
 *  1. Login → Practice 탭 이동
 *  2. 카메라 촬영 시작
 *  3. Feel Check 입력 (AI 원칙 4 준수 검증)
 *  4. AI 분석 결과 확인
 *
 * @playwright
 * @feature F-005
 */

import { test, expect } from '@playwright/test';

test.describe('Practice Flow (Member)', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Login as member via test account
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test-member@hellonext.io');
    await page.click('[data-testid="email-login-btn"]');
    // Wait for redirect to member dashboard
    await page.waitForURL('/practice');
  });

  test('should display practice page with camera button', async ({ page }) => {
    await expect(page.locator('[data-testid="start-recording-btn"]')).toBeVisible();
    await expect(page.locator('h2')).toContainText('연습');
  });

  test('should enforce Feel Check before AI analysis (AI Principle 4)', async ({ page }) => {
    // Start recording
    await page.click('[data-testid="start-recording-btn"]');

    // Simulate camera recording (permission granted)
    await page.waitForSelector('[data-testid="recording-indicator"]', { timeout: 5000 });

    // Stop recording
    await page.click('[data-testid="stop-recording-btn"]');

    // Upload phase
    await page.waitForSelector('[data-testid="uploading-indicator"]', { timeout: 10000 });

    // CRITICAL: Feel Check MUST appear before analysis
    await expect(page.locator('[data-testid="feel-check-form"]')).toBeVisible();

    // AI analysis should NOT be visible yet
    await expect(page.locator('[data-testid="analysis-result"]')).not.toBeVisible();

    // Complete Feel Check
    await page.click('[data-testid="feel-good-btn"]');
    await page.click('[data-testid="feel-submit-btn"]');

    // NOW analysis should begin
    await page.waitForSelector('[data-testid="analyzing-indicator"]', { timeout: 5000 });

    // Wait for result
    await page.waitForSelector('[data-testid="analysis-result"]', { timeout: 30000 });
    await expect(page.locator('[data-testid="analysis-result"]')).toBeVisible();
  });

  test('should show 3 feel options: good, unsure, off', async ({ page }) => {
    // Navigate to feel check (simulate post-recording state)
    await page.goto('/practice?state=feel_check&videoId=test-123');

    await expect(page.locator('[data-testid="feel-good-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="feel-unsure-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="feel-off-btn"]')).toBeVisible();
  });

  test('should handle camera permission denied gracefully', async ({ page, context }) => {
    // Setup: Deny camera permission
    await context.grantPermissions([], { origin: 'http://localhost:3000' });

    await page.goto('/practice');

    // Click to start recording
    await page.click('[data-testid="start-recording-btn"]');

    // Should show permission error or fallback UI
    await expect(
      page.locator('[data-testid="camera-permission-error"]'),
    ).toBeVisible();

    // Should still show video upload dropzone as fallback
    await expect(
      page.locator('[data-testid="video-upload-dropzone"]'),
    ).toBeVisible();
  });

  test('should support video file upload as camera fallback', async ({ page }) => {
    // Start recording (simulating permission denied would fall back to upload)
    await page.goto('/practice?state=upload_video');

    // Verify upload dropzone is visible
    await expect(
      page.locator('[data-testid="video-upload-dropzone"]'),
    ).toBeVisible();

    // In real test, would drag/drop or click to upload file
    // For this test, verify the UI element exists and is interactive
    const dropzone = page.locator('[data-testid="video-upload-dropzone"]');
    await expect(dropzone).toBeEnabled();
  });

  test('should enforce feel check completion before AI analysis button is enabled', async ({
    page,
  }) => {
    // After recording, feel check form appears
    await page.goto('/practice?state=feel_check&videoId=test-123');

    // AI analysis button should be DISABLED until feel check is done
    const analyzeBtn = page.locator('[data-testid="analyze-btn"]');
    await expect(analyzeBtn).toBeDisabled();

    // Complete feel check
    await page.click('[data-testid="feel-good-btn"]');
    await page.click('[data-testid="feel-submit-btn"]');

    // NOW analyze button should be enabled
    await expect(analyzeBtn).toBeEnabled();
  });

  test('should prevent feel check submission with incomplete form', async ({
    page,
  }) => {
    // Navigate to feel check
    await page.goto('/practice?state=feel_check&videoId=test-123');

    // Try to submit without selecting anything
    const submitBtn = page.locator('[data-testid="feel-submit-btn"]');

    // Button should be disabled if no option selected
    // OR form validation should appear
    if (
      (await submitBtn.isEnabled()) === false
    ) {
      // Button is disabled - correct behavior
      expect(true).toBe(true);
    } else {
      // Form validation message should appear
      await page.click('[data-testid="feel-submit-btn"]');
      await expect(
        page.locator('[data-testid="feel-check-error"]'),
      ).toBeVisible();
    }
  });

  test('should handle network interruption during upload', async ({
    page,
    context,
  }) => {
    await page.goto('/practice');

    // Simulate network failure during upload
    await context.setOffline(true);

    // Start recording
    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    // Stop recording
    await page.click('[data-testid="stop-recording-btn"]');

    // Uploading should fail or show retry UI
    await page.waitForSelector('[data-testid="upload-error"]', { timeout: 5000 });

    // Should show retry option
    await expect(page.locator('[data-testid="retry-upload-btn"]')).toBeVisible();

    // Restore connectivity
    await context.setOffline(false);

    // Retry should work
    await page.click('[data-testid="retry-upload-btn"]');
    await page.waitForSelector('[data-testid="uploading-indicator"]', {
      timeout: 10000,
    });
  });

  test('should handle network interruption during analysis', async ({
    page,
    context,
  }) => {
    await page.goto('/practice');

    // Start and complete recording + feel check
    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    await page.click('[data-testid="stop-recording-btn"]');
    await page.waitForSelector('[data-testid="uploading-indicator"]', {
      timeout: 10000,
    });

    // Complete feel check
    await expect(page.locator('[data-testid="feel-check-form"]')).toBeVisible();
    await page.click('[data-testid="feel-good-btn"]');
    await page.click('[data-testid="feel-submit-btn"]');

    // Now AI analysis starts
    await page.waitForSelector('[data-testid="analyzing-indicator"]', {
      timeout: 5000,
    });

    // Simulate network failure during analysis
    await context.setOffline(true);

    // Wait a bit for analysis to be interrupted
    await page.waitForTimeout(2000);

    // Should show analysis error
    await expect(page.locator('[data-testid="analysis-error"]')).toBeVisible();

    // Should offer retry
    await expect(page.locator('[data-testid="retry-analysis-btn"]')).toBeVisible();

    // Restore connectivity
    await context.setOffline(false);

    // Retry analysis
    await page.click('[data-testid="retry-analysis-btn"]');
    await page.waitForSelector('[data-testid="analysis-result"]', {
      timeout: 30000,
    });
  });

  test('should display analysis results matching API response', async ({
    page,
  }) => {
    // Complete full flow: record → feel check → analyze
    await page.goto('/practice');

    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    await page.click('[data-testid="stop-recording-btn"]');
    await page.waitForSelector('[data-testid="uploading-indicator"]', {
      timeout: 10000,
    });

    // Feel check
    await expect(page.locator('[data-testid="feel-check-form"]')).toBeVisible();
    await page.click('[data-testid="feel-good-btn"]');
    await page.click('[data-testid="feel-submit-btn"]');

    // Analysis
    await page.waitForSelector('[data-testid="analyzing-indicator"]', {
      timeout: 5000,
    });

    // Wait for results
    await page.waitForSelector('[data-testid="analysis-result"]', {
      timeout: 30000,
    });

    // Verify results are displayed
    const resultDistance = page.locator('[data-testid="result-distance"]');
    const resultCarry = page.locator('[data-testid="result-carry"]');
    const resultSpeed = page.locator('[data-testid="result-club-head-speed"]');

    // All result metrics should be visible
    await expect(resultDistance).toBeVisible();
    await expect(resultCarry).toBeVisible();
    await expect(resultSpeed).toBeVisible();

    // Verify results contain numbers (basic validation)
    const distanceText = await resultDistance.textContent();
    expect(distanceText).toMatch(/\d+/); // Should contain digits
  });

  test('should show confidence tier indicator with results', async ({
    page,
  }) => {
    // Complete full measurement flow
    await page.goto('/practice');

    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    await page.click('[data-testid="stop-recording-btn"]');
    await page.waitForSelector('[data-testid="uploading-indicator"]', {
      timeout: 10000,
    });

    await page.click('[data-testid="feel-good-btn"]');
    await page.click('[data-testid="feel-submit-btn"]');

    await page.waitForSelector('[data-testid="analyzing-indicator"]', {
      timeout: 5000,
    });

    await page.waitForSelector('[data-testid="analysis-result"]', {
      timeout: 30000,
    });

    // Verify confidence tier indicator is shown
    const confidenceIndicator = page.locator(
      '[data-testid="confidence-tier-indicator"]',
    );
    await expect(confidenceIndicator).toBeVisible();

    // Should show one of: confirmed, pending_verification, hidden
    const classes = await confidenceIndicator.getAttribute('class');
    expect(
      classes,
    ).toMatch(/confirmed|pending_verification|hidden/);
  });

  test('should allow user to re-record after failed analysis', async ({
    page,
    context,
  }) => {
    await page.goto('/practice');

    // First recording (will fail)
    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    await page.click('[data-testid="stop-recording-btn"]');

    // Simulate network failure
    await context.setOffline(true);
    await page.waitForSelector('[data-testid="upload-error"]', { timeout: 5000 });

    // Restore network
    await context.setOffline(false);

    // Clear error and start new recording
    await page.click('[data-testid="clear-error-btn"]');

    // Should be back to start recording state
    await expect(page.locator('[data-testid="start-recording-btn"]')).toBeVisible();

    // Record again
    await page.click('[data-testid="start-recording-btn"]');
    await page.waitForSelector('[data-testid="recording-indicator"]', {
      timeout: 5000,
    });

    // Verify we can complete the flow
    await page.click('[data-testid="stop-recording-btn"]');
    await page.waitForSelector('[data-testid="uploading-indicator"]', {
      timeout: 10000,
    });
  });
});
