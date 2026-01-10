import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test('should have theme toggle button visible', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Check for theme toggle button with Settings icon
    const themeToggle = page.getByTestId('theme-toggle-button');
    await expect(themeToggle).toBeVisible();
  });

  test('should switch to dark theme', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Initial state should be light theme
    const html = page.locator('html');
    await expect(html).toHaveClass(/light/);

    // Click theme toggle button
    const themeToggle = page.getByTestId('theme-toggle-button');
    await themeToggle.click();

    // Click dark theme option
    const darkOption = page.getByTestId('theme-option-dark');
    await darkOption.click();

    // Verify dark theme is applied
    await expect(html).toHaveClass(/dark/);

    // Verify localStorage is updated
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('dark');
  });

  test('should switch to sepia theme', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Click theme toggle button
    const themeToggle = page.getByTestId('theme-toggle-button');
    await themeToggle.click();

    // Click sepia theme option
    const sepiaOption = page.getByTestId('theme-option-theme-sepia');
    await sepiaOption.click();

    // Verify sepia theme is applied (class is 'theme-sepia' to avoid Tailwind's sepia filter utility)
    const html = page.locator('html');
    await expect(html).toHaveClass(/theme-sepia/);

    // Verify localStorage is updated
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('theme-sepia');
  });

  test('should switch back to light theme', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Switch to dark first
    const themeToggle = page.getByTestId('theme-toggle-button');
    await themeToggle.click();
    const darkOption = page.getByTestId('theme-option-dark');
    await darkOption.click();

    // Verify dark is applied
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    // Switch back to light
    await themeToggle.click();
    const lightOption = page.getByTestId('theme-option-light');
    await lightOption.click();

    // Verify light theme is applied
    await expect(html).toHaveClass(/light/);

    // Verify localStorage is updated
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(theme).toBe('light');
  });

  test('should persist theme selection across page reloads', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Switch to dark theme
    const themeToggle = page.getByTestId('theme-toggle-button');
    await themeToggle.click();
    const darkOption = page.getByTestId('theme-option-dark');
    await darkOption.click();

    // Verify dark theme is applied
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    // Reload the page
    await page.reload();

    // Wait for app to load again
    await page.waitForTimeout(1000);

    // Verify dark theme is still applied
    await expect(html).toHaveClass(/dark/);
  });

  test('should show checkmark on current theme', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Open theme toggle menu
    const themeToggle = page.getByTestId('theme-toggle-button');
    await themeToggle.click();

    // Light should have checkmark (default theme)
    const lightOption = page.getByTestId('theme-option-light');
    await expect(lightOption).toContainText('✓');

    // Close menu
    await page.keyboard.press('Escape');

    // Switch to dark
    await themeToggle.click();
    const darkOption = page.getByTestId('theme-option-dark');
    await darkOption.click();

    // Open menu again
    await themeToggle.click();

    // Dark should now have checkmark
    await expect(darkOption).toContainText('✓');
  });
});
