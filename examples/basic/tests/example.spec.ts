import { test, expect } from '@testingbot/playwright'

test('opens a public site', async ({ page }) => {
  await page.goto('https://example.com/')
  await expect(page).toHaveTitle(/Example Domain/)
})

test('opens localhost through the tunnel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Served from localhost')
})
