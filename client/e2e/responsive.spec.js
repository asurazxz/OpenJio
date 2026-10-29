import { test, expect } from '@playwright/test'

// External map tile, weather and font hosts may be unreachable from the test machine.
const IGNORED_ERRORS = /onemap|data\.gov\.sg|Failed to load resource/i

async function signInAs(page, name) {
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

async function checkRoutes(page, routes) {
  const errors = []
  const onConsole = (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  }
  const onPageError = (err) => errors.push(err.message)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  await signInAs(page, 'Mei Lin')

  for (const route of routes) {
    await page.goto(route)
    // Every route renders an h1 once its data has loaded.
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(innerWidth)
  }

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  expect(errors.filter((e) => !IGNORED_ERRORS.test(e))).toEqual([])
}

test('pages fit the viewport, have one main landmark and log no errors', async ({ page }) => {
  await checkRoutes(page, ['/', '/new', '/h/h-catchup', '/how'])
})

// Discover is checked on its own: it mounts a Leaflet map after data loads.
test('/discover fits the viewport and logs no errors', async ({ page }) => {
  await checkRoutes(page, ['/discover'])
})
