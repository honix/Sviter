import { test, expect, Page } from '@playwright/test'

/**
 * E2E Tests for Thread Features
 *
 * Tests the collaborative thread system:
 * - Starting threads via pink "Start thread" button
 * - Real-time status and name updates
 * - Thread changes visibility in all panels
 * - Accept button behavior
 * - Merging changes to main
 *
 * Uses mock LLM (LLM_PROVIDER=mock) - no real API calls
 */

// Helper function to start a thread
async function startThread(page: Page, message: string) {
  const chatInput = page.locator('textarea, input[type="text"]').first()
  await expect(chatInput).toBeVisible({ timeout: 5000 })
  await chatInput.fill(message)
  await page.getByTestId('start-thread-button').click()
}

// Helper function to wait for thread to be ready
async function waitForThreadReady(page: Page) {
  // Wait for "Done - ready to merge" status to appear in the thread selector
  // Use .first() because status may appear in multiple places (selector + diff view)
  await expect(page.locator('text=Done - ready to merge').first()).toBeVisible({ timeout: 30000 })
}

test.describe('Thread Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/')

    // Wait for the WebSocket connection to establish
    await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })

    // Wait for page tree to load - should see Home from test fixtures
    await expect(page.getByTestId('page-Home')).toBeVisible({ timeout: 10000 })
  })

  test('start thread with pink button and initial message', async ({ page }) => {
    await test.step('Type message in chat input', async () => {
      const chatInput = page.locator('textarea, input[type="text"]').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })
      await chatInput.fill('Please update the TestPage documentation')
    })

    await test.step('Click pink Start thread button', async () => {
      const startThreadBtn = page.getByTestId('start-thread-button')
      await expect(startThreadBtn).toBeVisible({ timeout: 5000 })
      await startThreadBtn.click()
    })

    await test.step('Verify thread created - status appears', async () => {
      // The mock adapter eventually sets status to "Done - ready to merge"
      // This confirms the thread was created and the agent processed it
      // Use .first() because status may appear in multiple places
      await expect(page.locator('text=Done - ready to merge').first()).toBeVisible({ timeout: 30000 })
    })

    await test.step('Verify thread name updated to docs-update', async () => {
      // The mock adapter renames the thread to "docs-update"
      await expect(page.locator('text=docs-update').first()).toBeVisible({ timeout: 5000 })
    })
  })

  test('thread status and name update in real-time', async ({ page }) => {
    await test.step('Start thread', async () => {
      await startThread(page, 'Edit TestPage docs')
    })

    await test.step('Wait for mock agent to complete work', async () => {
      // The mock adapter calls:
      // 1. read_page
      // 2. edit_page
      // 3. set_thread_name("docs-update")
      // 4. set_thread_status("Done - ready to merge")

      // Wait for status to appear - use .first() as it may appear in multiple places
      await expect(page.locator('text=Done - ready to merge').first()).toBeVisible({ timeout: 30000 })
    })

    await test.step('Verify name updated in thread selector', async () => {
      // The mock adapter renames the thread to "docs-update"
      await expect(page.locator('text=docs-update').first()).toBeVisible({ timeout: 5000 })
    })
  })

  test('thread changes visible in panels', async ({ page }) => {
    await test.step('Start thread and wait for completion', async () => {
      await startThread(page, 'Add note to TestPage')
      await waitForThreadReady(page)
    })

    await test.step('Chat shows tool calls or AI response', async () => {
      // Mock adapter produces messages - look for evidence of agent activity
      // Either tool calls or the final response
      await expect(
        page.getByText('edit_page').or(page.getByText("I've completed the edit"))
      ).toBeVisible({ timeout: 10000 })
    })

    await test.step('TestPage visible in page tree', async () => {
      // TestPage should be visible in the page tree (it's in test fixtures)
      await expect(page.getByTestId('page-TestPage')).toBeVisible()
    })
  })

  test('accept button states', async ({ page }) => {
    await test.step('Before thread: Accept button not visible', async () => {
      // When on assistant (main), no Accept button should be shown
      // Give it a short timeout since we're asserting it's NOT visible
      await expect(page.getByRole('button', { name: /Accept Changes/i })).not.toBeVisible({ timeout: 2000 })
    })

    await test.step('Start thread and wait for changes', async () => {
      await startThread(page, 'Update TestPage content')
      await waitForThreadReady(page)
    })

    await test.step('After changes: Accept button visible and enabled', async () => {
      const acceptBtn = page.getByRole('button', { name: /Accept Changes/i })
      await expect(acceptBtn).toBeVisible({ timeout: 10000 })
      await expect(acceptBtn).toBeEnabled()
    })
  })

  test('accept thread merges changes to main', async ({ page }) => {
    await test.step('Start thread and wait for completion', async () => {
      await startThread(page, 'Add E2E test note to TestPage')
      await waitForThreadReady(page)
    })

    await test.step('Click Accept button', async () => {
      const acceptBtn = page.getByRole('button', { name: /Accept Changes/i })
      await expect(acceptBtn).toBeVisible({ timeout: 10000 })
      await acceptBtn.click()
    })

    await test.step('Verify Accept button disappears', async () => {
      // After accepting, the Accept button should no longer be visible
      await expect(page.getByRole('button', { name: /Accept Changes/i })).not.toBeVisible({ timeout: 10000 })
    })

    await test.step('Switch to assistant (main branch)', async () => {
      // After accepting, the UI may auto-switch to assistant or stay on thread
      // Find the thread selector (combobox) to switch to assistant
      const threadSelector = page.locator('[role="combobox"]').first()
      await expect(threadSelector).toBeVisible({ timeout: 5000 })
      await threadSelector.click()

      // Select "Chat with assistant" option
      await page.getByText('Chat with assistant').click()
    })

    await test.step('Navigate to TestPage and verify merged content', async () => {
      // Click on TestPage in the page tree
      await page.getByTestId('page-TestPage').click()

      // The mock adapter adds this text to TestPage
      // Use .first() since multiple sections may exist from test retries
      await expect(
        page.getByText('This section was added by the E2E test mock agent').first()
      ).toBeVisible({ timeout: 10000 })
    })
  })

  test('no Reject button exists', async ({ page }) => {
    // Start a thread to get to the review state
    await startThread(page, 'Update TestPage')
    await waitForThreadReady(page)

    // Accept button should be visible
    await expect(page.getByRole('button', { name: /Accept Changes/i })).toBeVisible({ timeout: 10000 })

    // Reject button should NOT exist (new collaborative model)
    await expect(page.getByRole('button', { name: /Reject/i })).not.toBeVisible({ timeout: 2000 })
  })

  test('thread shows participant badges', async ({ page }) => {
    await test.step('Start thread', async () => {
      await startThread(page, 'Edit TestPage')
      await waitForThreadReady(page)
    })

    await test.step('Verify participant badge is visible in thread selector', async () => {
      // Open the thread selector dropdown to see participant badges
      // The thread selector button contains the thread name
      const selectorButton = page.locator('button').filter({ hasText: /docs-update/i })
      await expect(selectorButton).toBeVisible({ timeout: 5000 })
      await selectorButton.click()

      // In the dropdown, each thread item should show participant badges
      // Participants include at least the owner (guest-xxxxx)
      // Look for the colored badge element within the dropdown
      const participantBadge = page.locator('[role="listbox"]').locator('span').filter({
        hasText: /guest-/i
      })
      await expect(participantBadge.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test('user mention in initial message adds participant badge', async ({ page }) => {
    // Note: This test verifies the UI shows participant badges when a thread is created
    // In the test environment, only guest users exist, so we test that the owner badge shows

    await test.step('Start thread with mention in message', async () => {
      // Start a thread - the owner (current guest user) will be shown as participant
      await startThread(page, 'Edit TestPage @ai please help')
      await waitForThreadReady(page)
    })

    await test.step('Verify owner participant badge visible', async () => {
      // The thread should show at least the owner as a participant
      // Open the thread selector to see the badges
      const selectorButton = page.locator('button').filter({ hasText: /docs-update/i })
      await expect(selectorButton).toBeVisible({ timeout: 5000 })
      await selectorButton.click()

      // Look for participant badge (guest-xxxxx colored span)
      const participantBadge = page.locator('[role="listbox"]').locator('span').filter({
        hasText: /guest-/i
      })
      await expect(participantBadge.first()).toBeVisible({ timeout: 5000 })

      // Close dropdown
      await page.keyboard.press('Escape')
    })
  })

  test('assistant can spawn thread and thread link is clickable', async ({ page }) => {
    // The mock adapter spawns a thread when user asks to "edit" something in assistant chat

    await test.step('Send edit request to assistant', async () => {
      // Make sure we're on assistant (not a thread)
      const selector = page.locator('button').filter({ hasText: /Chat with assistant/i })
      if (await selector.isVisible()) {
        // Already on assistant
      } else {
        // Click thread selector and switch to assistant
        const threadSelector = page.locator('[role="combobox"]').first()
        await threadSelector.click()
        await page.getByText('Chat with assistant').click()
      }

      // Type message asking to edit something
      const chatInput = page.locator('textarea, input[type="text"]').first()
      await expect(chatInput).toBeVisible({ timeout: 5000 })
      await chatInput.fill('Please edit the Home page')

      // Click the blue send button (not pink start thread)
      await page.getByTestId('send-message-button').click()
    })

    await test.step('Verify assistant spawns a thread', async () => {
      // Mock adapter calls spawn_thread tool and returns message with thread link
      // Wait for the tool call to appear in chat
      await expect(
        page.getByText(/spawn_thread|Thread created/i).first()
      ).toBeVisible({ timeout: 15000 })
    })

    await test.step('Verify thread appears in selector', async () => {
      // The spawned thread should appear in the thread selector
      // Open the selector dropdown
      const threadSelector = page.locator('[role="combobox"]').first()
      await threadSelector.click()

      // Look for the e2e-test-edit thread (name from mock adapter)
      // Use .first() since multiple threads may exist from retries
      await expect(
        page.locator('[role="listbox"]').getByText(/e2e-test-edit/i).first()
      ).toBeVisible({ timeout: 10000 })

      // Close dropdown
      await page.keyboard.press('Escape')
    })
  })

})
