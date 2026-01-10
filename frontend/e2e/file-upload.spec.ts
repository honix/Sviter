import { test, expect } from '@playwright/test'

/**
 * E2E File Upload Test
 *
 * Tests that uploaded files appear in the UI without page reload.
 * Uses mock LLM (LLM_PROVIDER=mock) - no real API calls.
 */

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/')

    // Wait for the WebSocket connection to establish
    await expect(page.locator('[data-panel]').first()).toBeVisible({ timeout: 15000 })

    // Wait for page tree to load - should see Home from test fixtures
    await expect(page.getByTestId('page-Home')).toBeVisible({ timeout: 10000 })
  })

  test('uploaded file appears in UI without reload and content is viewable', async ({ page }) => {
    const testFileName = 'test-upload.txt'
    const testFileContent = 'Hello from E2E test!'

    // Step 1: Upload a file
    await test.step('Upload test file via hidden input', async () => {
      // Find the hidden file input (it's inside the header section with the upload button)
      const fileInput = page.locator('input[type="file"]')
      await expect(fileInput).toBeAttached()

      // Create a test file and upload it
      await fileInput.setInputFiles({
        name: testFileName,
        mimeType: 'text/plain',
        buffer: Buffer.from(testFileContent)
      })

      // Wait for upload to complete - the spinner should disappear
      // First wait a bit for upload to start
      await page.waitForTimeout(500)

      // Wait for any loading state to finish
      await expect(page.locator('button:has(svg.animate-spin)')).not.toBeVisible({ timeout: 10000 })
    })

    // Step 2: Verify uploads folder appears in the tree without reload
    await test.step('Verify uploads folder appears without reload', async () => {
      // The uploads folder should appear in the tree
      const uploadsFolder = page.getByTestId('folder-uploads')
      await expect(uploadsFolder).toBeVisible({ timeout: 10000 })
    })

    // Step 3: Expand uploads folder and find the file
    await test.step('Expand uploads folder and find uploaded file', async () => {
      // Click to expand the uploads folder
      const uploadsFolder = page.getByTestId('folder-uploads')
      await uploadsFolder.click()

      // Wait for the uploaded file to appear
      const uploadedFile = page.getByTestId('page-uploads-test-upload')
      await expect(uploadedFile).toBeVisible({ timeout: 10000 })
    })

    // Step 4: Click on the file to view its contents
    await test.step('Click file and verify contents', async () => {
      // Click on the uploaded file
      const uploadedFile = page.getByTestId('page-uploads-test-upload')
      await uploadedFile.click()

      // Verify the file content is displayed
      // For text files, the content should be shown in the center panel
      await expect(page.getByText(testFileContent)).toBeVisible({ timeout: 10000 })
    })
  })
})
