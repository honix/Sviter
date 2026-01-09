import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Chat Context Selection
 *
 * Tests the "Add to Chat" context feature:
 * 1. Text selection from page content adds context
 * 2. File mention from page tree adds context
 * 3. Mock LLM correctly receives and acknowledges context
 *
 * Run with: make e2e (uses docker-compose.e2e.yml)
 * Uses mock LLM (LLM_PROVIDER=mock) - no real API calls
 */

test.describe('Chat Context Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    // Wait for the WebSocket connection and app to load
    await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })

    // Wait for page tree to load
    await page.waitForSelector('text=Home', { timeout: 10000 })
  })

  test('text selection adds context with "Add to chat" button', async ({ page }) => {
    // Step 1: Open TestPage which has selectable content
    await test.step('Open TestPage', async () => {
      await page.locator('text=TestPage').first().click()
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Select text in the center panel
    await test.step('Select text in center panel', async () => {
      // Find the center panel content area
      const centerPanel = page.locator('[data-selection-area="center-panel"]')
      await expect(centerPanel).toBeVisible()

      // Select text "various formatting" by triple-clicking the element containing it
      const textElement = page.locator('text=various formatting').first()
      await textElement.click({ clickCount: 3 }) // Triple-click to select the line

      // Verify the floating "Add to chat" button appears
      const addToChatButton = page.getByRole('button', { name: /Add to chat/i })
      await expect(addToChatButton).toBeVisible({ timeout: 5000 })
    })

    // Step 3: Click "Add to chat" button
    await test.step('Click Add to chat button', async () => {
      const addToChatButton = page.getByRole('button', { name: /Add to chat/i })
      await addToChatButton.click()

      // Verify the selection badge appears (shows context was added)
      // Badge format: "#1 · N lines · filename.md"
      const badge = page.locator('.bg-pink-400').filter({ hasText: /#1/ })
      await expect(badge).toBeVisible({ timeout: 3000 })
    })

    // Step 4: Send message and verify mock LLM acknowledges context
    await test.step('Send message with context', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      await chatInput.fill('What does this text mean?')
      await chatInput.press('Enter')

      // Wait for the mock LLM response that acknowledges receiving context
      // Mock adapter responds with details about the context it received
      await expect(
        page.locator('text=I see you provided context').or(
          page.locator('text=contextItem').or(
            page.locator('text=TestPage.md')
          )
        ).first()
      ).toBeVisible({ timeout: 10000 })
    })

    // Step 5: Verify context badge is cleared after sending
    await test.step('Context badge cleared after send', async () => {
      // The badge should be gone after the message is sent
      const badge = page.locator('.bg-pink-400').filter({ hasText: /#1/ })
      await expect(badge).not.toBeVisible({ timeout: 3000 })
    })
  })

  test('file mention from page tree adds context', async ({ page }) => {
    // Step 1: Open Home page first
    await test.step('Open Home page', async () => {
      await page.locator('text=Home').first().click()
      await expect(page.locator('text=Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Hover over TestPage in tree to reveal the add-to-chat button
    await test.step('Add file mention via page tree button', async () => {
      // Find the TestPage row in the tree
      const testPageRow = page.locator('button, div').filter({ hasText: /^TestPage$/ }).first()
      await testPageRow.hover()

      // Wait a moment for the button to appear
      await page.waitForTimeout(500)

      // Find the pink MessageSquarePlus button (add path to chat)
      // It's a small icon button that appears on hover
      const addPathButton = page.locator('[title="Add path to chat"]').first()
      await expect(addPathButton).toBeVisible({ timeout: 3000 })
      await addPathButton.click()

      // Verify the selection badge appears for the file path
      // Badge format: "#1 · 1 line · TestPage.md"
      const badge = page.locator('.bg-pink-400').filter({ hasText: /#1/ })
      await expect(badge).toBeVisible({ timeout: 3000 })
    })

    // Step 3: Send message and verify mock LLM acknowledges file mention
    await test.step('Send message with file mention', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      await chatInput.fill('Tell me about this file')
      await chatInput.press('Enter')

      // Wait for the mock LLM response that acknowledges receiving the file path context
      await expect(
        page.locator('text=I see you provided context').or(
          page.locator('text=TestPage.md')
        ).first()
      ).toBeVisible({ timeout: 10000 })
    })
  })

  test('multiple contexts can be added and are all sent to LLM', async ({ page }) => {
    // Step 1: Open TestPage
    await test.step('Open TestPage', async () => {
      await page.locator('text=TestPage').first().click()
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Add text selection as first context
    await test.step('Add text selection as context #1', async () => {
      const textElement = page.locator('text=various formatting').first()
      await textElement.click({ clickCount: 3 })

      const addToChatButton = page.getByRole('button', { name: /Add to chat/i })
      await expect(addToChatButton).toBeVisible({ timeout: 5000 })
      await addToChatButton.click()

      // Verify badge #1 appears
      await expect(page.locator('.bg-pink-400').filter({ hasText: /#1/ })).toBeVisible()
    })

    // Step 3: Add file mention as second context
    await test.step('Add file mention as context #2', async () => {
      // Hover over Home in tree to add it as context
      const homeRow = page.locator('button, div').filter({ hasText: /^Home$/ }).first()
      await homeRow.hover()
      await page.waitForTimeout(500)

      const addPathButton = homeRow.locator('[title="Add path to chat"]').or(
        page.locator('[title="Add path to chat"]').first()
      )
      await addPathButton.click()

      // Verify badge #2 appears
      await expect(page.locator('.bg-pink-400').filter({ hasText: /#2/ })).toBeVisible()
    })

    // Step 4: Send message with multiple contexts
    await test.step('Send message with multiple contexts', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await chatInput.fill('Analyze these')
      await chatInput.press('Enter')

      // Mock LLM should acknowledge receiving multiple contexts
      await expect(
        page.locator('text=2 context').or(page.locator('text=contexts'))
      ).toBeVisible({ timeout: 10000 })
    })
  })

  test('context badge can be removed before sending', async ({ page }) => {
    // Step 1: Open TestPage and add selection
    await test.step('Add context', async () => {
      await page.locator('text=TestPage').first().click()
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })

      const textElement = page.locator('text=various formatting').first()
      await textElement.click({ clickCount: 3 })

      const addToChatButton = page.getByRole('button', { name: /Add to chat/i })
      await addToChatButton.click()

      await expect(page.locator('.bg-pink-400').filter({ hasText: /#1/ })).toBeVisible()
    })

    // Step 2: Remove the context by clicking the X button
    await test.step('Remove context via X button', async () => {
      // Find the X button inside the badge
      const badge = page.locator('.bg-pink-400').filter({ hasText: /#1/ })
      const removeButton = badge.locator('button')
      await removeButton.click()

      // Badge should be gone
      await expect(page.locator('.bg-pink-400').filter({ hasText: /#1/ })).not.toBeVisible()
    })

    // Step 3: Send message without context
    await test.step('Send message without context', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await chatInput.fill('Hello without context')
      await chatInput.press('Enter')

      // Mock LLM should respond normally (no context acknowledgment)
      await expect(
        page.locator('text=I can help you with wiki pages')
      ).toBeVisible({ timeout: 10000 })
    })
  })
})
