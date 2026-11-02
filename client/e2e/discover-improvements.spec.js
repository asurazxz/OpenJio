import { test, expect } from '@playwright/test'

test('Discover starts with an actionable map and keeps interest filters behind a control', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible()
  const filters = page.getByRole('button', { name: /^Filters/ })
  await expect(filters).toBeVisible()
  await expect(page.getByRole('group', { name: 'Interests', exact: true })).toBeHidden()
  await filters.click()
  await page.getByRole('group', { name: 'Interests', exact: true }).getByRole('button', { name: 'Arts', exact: true }).click()
  await expect(filters).toContainText('1')
  await filters.click()
  await expect(page.getByRole('group', { name: 'Interests', exact: true })).toBeHidden()
  // Closing the panel keeps Arts active; clear it before searching for a Museums-only listing.
  await page.getByRole('button', { name: 'Remove Arts filter', exact: true }).click()
  await expect(filters).toHaveText('Filters')
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Peranakan Museum')
  // Live data can add nearby matches that merge into a cluster bubble; target a single pin.
  const marker = page.locator('.leaflet-marker-icon:not(.oj-cluster)').first()
  await expect(marker).toBeVisible()
  await marker.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Plan your visit' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add to a plan', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('Discover view and filters survive a reload and cards remain usable', async ({ page }) => {
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  await page.getByLabel('Area', { exact: true }).selectOption('bugis')
  await expect(page).toHaveURL(/view=cards/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Area', { exact: true })).toHaveValue('bugis')
  await expect(page.locator('.cards article').first()).toBeVisible()
  await expect(page.locator('.map-col')).toBeHidden()
})

test('Discover caps map pins at 30 and pages Cards 24 at a time for a large catalogue', async ({ page }) => {
  // About 80 OpenStreetMap places around Bugis. The catalogue endpoint is routed so the fixture is ready
  // for it; the client only reads listings from its own data today.
  const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '21:00']]]))
  const places = Array.from({ length: 80 }, (_, i) => ({
    id: `osm-bugis-${i + 1}`, type: 'place', kind: i % 2 ? 'meal' : 'activity',
    title: `Bugis OSM place ${i + 1}`, summary: 'Mapped on OpenStreetMap.', interests: [i % 3 ? 'food' : 'arts'],
    area: 'bugis', address: `${i + 1} Bugis Street, Singapore`,
    lat: 1.3 + ((i * 37) % 60) / 4000, lng: 103.855 + ((i * 53) % 60) / 4000,
    durationMins: 60, priceLevel: 1, priceText: 'Price not stated', openingHours: hours,
    source: { kind: 'osm', name: 'OpenStreetMap', url: null, retrievedAt: '2026-10-29T10:00:00+08:00', verifiedAt: '2026-10-29T10:00:00+08:00' },
    status: 'published', routeReady: false, reviewStatus: 'manual-view-only', unknownFields: [],
  }))
  await page.route('**/api/places/catalogue*', route => route.fulfill({ status: 200, json: places }))
  await page.goto('/discover')
  await expect(page.getByRole('region', { name: 'Map', exact: true })).toBeVisible()
  await expect(page.getByText(/^Showing 30 of \d+ — filter by area or type to narrow it down$/)).toBeVisible()
  // Each pin or bubble is one DOM marker, so at most 30 can be on screen.
  await expect.poll(() => page.locator('.leaflet-marker-icon').count()).toBeLessThanOrEqual(30)
  await expect.poll(() => page.locator('.leaflet-marker-icon').count()).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  const cards = page.locator('.cards > li')
  await expect(cards).toHaveCount(24)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(cards).toHaveCount(48)
})

for (const [name, path] of [['Discover', '/discover'], ['Open jios', '/discover?type=hangout']]) {
  test(`${name} gives the map full width and opens the selected pin details`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
    const map = page.getByRole('region', { name: 'Map', exact: true })
    await expect(map).toBeVisible()
    await expect(page.locator('.list-col')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Map view', exact: true })).toHaveText('Map')
    await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toHaveText('Cards')
    const mapBox = await map.boundingBox()
    const filtersBox = await page.locator('.filters').boundingBox()
    expect(Math.abs(mapBox.width - filtersBox.width)).toBeLessThan(4)
    // A unique search avoids targeting a marker underneath another venue pin.
    if (name === 'Discover') await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Peranakan Museum')
    // Nearby pins can merge into cluster bubbles (class oj-cluster); target single pins only.
    const marker = page.locator('.leaflet-marker-icon:not(.oj-cluster)').first()
    await expect(marker).toBeVisible()
    await marker.hover()
    const preview = page.locator('.map-pin-preview')
    await expect(preview).toBeVisible()
    const title = await preview.locator('.map-preview-title').innerText()
    await expect(marker).toHaveAccessibleName(title)
    await expect(preview.locator('.map-preview-location')).not.toBeEmpty()
    if (name === 'Open jios') await expect(preview).toContainText('spots left')
    await marker.click()
    const detail = page.getByRole('dialog', { name: title, exact: true })
    await expect(detail).toBeVisible()
    await expect(detail.getByRole('heading', { name: 'Plan your visit', exact: true })).toBeVisible()
    await expect(detail.getByRole('heading', { name: "Where you'll go", exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await page.getByRole('button', { name: 'Cards view', exact: true }).click()
    await expect(page.locator('.cards article').first()).toBeVisible()
    await expect(map).toBeHidden()
  })

  test(`${name} supports zooming in and out with the mouse wheel`, async ({ page }) => {
    await page.goto(path)
    const map = page.getByRole('region', { name: 'Map', exact: true })
    await expect(map).toBeVisible()
    await map.scrollIntoViewIfNeeded()
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible()
    const zoom = () => map.locator('.leaflet-tile-container').evaluateAll(levels => {
      const current = levels.toSorted((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0]
      return Number(new URL(current.querySelector('img').src).pathname.split('/').at(-3))
    })
    const before = await zoom()
    const box = await map.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -240)
    await expect.poll(zoom).toBeGreaterThan(before)
    // Wait for Leaflet's zoom animation to finish before reversing direction.
    await expect(map).not.toHaveClass(/leaflet-zoom-anim/)
    const zoomed = await zoom()
    await page.mouse.wheel(0, 240)
    await expect.poll(zoom).toBeLessThan(zoomed)
  })
}
