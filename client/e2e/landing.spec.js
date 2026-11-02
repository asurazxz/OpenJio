import { test, expect } from '@playwright/test'

test('public landing introduces OpenJio with a usable map and clear account entry', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: /From.*free this weekend.*see you there/ })).toBeVisible()
  // Signed-out visitors get the public links only; account pages are not linked.
  // The header links show from the tablet breakpoint up; phones rely on the hero links.
  const nav = page.locator('.app-header .main-nav')
  await expect(nav.locator('a')).toHaveText(['Discover', 'Open Jios', 'How it works'])
  if (page.viewportSize().width >= 768) await expect(nav).toBeVisible()
  else await expect(nav).toBeHidden()
  const start = page.locator('.landing-hero').getByRole('link', { name: 'Get started', exact: true })
  await expect(start).toBeVisible()
  const viewport = page.viewportSize()
  if (viewport.width >= 768) {
    const box = await start.boundingBox()
    expect(box.y + box.height).toBeLessThan(viewport.height)
  }
  await expect(page.getByRole('region', { name: 'Example outing map', exact: true })).toBeVisible()
  const marker = page.getByRole('button', { name: 'ArtScience Museum', exact: true })
  await marker.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('link', { name: 'See this place in Discover', exact: true })).toBeVisible()
  await expect(page.locator('.landing-map')).toContainText('6 Bayfront Avenue')
  await start.click()
  await expect(page).toHaveURL(/\/signin\?.*mode=signup/)
  await expect(page.getByText(/Demo accounts/)).toBeVisible()
})

test('account entry opens Home and returning signed-in visitors skip the landing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/')
  await page.locator('.landing-hero').getByRole('link', { name: 'Get started', exact: true }).click()
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get started', exact: true })).toHaveCount(0)
})

test('reduced-motion landing shows its finished outing and allows anonymous discovery', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const summary = page.getByRole('heading', { name: 'A Marina Bay jio.', exact: true })
  await expect(summary).toBeVisible()
  await expect(page.locator('.landing-itinerary')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.landing-map .pin').first()).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.checkpoint-card')).toHaveCount(0)
  await expect(page.locator('.journey-trace')).toHaveAttribute('stroke-dashoffset', '0')
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.landing-hero').getByRole('link', { name: 'Explore the map', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Discover', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Map', exact: true })).toBeVisible()
})

test('opening and closing an example stop preserves keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const stop = page.getByRole('button', { name: 'A little art', exact: true })
  await stop.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'ArtScience Museum', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Close place preview', exact: true }).click()
  await expect(stop).toBeFocused()
})

test('the route visits each checkpoint in order and can pause and replay', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  const checkpoint = page.locator('.checkpoint-card')
  await expect(checkpoint).toHaveAttribute('data-stop', '0')
  await expect(checkpoint).toContainText('ArtScience Museum')
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click()
  await expect(checkpoint).toHaveCSS('opacity', '1')
  const trace = await page.locator('.journey-trace').getAttribute('stroke-dashoffset')
  await page.clock.runFor(1500)
  await expect(checkpoint).toHaveAttribute('data-stop', '0')
  await expect(page.locator('.journey-trace')).toHaveAttribute('stroke-dashoffset', trace)
  await page.getByRole('button', { name: 'Resume animation', exact: true }).click()
  await page.clock.runFor(4200)
  await expect(checkpoint).toHaveAttribute('data-stop', '1')
  await expect(checkpoint).toContainText('Gardens by the Bay')
  await page.clock.runFor(4200)
  await expect(checkpoint).toHaveAttribute('data-stop', '2')
  await expect(checkpoint).toContainText('Satay by the Bay')
  await page.clock.runFor(3000)
  await expect(checkpoint).toHaveCount(0)
  await expect(page.locator('.journey-trace')).toHaveAttribute('stroke-dashoffset', '0')
  await page.getByRole('button', { name: 'Replay route', exact: true }).click()
  await expect(checkpoint).toHaveAttribute('data-stop', '0')
})

test('how a jio comes together shows three steps whose live examples reach their finished text', async ({ page }) => {
  await page.goto('/')
  const section = page.getByRole('region', { name: 'How a jio comes together', exact: true })
  for (const name of ['Find a time', 'Shape the plan', 'On the day']) {
    await expect(section.getByRole('heading', { level: 3, name, exact: true })).toBeVisible()
  }
  // Demos run only while on screen, so bring each one into view before waiting for its finished frame.
  const time = page.locator('[data-demo="time"]')
  await time.scrollIntoViewIfNeeded()
  await expect(time.locator('.demo-result')).toContainText('Sat 2 pm – 6 pm · 4 of 4 free', { timeout: 15_000 })
  const plan = page.locator('[data-demo="plan"]')
  await plan.scrollIntoViewIfNeeded()
  await expect(plan.locator('.demo-phase')).toHaveText('Ready to confirm', { timeout: 15_000 })
  await expect(plan.locator('.plan-stop').nth(1)).toContainText('Gardens by the Bay')
  const go = page.locator('[data-demo="go"]')
  await go.scrollIntoViewIfNeeded()
  await expect(go.locator('.demo-result')).toContainText('Gardens by the Bay', { timeout: 15_000 })
  await expect(go.locator('.go-weather')).toContainText('Fair, 31°')
})

test('how a jio comes together shows finished examples at once under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('[data-demo="time"] .demo-result')).toBeVisible()
  await expect(page.locator('[data-demo="time"] .demo-result')).toContainText('4 of 4 free')
  await expect(page.locator('[data-demo="plan"] .demo-phase')).toHaveText('Ready to confirm')
  await expect(page.locator('[data-demo="go"] .demo-result')).toContainText('Gardens by the Bay')
  await expect(page.locator('[data-demo]').getByRole('button')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('See how it works scrolls to the steps, which reveal as they come into view', async ({ page }) => {
  await page.goto('/')
  await page.locator('.landing-hero').getByRole('link', { name: 'See how it works', exact: true }).click()
  const section = page.locator('#how-jio')
  await expect(section.getByRole('heading', { level: 2, name: 'How a jio comes together', exact: true })).toBeInViewport()
  for (const name of ['Find a time', 'Shape the plan', 'On the day']) {
    const heading = section.getByRole('heading', { level: 3, name, exact: true })
    await heading.scrollIntoViewIfNeeded()
    await expect(heading).toBeVisible()
    await expect(heading).toHaveCSS('opacity', '1')
    await expect(heading.locator('xpath=..')).toHaveCSS('opacity', '1')
  }
})

test('under reduced motion every revealed element is fully visible on load', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  // The landing route mounts after the lazy import resolves, so wait for the reveal targets first.
  await expect(page.locator('[data-reveal]')).toHaveCount(5)
  const opacities = await page.$$eval('[data-reveal]', (els) => els.map((el) => getComputedStyle(el).opacity))
  expect(opacities).toEqual(['1', '1', '1', '1', '1'])
})
