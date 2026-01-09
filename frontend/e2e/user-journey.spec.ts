import { test, expect } from '@playwright/test'

/**
 * E2E User Journey Test
 *
 * IMPORTANT: These tests run ONLY in Docker with controlled test fixtures.
 * Run with: make e2e (which uses docker-compose.e2e.yml)
 *
 * Test fixtures location: tests/fixtures/wiki/
 * - Home.md: "Welcome to Test Wiki"
 * - TestPage.md: Page with various formatting
 * - Concepts.md: Core concepts
 *
 * Uses mock LLM (LLM_PROVIDER=mock) - no real API calls
 */

test.describe('User Journey - Edit Wiki via Agent Thread', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/')

    // Wait for the WebSocket connection to establish
    await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })

    // Wait for page tree to load - should see Home from test fixtures
    await page.waitForSelector('text=Home', { timeout: 10000 })
  })

  test('complete edit workflow with agent thread', async ({ page }) => {
    // Step 1: Click on Home page and verify fixture content
    await test.step('Open Home page and verify content', async () => {
      await page.locator('text=Home').first().click()

      // Test fixture Home.md has "Welcome to Test Wiki"
      await expect(page.locator('text=Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Navigate to TestPage and verify fixture content
    await test.step('Open TestPage and verify content', async () => {
      await page.locator('text=TestPage').first().click()

      // Test fixture TestPage.md has "various formatting"
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })
    })

    // Step 3: Send a message to the assistant to trigger an edit
    await test.step('Ask agent to edit TestPage', async () => {
      // Find the chat input
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      // Type a message asking to edit
      await chatInput.fill('Please edit the TestPage and add a note at the top')
      await chatInput.press('Enter')
    })

    // Step 4: Verify thread was created (spawn_thread tool call shown)
    await test.step('Verify thread was spawned', async () => {
      // Mock adapter spawns thread named "e2e-test-edit"
      // Look for evidence of spawn_thread call or thread notification
      await expect(
        page.locator('text=spawn_thread').or(page.locator('text=e2e-test-edit')).first()
      ).toBeVisible({ timeout: 30000 })
    })

    // Step 5: Wait for thread to reach REVIEW status and select it
    await test.step('Thread reaches REVIEW status', async () => {
      // Wait for thread to finish working and reach review status
      // The thread selector dropdown shows threads grouped by status
      // When a thread is in review, it shows "(Ready for review)" text

      // First, click on the thread selector dropdown to open it
      // The dropdown trigger contains "User Assistant" text initially
      const threadSelector = page.locator('button').filter({ hasText: /User Assistant/i }).first()
      await expect(threadSelector).toBeVisible({ timeout: 10000 })

      // Wait a bit for the thread to complete its work and reach REVIEW status
      // The mock adapter is fast, but we need to wait for WebSocket updates
      await page.waitForTimeout(2000)

      // Click to open the dropdown
      await threadSelector.click()

      // Wait for the dropdown to show a thread with "Ready for review" status
      await expect(
        page.locator('text=Ready for review').first()
      ).toBeVisible({ timeout: 30000 })

      // Click on the thread to select it
      await page.locator('text=Ready for review').first().click()
    })

    // Step 6: Verify Accept/Reject buttons are visible and accept the thread
    await test.step('Accept thread changes', async () => {
      // Now that we've selected the thread, we should see Accept and Reject buttons
      await expect(
        page.getByRole('button', { name: /Accept Changes/i })
      ).toBeVisible({ timeout: 10000 })

      await expect(
        page.getByRole('button', { name: /Reject/i })
      ).toBeVisible()

      // Click the Accept Changes button
      await page.getByRole('button', { name: /Accept Changes/i }).click()

      // Wait for the thread status to change to accepted
      // After acceptance, the Accept button should disappear
      await expect(
        page.getByRole('button', { name: /Accept Changes/i })
      ).not.toBeVisible({ timeout: 10000 })
    })

    // Step 7: Verify changes were merged to main
    await test.step('Verify changes merged to main', async () => {
      // Navigate to TestPage and verify the mock edit was applied
      // The mock adapter edits TestPage to add "This section was added by the E2E test mock agent"
      await page.locator('text=TestPage').first().click()

      // Use .first() since the text might appear multiple times (from retries or multiple edits)
      await expect(
        page.locator('text=This section was added by the E2E test mock agent').first()
      ).toBeVisible({ timeout: 5000 })
    })
  })

  test('page navigation works correctly', async ({ page }) => {
    await test.step('Navigate between fixture pages', async () => {
      // Click Home - fixture has "Welcome to Test Wiki"
      await page.getByRole('button', { name: /Home/i }).first().click()
      await expect(page.locator('text=Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })

      // Click TestPage - fixture has "various formatting"
      await page.getByRole('button', { name: /TestPage/i }).first().click()
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })

      // Click Concepts - verify the heading appears (use exact match)
      await page.getByRole('button', { name: /Concepts/i }).first().click()
      await expect(page.getByRole('heading', { name: 'Concepts', exact: true })).toBeVisible({ timeout: 5000 })
    })
  })

  test('chat interface is responsive', async ({ page }) => {
    await test.step('Chat input accepts messages', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      await chatInput.fill('Hello, can you help me?')
      await expect(chatInput).toHaveValue('Hello, can you help me?')
    })
  })
})
