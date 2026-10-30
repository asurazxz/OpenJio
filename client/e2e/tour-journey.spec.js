import { test, expect } from '@playwright/test'

async function startTour(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
  await page.getByRole('button', { name: 'Quick tour', exact: true }).click()
  await page.getByRole('button', { name: 'Show me around' }).click()
}

test('tour follows its targets across pages and keeps the explanation beside the spotlight', async ({ page }) => {
  await startTour(page)
  const card = page.getByRole('dialog', { name: 'Start with your next outing' })
  await expect(card).toBeVisible()
  await expect(page.locator('.tour-shade')).toBeVisible()
  const titles = [
    'Start with your next outing', 'Solo and public plans are here too',
    'Narrow down the ideas', 'Explore or compare', 'A pin is an idea you can open',
    'Meet people through Open jios', 'The whole journey at a glance',
    'Create a jio from any page',
  ]
  for (const [index, title] of titles.entries()) {
    const current = page.getByRole('dialog', { name: title, exact: true })
    await expect(current).toBeVisible()
    await expect(page.locator('[data-tour-active="true"]')).toHaveCount(1)
    await expect.poll(async () => page.evaluate(() => {
      const target = document.querySelector('.tour-spotlight').getBoundingClientRect()
      const card = document.querySelector('.tour-card').getBoundingClientRect()
      const gapX = Math.max(target.left - card.right, card.left - target.right, 0)
      const gapY = Math.max(target.top - card.bottom, card.top - target.bottom, 0)
      const overlap = target.left < card.right && target.right > card.left && target.top < card.bottom && target.bottom > card.top
      return !overlap && Math.hypot(gapX, gapY) <= 32 && card.left >= 8 && card.right <= innerWidth - 8 && card.top >= 8 && card.bottom <= innerHeight - 8
    })).toBe(true)
    if (index === 2) await expect(page).toHaveURL(/\/discover/)
    if (index === 5) await expect(page).toHaveURL(/type=hangout/)
    if (index === 6) await expect(page).toHaveURL(/\/how/)
    if (index === 6) {
      await current.getByRole('button', { name: 'Back', exact: true }).click()
      await expect(page).toHaveURL(/type=hangout/)
      await page.getByRole('dialog', { name: titles[5] }).getByRole('button', { name: 'Next', exact: true }).click()
      await expect(current).toBeVisible()
    }
    if (index === 7) {
      const viewport = page.viewportSize()
      await page.setViewportSize({ width: viewport.width < 768 ? 1280 : 375, height: viewport.height })
      await expect.poll(async () => page.locator('[data-tour-active="true"]').evaluate(el => !!el.getClientRects().length)).toBe(true)
      await page.setViewportSize(viewport)
    }
    await current.getByRole('button', { name: index === titles.length - 1 ? 'Got it' : 'Next', exact: true }).click()
  }
  await expect(page.locator('.tour-shade')).toHaveCount(0)
  await expect(page.locator('[data-tour-active]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeEditable()
})

test('tour started on Discover reveals the map even when cards were selected', async ({ page }) => {
  await startTour(page)
  await page.keyboard.press('Escape')
  await page.goto('/discover?view=cards')
  await page.getByRole('button', { name: 'Quick tour', exact: true }).click()
  await page.getByRole('button', { name: 'Show me around' }).click()
  await page.getByRole('dialog', { name: 'Narrow down the ideas' }).getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('dialog', { name: 'Explore or compare' }).getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A pin is an idea you can open' })).toBeVisible()
  await expect(page.locator('[data-tour="discover-map"]')).toHaveAttribute('data-tour-active', 'true')
  await expect(page.getByRole('button', { name: 'Map view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
})

test('tour supports Back and keyboard dismissal and releases the page', async ({ page }) => {
  await startTour(page)
  await page.getByRole('dialog', { name: 'Start with your next outing' }).getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('dialog', { name: 'Solo and public plans are here too' }).getByRole('button', { name: 'Back', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Start with your next outing' })
  await expect(card).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(card.getByRole('button', { name: 'Next', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.tour-card, .tour-shade, [data-tour-active]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Quick tour', exact: true })).toBeFocused()
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeEditable()
})
