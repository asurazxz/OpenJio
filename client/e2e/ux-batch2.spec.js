import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

test('the people pill counts members and the header Invite button copies the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-catchup')
  const pill = page.getByRole('button', { name: /^People/ })
  await expect(pill).toContainText('members')
  await expect(pill).not.toContainText('going')
  await page.getByRole('button', { name: /^Invite/ }).click()
  await expect(page.getByText('Invite link copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/j\/catchup1$/)
  await pill.click()
  await expect(page.getByText(/Anyone with this link can see the outing details/)).toBeVisible()
})

test('an unknown or unavailable ?tab= falls back to the default tab', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-catchup?tab=nonsense')
  await expect(page.getByRole('tablist', { name: 'Hangout sections' }).getByRole('tab', { selected: true })).toHaveCount(1)
  await expect(page).not.toHaveURL(/nonsense/)
  await page.goto('/h/h-catchup?tab=day')
  await expect(page.getByRole('tablist', { name: 'Hangout sections' }).getByRole('tab', { selected: true })).toHaveCount(1)
  await expect(page).not.toHaveURL(/tab=day/)
})

test('Discover suggests a place for a jio rather than adding to a plan', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/discover')
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Peranakan Museum')
  const marker = page.locator('.leaflet-marker-icon:not(.oj-cluster)').first()
  await marker.click()
  await page.getByRole('region', { name: /^Selected: / }).getByRole('button', { name: 'Suggest for a jio', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest for a jio' })
  await expect(dialog).toContainText('The host can add it to the plan')
  await dialog.getByRole('button', { name: 'Suggest', exact: true }).click()
  await expect(page.getByText(/^Suggested for /)).toBeVisible()
})

test('editing the start search text keeps the confirmed start point', async ({ page }) => {
  await page.route('**/api/places/search*', (route) => route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
    contentType: 'application/json',
    body: JSON.stringify([{ id: 'jewel', name: 'Jewel Changi Airport', address: '78 Airport Blvd', lat: 1.3602, lng: 103.9894 }]),
  }))
  await signInAs(page, 'Mei Lin')
  await page.goto('/new?mode=solo')
  await page.getByLabel('Name', { exact: true }).fill('Start test')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Start point').fill('Jewel')
  await page.getByRole('option', { name: /Jewel Changi Airport/ }).click()
  const chosen = page.locator('.start-chosen')
  await expect(chosen).toContainText('Jewel Changi Airport')
  await page.getByLabel('Start point').fill('Tamp')
  await expect(chosen).toContainText('Jewel Changi Airport')
  await chosen.getByRole('button', { name: /Clear start point/ }).click()
  await expect(chosen).toContainText('City Hall')
})
