import { test, expect } from '@playwright/test'
import * as path from 'path'

/**
 * Screenshot utility for debugging and validation.
 * Run with: make e2e-screenshot
 *
 * Screenshots saved to: frontend/test-results/screenshots/
 */

const screenshotDir = path.join(__dirname, '..', 'test-results', 'screenshots')

test.describe('Screenshot Capture', () => {
  test('capture app state', async ({ page }) => {
    await page.goto('/')

    // Wait for app to fully load
    await page.waitForTimeout(2000)
    await expect(page.getByRole('button', { name: /Home/i })).toBeVisible({ timeout: 10000 })

    // Full page screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'app-full.png'),
      fullPage: true
    })

    // Viewport screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'app-viewport.png')
    })

    console.log(`Screenshots saved to: ${screenshotDir}`)
  })

  test('capture all panels', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Left panel (page tree)
    const leftPanel = page.locator('[data-panel]').first()
    if (await leftPanel.isVisible()) {
      await leftPanel.screenshot({
        path: path.join(screenshotDir, 'panel-left.png')
      })
    }

    // Center panel (content)
    const centerPanel = page.locator('[data-panel]').nth(1)
    if (await centerPanel.isVisible()) {
      await centerPanel.screenshot({
        path: path.join(screenshotDir, 'panel-center.png')
      })
    }

    // Right panel (chat)
    const rightPanel = page.locator('[data-panel]').nth(2)
    if (await rightPanel.isVisible()) {
      await rightPanel.screenshot({
        path: path.join(screenshotDir, 'panel-right.png')
      })
    }

    console.log(`Panel screenshots saved to: ${screenshotDir}`)
  })

  test('capture after navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    // Click on a page in the tree
    const testPageButton = page.getByRole('button', { name: /TestPage/i })
    if (await testPageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await testPageButton.click()
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: path.join(screenshotDir, 'after-navigation.png'),
        fullPage: true
      })
    }
  })
})

test.describe('Debug Helpers', () => {
  test('capture DOM state', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Save HTML for debugging
    const html = await page.content()
    const fs = await import('fs')
    fs.writeFileSync(
      path.join(screenshotDir, 'page-dom.html'),
      html
    )

    // Log panel structure
    const panels = await page.locator('[data-panel]').all()
    console.log(`Found ${panels.length} panels`)

    // Take screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'debug-state.png')
    })
  })
})
