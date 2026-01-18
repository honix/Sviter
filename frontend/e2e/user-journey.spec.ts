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
    await expect(page.getByTestId('page-Home')).toBeVisible({ timeout: 10000 })
  })

  test('complete edit workflow with agent thread', async ({ page }) => {
    // Step 1: Click on Home page and verify fixture content
    await test.step('Open Home page and verify content', async () => {
      await page.getByTestId('page-Home').click()

      // Test fixture Home.md has "Welcome to Test Wiki"
      await expect(page.getByText('Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Navigate to TestPage and verify fixture content
    await test.step('Open TestPage and verify content', async () => {
      await page.getByTestId('page-TestPage').click()

      // Test fixture TestPage.md has "various formatting"
      await expect(page.getByText('various formatting')).toBeVisible({ timeout: 5000 })
    })

    // Step 3: Start a thread via the pink button to trigger an edit
    await test.step('Start thread to edit TestPage', async () => {
      // Find the chat input
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      // Type a message asking to edit
      await chatInput.fill('Please edit the TestPage and add a note at the top')

      // Click the pink "Start thread" button (not Enter)
      await page.getByTestId('start-thread-button').click()
    })

    // Step 4: Wait for thread to complete and verify status
    await test.step('Thread reaches REVIEW status', async () => {
      // Wait for the mock adapter to complete its work and set status
      // The mock adapter calls: read_page, edit_page, set_thread_name, set_thread_status
      await expect(
        page.locator('text=Done - ready to merge').first()
      ).toBeVisible({ timeout: 30000 })
    })

    // Step 6: Verify Accept button is visible and accept the thread
    await test.step('Accept thread changes', async () => {
      // Now that we've selected the thread, we should see Accept button
      await expect(
        page.getByRole('button', { name: /Accept and merge to main/i })
      ).toBeVisible({ timeout: 10000 })

      // Click the Accept button
      await page.getByRole('button', { name: /Accept and merge to main/i }).click()

      // Wait for the thread status to change to accepted
      // After acceptance, the Accept button should disappear
      await expect(
        page.getByRole('button', { name: /Accept and merge to main/i })
      ).not.toBeVisible({ timeout: 10000 })
    })

    // Step 7: Switch to assistant to view main branch
    await test.step('Switch to assistant (main branch)', async () => {
      // After accepting, switch to assistant to view merged content on main
      const threadSelector = page.locator('[role="combobox"]').first()
      await expect(threadSelector).toBeVisible({ timeout: 5000 })
      await threadSelector.click()

      // Select "Chat with assistant" option
      await page.getByText('Chat with assistant').click()

      // Wait for page tree to stabilize after branch switch
      await expect(page.getByTestId('page-Home')).toBeVisible({ timeout: 10000 })
    })

    // Step 8: Verify changes were merged to main
    await test.step('Verify changes merged to main', async () => {
      // Navigate to TestPage and verify the mock edit was applied
      // The mock adapter edits TestPage to add "This section was added by the E2E test mock agent"
      await page.getByTestId('page-TestPage').click()

      // Verify the mock edit was applied
      await expect(
        page.getByText('This section was added by the E2E test mock agent').first()
      ).toBeVisible({ timeout: 5000 })
    })
  })

  test('page navigation works correctly', async ({ page }) => {
    await test.step('Navigate between fixture pages', async () => {
      // Click Home - fixture has "Welcome to Test Wiki"
      await page.getByTestId('page-Home').click()
      await expect(page.getByText('Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })

      // Click TestPage - fixture has "various formatting"
      await page.getByTestId('page-TestPage').click()
      await expect(page.getByText('various formatting')).toBeVisible({ timeout: 5000 })

      // Click Concepts - verify the heading appears (use exact match)
      await page.getByTestId('page-Concepts').click()
      await expect(page.getByRole('heading', { name: 'Concepts', exact: true })).toBeVisible({ timeout: 5000 })
    })
  })

  test('nested folder navigation works correctly', async ({ page }) => {
    await test.step('Verify nested structure and navigate', async () => {
      // Wait for page tree to load - Docs folder should be visible
      const docsFolder = page.getByTestId('folder-Docs')
      await expect(docsFolder).toBeVisible({ timeout: 10000 })

      // Click Docs folder to expand it
      await docsFolder.click()

      // After expanding Docs, Getting-Started page should appear
      const gettingStartedPage = page.getByTestId('page-Docs-Getting-Started')
      await expect(gettingStartedPage).toBeVisible({ timeout: 10000 })

      // Click Getting-Started to view the page
      await gettingStartedPage.click()

      // Verify the page content loaded
      await expect(page.getByText('This guide will help you get up and running quickly')).toBeVisible({ timeout: 10000 })

      // Now expand Tutorials folder (nested inside Docs)
      const tutorialsFolder = page.getByTestId('folder-Docs-Tutorials')
      await expect(tutorialsFolder).toBeVisible({ timeout: 10000 })
      await tutorialsFolder.click()

      // After expanding Tutorials, Basic page should appear
      const basicPage = page.getByTestId('page-Docs-Tutorials-Basic')
      await expect(basicPage).toBeVisible({ timeout: 10000 })

      // Click Basic to view the page
      await basicPage.click()
      await expect(page.getByText('This is a basic tutorial for beginners')).toBeVisible({ timeout: 10000 })

      // Click Advanced to view the page
      const advancedPage = page.getByTestId('page-Docs-Tutorials-Advanced')
      await advancedPage.click()
      await expect(page.getByText('This tutorial covers advanced features and patterns')).toBeVisible({ timeout: 10000 })
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

  test('expanded folders and current page persist after reload', async ({ page }) => {
    await test.step('Setup: Clear localStorage to ensure clean state', async () => {
      await page.evaluate(() => {
        localStorage.removeItem('sviter:expandedFolders')
        localStorage.removeItem('sviter:currentPagePath')
      })
      // Reload to apply clean state
      await page.reload()
      await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })
    })

    await test.step('Expand folders and navigate to nested page', async () => {
      // Wait for Docs folder to be visible
      const docsFolder = page.getByTestId('folder-Docs')
      await expect(docsFolder).toBeVisible({ timeout: 10000 })

      // Expand Docs folder
      await docsFolder.click()

      // Wait for Getting-Started page to appear (confirms folder is expanded)
      const gettingStartedPage = page.getByTestId('page-Docs-Getting-Started')
      await expect(gettingStartedPage).toBeVisible({ timeout: 10000 })

      // Expand Tutorials folder (nested inside Docs)
      const tutorialsFolder = page.getByTestId('folder-Docs-Tutorials')
      await expect(tutorialsFolder).toBeVisible({ timeout: 10000 })
      await tutorialsFolder.click()

      // Wait for Basic page to appear (confirms folder is expanded)
      const basicPage = page.getByTestId('page-Docs-Tutorials-Basic')
      await expect(basicPage).toBeVisible({ timeout: 10000 })

      // Navigate to Advanced tutorial page (deeply nested page)
      const advancedPage = page.getByTestId('page-Docs-Tutorials-Advanced')
      await advancedPage.click()
      await expect(page.getByText('This tutorial covers advanced features and patterns')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Reload page', async () => {
      await page.reload()

      // Wait for app to load again
      await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })
      // Wait for page tree to render with persisted state
      await expect(page.getByTestId('folder-Docs')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Verify folders remain expanded', async () => {
      // Docs folder should still be expanded - Getting-Started should be visible
      await expect(page.getByTestId('page-Docs-Getting-Started')).toBeVisible({ timeout: 10000 })

      // Tutorials folder should still be expanded - Basic and Advanced should be visible
      await expect(page.getByTestId('page-Docs-Tutorials-Basic')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('page-Docs-Tutorials-Advanced')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Verify current page is restored', async () => {
      // The Advanced tutorial page should still be selected and displayed
      await expect(page.getByText('This tutorial covers advanced features and patterns')).toBeVisible({ timeout: 10000 })

      // Verify the page title is shown correctly - Advanced tutorial should be the active page
      await expect(page.getByRole('heading', { name: 'Advanced Tutorial' })).toBeVisible({ timeout: 10000 })
    })
  })
})
