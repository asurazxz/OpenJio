import { test, expect } from '@playwright/test'

test('the app uses real accounts even with an old demo session in this browser', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('openjio:session', 'u-mei')
    sessionStorage.setItem('openjio:session', 'u-mei')
  })
  await page.goto('/signin')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByText('Who are you today?')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reset demo data' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('openjio:demo:v1'))).toBeNull()
  expect(errors).toEqual([])
})

test('Discover reads shared listings without fabricated catalogue entries', async ({ page }) => {
  const response = page.waitForResponse(r => r.url().includes('/api/app/listListings') && r.ok())
  await page.goto('/discover?view=cards')
  const { result } = await (await response).json()
  expect(Array.isArray(result)).toBe(true)
  expect(result.every(listing => listing.sample !== true)).toBe(true)
  await expect(page.getByText('OpenJio sample data', { exact: false })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('openjio:demo:v1'))).toBeNull()
})

test('missing backend config shows an account error and recovers when service returns', async ({ page }) => {
  await page.route('**/config.json', route => route.fulfill({ status: 503, body: '{}' }))
  await page.goto('/signin')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Unable to connect')
  await expect(page.getByText('Who are you today?')).toHaveCount(0)
  await page.unroute('**/config.json')
  await page.reload()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
