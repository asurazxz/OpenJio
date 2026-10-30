import { test, expect } from '@playwright/test'

const searchedPlace = {
  id: 'provider-lantern-1',
  name: 'Lantern Café Test Venue',
  address: '10 Market Street, Singapore',
  lat: 1.2842,
  lng: 103.8511,
}

async function signInAsPriya(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Priya Raman/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

async function openAddStop(page) {
  await signInAsPriya(page)
  await page.goto('/h/h-hawker')
  await expect(page.getByRole('heading', { name: 'Sunday Chinatown wander' })).toBeVisible()
  await page.getByRole('button', { name: 'Add a stop', exact: true }).click()
  return page.getByRole('dialog', { name: 'Add a stop' })
}

async function mockSearch(page, handler) {
  await page.route('**/api/places/search*', handler)
}

async function mockDetails(page, response = searchedPlace) {
  await page.route('**/api/places/details*', route => route.fulfill({ status: 200, json: response }))
}

async function assertRouteHas(page, title) {
  await expect(page.locator('.tl-wrap .stop-title').filter({ hasText: title })).toBeVisible()
}

test('search place, check it, add it to the route, reload, and keep it out of Discover', async ({ page }) => {
  await mockSearch(page, route => route.fulfill({ status: 200, json: [searchedPlace] }))
  await mockDetails(page, { ...searchedPlace, website: 'https://lantern.example/', openingHoursText: 'Mo-Su 09:00-22:00' })
  const dialog = await openAddStop(page)
  await dialog.getByRole('button', { name: 'Find a place', exact: true }).click()
  await dialog.getByLabel('Find a café, attraction or other place').fill('Lantern Café')
  const result = dialog.getByRole('button', { name: /Lantern Café Test Venue/ })
  await expect(result).toBeVisible()
  await result.click()

  await expect(dialog.getByLabel('Place name')).toHaveValue('Lantern Café Test Venue')
  await dialog.getByLabel('Visit duration (minutes)').fill('45')
  await dialog.getByLabel('Stop type').selectOption('activity')
  await dialog.getByRole('button', { name: 'Check fit', exact: true }).click()
  await expect(dialog.locator('.place-details [role="status"]')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add to route', exact: true }).click()

  await expect(dialog).toBeHidden()
  await assertRouteHas(page, 'Lantern Café Test Venue')
  await page.reload()
  await assertRouteHas(page, 'Lantern Café Test Venue')

  await page.getByRole('button', { name: 'Add a stop', exact: true }).click()
  const discoverDialog = page.getByRole('dialog', { name: 'Add a stop' })
  await discoverDialog.getByRole('button', { name: 'From Discover', exact: true }).click()
  await discoverDialog.getByRole('textbox', { name: 'Search places' }).fill('Lantern Café Test Venue')
  await expect(discoverDialog.locator('.add-list .alt-title')).toHaveCount(0)
})

test('provider search error offers manual entry and the custom place can still be added', async ({ page }) => {
  await mockSearch(page, route => route.fulfill({ status: 503, json: { message: 'Place search key is unavailable.' } }))
  const dialog = await openAddStop(page)
  await dialog.getByRole('button', { name: 'Find a place', exact: true }).click()
  await dialog.getByLabel('Find a café, attraction or other place').fill('Manual fallback venue')
  await expect(dialog.getByRole('alert')).toContainText('Place search key is unavailable.')

  await dialog.getByRole('button', { name: 'Enter manually', exact: true }).click()
  await dialog.getByLabel('Place name').fill('Manual fallback venue')
  await dialog.getByLabel('Address').fill('22 River Valley Road, Singapore')
  await dialog.getByLabel('Latitude').fill('1.2921')
  await dialog.getByLabel('Longitude').fill('103.8422')
  await dialog.getByLabel('Visit duration (minutes)').fill('60')
  await dialog.getByRole('button', { name: 'Add to route', exact: true }).click()

  await expect(dialog).toBeHidden()
  await assertRouteHas(page, 'Manual fallback venue')
})

test('details lookup failure retains search coordinates for adding the place', async ({ page }) => {
  await mockSearch(page, route => route.fulfill({ status: 200, json: [searchedPlace] }))
  await page.route('**/api/places/details*', route => route.fulfill({ status: 502, json: { message: 'Place details are unavailable.' } }))
  const dialog = await openAddStop(page)
  await dialog.getByRole('button', { name: 'Find a place', exact: true }).click()
  await dialog.getByLabel('Find a café, attraction or other place').fill('Lantern Café')
  await dialog.getByRole('button', { name: /Lantern Café Test Venue/ }).click()

  await expect(dialog.getByRole('alert')).toContainText('The search location is still available below.')
  await expect(dialog.getByLabel('Place name')).toHaveValue('Lantern Café Test Venue')
  await dialog.getByRole('button', { name: 'Add to route', exact: true }).click()
  await expect(dialog).toBeHidden()
  await assertRouteHas(page, 'Lantern Café Test Venue')
})

test('stale place search responses do not replace newer results', async ({ page }) => {
  let releaseOld
  const oldResponseHeld = new Promise(resolve => { releaseOld = resolve })
  await mockSearch(page, async route => {
    const query = new URL(route.request().url()).searchParams.get('q')
    if (query === 'Old Venue') await oldResponseHeld
    const place = { ...searchedPlace, id: `provider-${query}`, name: `${query} Result` }
    try { await route.fulfill({ status: 200, json: [place] }) } catch { /* the aborted request may already be gone */ }
  })
  const dialog = await openAddStop(page)
  await dialog.getByRole('button', { name: 'Find a place', exact: true }).click()
  const search = dialog.getByLabel('Find a café, attraction or other place')
  const oldRequest = page.waitForRequest(request => request.url().includes('/api/places/search') && new URL(request.url()).searchParams.get('q') === 'Old Venue')
  await search.fill('Old Venue')
  await oldRequest
  await search.fill('New Venue')
  await expect(dialog.getByRole('button', { name: 'New Venue Result' })).toBeVisible()
  releaseOld()
  await expect(dialog.getByRole('button', { name: 'Old Venue Result' })).toHaveCount(0)
})

test('manual address lookup ignores results for an address that has since changed', async ({ page }) => {
  let releaseOld
  const held = new Promise(resolve => { releaseOld = resolve })
  await page.route('**/api/geocode*', async route => {
    const old = new URL(route.request().url()).searchParams.get('q') === 'Old address'
    if (old) await held
    await route.fulfill({ json: [{ name: old ? 'Old result' : 'New result', address: old ? 'Old location, Singapore' : 'New location, Singapore', lat: 1.3, lng: 103.85 }] })
  })
  const dialog = await openAddStop(page)
  await dialog.getByRole('button', { name: 'Enter manually', exact: true }).click()
  await dialog.getByLabel('Address').fill('Old address')
  const request = page.waitForRequest(req => req.url().includes('/api/geocode'))
  await dialog.getByRole('button', { name: 'Find address with OneMap' }).click()
  await request
  await dialog.getByLabel('Address').fill('New address')
  const oldResponse = page.waitForResponse(response => response.url().includes('/api/geocode') && new URL(response.url()).searchParams.get('q') === 'Old address')
  releaseOld()
  await (await oldResponse).finished()
  await expect(dialog.getByRole('button', { name: 'Old location, Singapore' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Find address with OneMap' }).click()
  await dialog.getByRole('button', { name: 'New location, Singapore' }).click()
  await expect(dialog.getByLabel('Address')).toHaveValue('New location, Singapore')
})
