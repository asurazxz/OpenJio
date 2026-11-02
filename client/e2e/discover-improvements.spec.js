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
  // A pin opens a preview card on the map; Details opens the full dialog.
  const preview = page.getByRole('region', { name: /^Selected: / })
  await expect(preview).toContainText('Peranakan Museum')
  await preview.getByRole('button', { name: 'Details', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Plan your visit' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Suggest for a jio', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('Discover view and filters survive a reload and cards remain usable', async ({ page }) => {
  await page.goto('/discover')
  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  await page.getByRole('button', { name: /^Filters/ }).click()
  await page.getByLabel('Area', { exact: true }).selectOption('bugis')
  await page.getByLabel('When', { exact: true }).selectOption('tonight')
  await page.getByRole('button', { name: 'Deals', exact: true }).click()
  await expect(page).toHaveURL(/view=cards/)
  await expect(page).toHaveURL(/when=tonight/)
  await expect(page).toHaveURL(/type=deal/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('When', { exact: true })).toHaveValue('tonight')
  await expect(page.getByRole('button', { name: 'Deals', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Remove Bugis area filter' })).toBeVisible()
  await page.getByRole('button', { name: /^Filters/ }).click()
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
  // The caption and the list count the same pins: the cap is 30, and the list shows exactly the pins.
  await expect(page.locator('.map-cap')).toContainText(/Map shows 30 of \d+( in this area)?\./)
  await expect(page.getByLabel('Results in this area')).toContainText(/Top 30 of \d+ in this area/)
  // Each pin or bubble is one DOM marker, so at most 30 can be on screen.
  await expect.poll(() => page.locator('.leaflet-marker-icon').count()).toBeLessThanOrEqual(30)
  await expect.poll(() => page.locator('.leaflet-marker-icon').count()).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Cards view', exact: true }).click()
  const cards = page.locator('.cards > li')
  await expect(cards).toHaveCount(24)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(cards).toHaveCount(48)
})

for (const [name, path] of [['Discover', '/discover'], ['Open Jios', '/discover?type=hangout&view=map']]) {
  test(`${name} opens a preview card from a pin, with Details and Suggest for a jio`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
    const map = page.getByRole('region', { name: 'Map', exact: true })
    await expect(map).toBeVisible()
    await expect(page.locator('.list-col')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Map view', exact: true })).toHaveText('Map')
    await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toHaveText('Cards')
    // A unique search avoids targeting a marker underneath another venue pin.
    if (name === 'Discover') await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Peranakan Museum')
    // Nearby pins can merge into cluster bubbles (class oj-cluster); target single pins only.
    const marker = page.locator('.leaflet-marker-icon:not(.oj-cluster)').first()
    await expect(marker).toBeVisible()
    const title = await marker.getAttribute('aria-label')
    await marker.click()
    const preview = page.getByRole('region', { name: `Selected: ${title}`, exact: true })
    await expect(preview).toBeVisible()
    if (name === 'Open Jios') {
      await expect(preview).toContainText(/\d+ spots? left|Full/)
      await expect(preview.getByRole('button', { name: 'View', exact: true })).toBeVisible()
    } else {
      await expect(preview.getByRole('button', { name: 'Suggest for a jio', exact: true })).toBeVisible()
    }
    // Esc closes the card.
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()
    await marker.click()
    await preview.getByRole('button', { name: 'Details', exact: true }).click()
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

test('Open Jios opens on Cards with its own header and a way back to Discover', async ({ page }) => {
  await page.goto('/discover?type=hangout')
  await expect(page.getByRole('heading', { level: 1, name: 'Open Jios', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cards view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.map-col')).toBeHidden()
  await expect(page.getByRole('group', { name: 'Type', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Host an Open Jio', exact: true })).toHaveAttribute('href', '/new?mode=public')
  const card = page.locator('.cards article').first()
  await expect(card).toContainText(/\d+ of \d+ spots left|Full/)
  await expect(card).toContainText('hosting')
  await page.getByRole('link', { name: 'Browse all of Discover', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Discover', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Map view', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('pins are labelled pills coloured by type, and clusters read +N', async ({ page }) => {
  await page.goto('/discover?type=deal')
  await expect(page.locator('.map-pill').first()).toBeVisible()
  const pills = await page.locator('.map-pill').evaluateAll((els) => els.map((el) => ({ tone: el.className, text: el.textContent.trim(), icon: !!el.querySelector('svg') })))
  expect(pills.every((p) => p.icon && /tone-mustard/.test(p.tone))).toBe(true)
  // A deal says its offer on the pin itself.
  expect(pills.every((p) => /^(1-for-1|\d+% off|\$\d+ off|Deal)$/.test(p.text))).toBe(true)
  const cluster = page.locator('.oj-cluster-pill').first()
  if (await cluster.count()) await expect(cluster).toHaveText(/^\+\d+$/)
})

test('the in-view list follows Search this area, and hovering a row lights its pin', async ({ page, viewport }) => {
  test.skip(viewport.width < 992, 'The side list is desktop only')
  await page.goto('/discover')
  const rail = page.getByLabel('Results in this area')
  await expect(rail.locator('li').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search this area' })).toHaveCount(0)
  // Hovering a row emphasises the matching pin.
  // The best match can sit inside a cluster, so pick the row of a pin that is drawn.
  // Pins draw after the page fades in, so wait for one that is also in the short list.
  let title
  await expect.poll(async () => {
    const drawn = await page.locator('.leaflet-marker-icon:not(.oj-cluster)').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    const listed = await rail.locator('li .title').allTextContents()
    title = drawn.find((t) => listed.includes(t))
    return Boolean(title) && listed.length <= 12
  }).toBe(true)
  const row = rail.locator('li button').filter({ has: page.locator('.title', { hasText: title }) }).first()
  await row.hover()
  await expect(page.locator(`.leaflet-marker-icon[aria-label="${title}"] .map-pill.hot`)).toHaveCount(1)
  // Panning does not reload the list; it offers "Search this area".
  const before = await rail.locator('li').count()
  const box = await page.locator('.stage').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy + 80)
  await page.mouse.down()
  await page.mouse.move(cx - 260, cy + 80, { steps: 8 })
  await page.mouse.up()
  const search = page.getByRole('button', { name: 'Search this area' })
  await expect(search).toBeVisible()
  expect(await rail.locator('li').count()).toBe(before)
  await search.click()
  await expect(search).toBeHidden()
  await expect(rail.getByText(/in this area/).first()).toBeVisible()
})

test('selecting a row opens the preview card, which closes with the close button', async ({ page, viewport }) => {
  test.skip(viewport.width < 992, 'The side list is desktop only')
  await page.goto('/discover')
  const row = page.getByLabel('Results in this area').locator('li button').first()
  const title = await row.locator('.title').innerText()
  await row.click()
  const preview = page.getByRole('region', { name: `Selected: ${title}`, exact: true })
  await expect(preview).toBeVisible()
  await expect(row).toHaveAttribute('aria-current', 'true')
  await preview.getByRole('button', { name: 'Close preview' }).click()
  await expect(preview).toBeHidden()
})

test('area shortcuts move the map, and Near me explains a refusal without moving anything', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1, message: 'denied' })
  })
  await page.goto('/discover')
  const map = page.getByRole('region', { name: 'Map', exact: true })
  await expect(map).toBeVisible()
  await page.getByRole('button', { name: 'Chinatown', exact: true }).click()
  // After the fly-in the list is searched for the new view, so no "Search this area" prompt is left.
  await expect(page.getByRole('button', { name: 'Search this area' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Near me', exact: true }).click()
  await expect(page.getByText(/Location is switched off for this site/)).toBeVisible()
})

test('The When menu filters by time and keep the URL in step', async ({ page }) => {
  await page.goto('/discover')
  await page.getByLabel('When', { exact: true }).selectOption('tonight')
  await expect(page).toHaveURL(/when=tonight/)
  await expect(page.getByRole('status').filter({ hasText: /results/ })).toContainText('that fit tonight')
  await page.getByLabel('When', { exact: true }).selectOption('today')
  await expect(page).toHaveURL(/when=today/)
  await page.getByLabel('When', { exact: true }).selectOption('any')
  await expect(page).not.toHaveURL(/when=/)
})
