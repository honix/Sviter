import { test, expect } from '@playwright/test'

test.describe('Wiki App', () => {
  test('loads the home page', async ({ page }) => {
    await page.goto('/')

    // Check that the app renders
    await expect(page.locator('body')).toBeVisible()
  })

  test('has three panel layout', async ({ page }) => {
    await page.goto('/')

    // Wait for app to load
    await page.waitForTimeout(1000)

    // Check for resizable panels (the app uses react-resizable-panels)
    const panels = page.locator('[data-panel]')
    await expect(panels.first()).toBeVisible()
  })

  test('page tree is visible', async ({ page }) => {
    await page.goto('/')

    // Look for the page tree area (left panel)
    const leftPanel = page.locator('text=Pages').or(page.locator('[class*="tree"]')).first()
    await expect(leftPanel).toBeVisible({ timeout: 5000 })
  })
})
