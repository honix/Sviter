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

  test('text selection adds context with floating button', async ({ page }) => {
    // Step 1: Open TestPage which has selectable content
    await test.step('Open TestPage', async () => {
      await page.locator('text=TestPage').first().click()
      await expect(page.locator('text=various formatting')).toBeVisible({ timeout: 5000 })
    })

    // Step 2: Select text in the center panel using JavaScript for reliability
    await test.step('Select text in center panel', async () => {
      // Find the center panel and locate the text element
      const centerPanel = page.locator('[data-selection-area="center-panel"]')
      await expect(centerPanel).toBeVisible()

      // Use JavaScript to select text reliably
      await page.evaluate(() => {
        const textNode = document.evaluate(
          "//text()[contains(., 'various formatting')]",
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue

        if (textNode) {
          const range = document.createRange()
          range.selectNodeContents(textNode.parentElement!)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      })

      // Wait for the selection to register and button to appear
      await page.waitForTimeout(500)

      // Verify the floating "Add to chat" button appears
      // Use title attribute as reliable selector
      const addToChatButton = page.locator('[title="Add selection to chat context"]')
      await expect(addToChatButton).toBeVisible({ timeout: 5000 })
    })

    // Step 3: Click "Add to chat" button
    await test.step('Click Add to chat button', async () => {
      const addToChatButton = page.locator('[title="Add selection to chat context"]')
      await addToChatButton.click()

      // Verify the selection badge appears (shows context was added)
      // Badge is inside a div with bg-pink-400 class containing #1
      await expect(page.locator('text=/#1/')).toBeVisible({ timeout: 3000 })
    })

    // Step 4: Send message and verify mock LLM acknowledges context
    await test.step('Send message with context', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      await chatInput.fill('What does this text mean?')
      await chatInput.press('Enter')

      // Wait for the mock LLM response that acknowledges receiving context
      // Mock adapter responds: "I see you provided 1 context from: TestPage.md"
      await expect(
        page.locator('text=/I see you provided.*context/')
      ).toBeVisible({ timeout: 15000 })
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
      // Find the TestPage item in the left panel page tree
      // It should be a clickable element with the text "TestPage"
      const leftPanel = page.locator('[data-panel]').first()
      const testPageItem = leftPanel.locator('text=TestPage').first()

      // Hover to reveal the action button
      await testPageItem.hover()
      await page.waitForTimeout(300)

      // Find the add path to chat button by its title
      const addPathButton = page.locator('[title="Add path to chat"]').first()
      await expect(addPathButton).toBeVisible({ timeout: 3000 })
      await addPathButton.click()

      // Verify the selection badge appears for the file path
      await expect(page.locator('text=/#1/')).toBeVisible({ timeout: 3000 })
    })

    // Step 3: Send message and verify mock LLM acknowledges file mention
    await test.step('Send message with file mention', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })

      await chatInput.fill('Tell me about this file')
      await chatInput.press('Enter')

      // Wait for the mock LLM response that acknowledges receiving the file path context
      // Mock adapter will see [path: TestPage.md] and respond about the file reference
      await expect(
        page.locator('text=/I see you provided.*context/')
      ).toBeVisible({ timeout: 15000 })
    })
  })

  test('context badge can be removed before sending', async ({ page }) => {
    // Step 1: Add a file mention context (simpler than text selection)
    await test.step('Add file mention context', async () => {
      await page.locator('text=Home').first().click()
      await expect(page.locator('text=Welcome to Test Wiki')).toBeVisible({ timeout: 5000 })

      const testPageItem = page.locator('[data-panel]').first().locator('text=TestPage').first()
      await testPageItem.hover()
      await page.waitForTimeout(300)

      const addPathButton = page.locator('[title="Add path to chat"]').first()
      await addPathButton.click()

      await expect(page.locator('text=/#1/')).toBeVisible({ timeout: 3000 })
    })

    // Step 2: Remove the context by clicking the X button
    await test.step('Remove context via X button', async () => {
      // The badge contains an X button for removal
      // Find the badge container and then the button inside it
      const badgeContainer = page.locator('.bg-pink-400').filter({ hasText: '#1' }).first()
      const removeButton = badgeContainer.locator('button')
      await removeButton.click()

      // Badge should be gone
      await expect(page.locator('text=/#1.*line/')).not.toBeVisible({ timeout: 3000 })
    })

    // Step 3: Send message without context
    await test.step('Send message without context', async () => {
      const chatInput = page.locator('input[placeholder*="Type"], input[placeholder*="Ask"], textarea').first()
      await chatInput.fill('Hello without context')
      await chatInput.press('Enter')

      // Mock LLM should respond normally (no context acknowledgment)
      await expect(
        page.locator('text=I can help you with wiki pages')
      ).toBeVisible({ timeout: 15000 })
    })
  })
})
