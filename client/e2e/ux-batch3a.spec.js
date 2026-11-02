import { test, expect } from '@playwright/test'

async function skipTour(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
}
async function signInAs(page, name) {
  await skipTour(page)
  await page.goto('/signin')
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

test('signing in from Suggest for a jio reopens the dialog for that listing', async ({ page }) => {
  await skipTour(page)
  await page.goto('/discover')
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Peranakan Museum')
  await page.locator('.leaflet-marker-icon:not(.oj-cluster)').first().click()
  const dock = page.getByRole('region', { name: /^Selected: / })
  const title = (await dock.getByRole('heading').first().textContent()).trim()
  await dock.getByRole('button', { name: 'Suggest for a jio', exact: true }).click()
  await expect(page).toHaveURL(/\/signin\?.*next=/)
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest for a jio' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(title)
  await expect(page).not.toHaveURL(/add=/)
  // Nothing was saved on the way.
  await expect(page.getByText(/^Suggested for /)).toHaveCount(0)
})

test('an unknown ?add= listing drops the param with a short notice', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/discover?add=does-not-exist')
  await expect(page.getByText('That listing is no longer available')).toBeVisible()
  await expect(page).not.toHaveURL(/add=/)
})

test('turning off interest ranking survives leaving Discover and coming back', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/discover')
  await expect(page.getByRole('status').filter({ hasText: 'best match for your interests' })).toBeVisible()
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByLabel('Use my interests to rank results').uncheck()
  await expect(page).toHaveURL(/rank=plain/)
  await expect(page.getByRole('status').filter({ hasText: 'not personalised' })).toBeVisible()
  await page.evaluate(() => document.querySelector('a[href="/"]').click())
  await expect(page).toHaveURL(/\/$/)
  await page.goBack()
  await page.getByRole('button', { name: /^Filters/ }).click()
  await expect(page.getByLabel('Use my interests to rank results')).not.toBeChecked()
})

test('Profile interest chips name their level in words', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/profile')
  const group = page.getByRole('group', { name: 'Your interests' })
  const chip = group.getByRole('button').first()
  for (let n = 0; n < 3 && !(await chip.getAttribute('aria-label')).includes('not set'); n++) await chip.click()
  await expect(chip).toHaveAttribute('aria-label', /not set/)
  await chip.click()
  await expect(chip).toContainText('Like')
  await expect(chip).toHaveAttribute('aria-label', /: like$/)
  await chip.click()
  await expect(chip).toContainText('Love')
  await expect(page.getByText('Click once for Like')).toBeVisible()
  await expect(page.getByText(/near.*in Discover/)).toBeVisible()
})

test('How it works ends with a next step, signed out and signed in', async ({ page }) => {
  await skipTour(page)
  await page.goto('/how')
  const cta = page.getByRole('region', { name: 'Try it with your own group' })
  await expect(cta.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', /mode=signup/)
  await expect(cta.getByRole('link', { name: 'Explore the map' })).toBeVisible()
  await signInAs(page, 'Mei Lin')
  await page.goto('/how')
  const cta2 = page.getByRole('region', { name: 'Ready to plan one?' })
  await expect(cta2.getByRole('link', { name: 'Create a jio' })).toHaveAttribute('href', '/new')
  await expect(cta2.getByRole('link', { name: 'Back to Home' })).toBeVisible()
})

test('Discover lines up with Home at 1280 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await signInAs(page, 'Mei Lin')
  const homeX = await page.getByRole('heading', { level: 1 }).evaluate((el) => el.getBoundingClientRect().left)
  await page.goto('/discover')
  const h1 = page.getByRole('heading', { level: 1, name: 'Discover' })
  await expect(h1).toBeVisible()
  const discoverX = await h1.evaluate((el) => el.getBoundingClientRect().left)
  expect(Math.abs(discoverX - homeX)).toBeLessThanOrEqual(2)
  const filterX = await page.locator('.filters').evaluate((el) => el.getBoundingClientRect().left)
  expect(Math.abs(filterX - homeX)).toBeLessThanOrEqual(2)
})

test('the landing hero states the coordination promise', async ({ page }) => {
  await skipTour(page)
  await page.goto('/')
  await expect(page.getByText(/One link for everyone’s free times, votes and the final plan/)).toBeVisible()
})
