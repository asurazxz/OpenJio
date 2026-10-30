import { test, expect } from '@playwright/test'

async function home(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
}

test('Home theme resolves explicitly and survives reload and route changes without a dimming layer', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await home(page)
  for (const mode of ['light', 'dark', 'system']) {
    await page.getByRole('button', { name: /^Theme:/ }).click()
    const resolved = mode === 'dark' ? 'dark' : 'light'
    await expect(page.locator('html')).toHaveAttribute('data-theme', resolved)
    await expect(page.getByRole('button', { name: `Theme: ${mode}`, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', resolved)
    await expect(page.locator('body')).toHaveCSS('opacity', '1')
    await expect(page.locator('main')).toHaveCSS('filter', 'none')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.goto('/discover')
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('How it works explains the journey visually and keeps benchmarks optional', async ({ page }) => {
  await page.goto('/how')
  await expect(page.getByRole('heading', { name: 'From group chat to going out', exact: true })).toBeVisible()
  await expect(page.getByLabel('Example group availability')).toBeVisible()
  await expect(page.getByLabel('Example outing timeline')).toBeVisible()
  await expect(page.locator('details.benchmarks')).not.toHaveAttribute('open')
  await page.getByText('See the algorithm comparison', { exact: true }).click()
  await expect(page.getByRole('table').first()).toBeVisible()
})

test('First-use guidance can be dismissed and replayed without leaving a backdrop', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  const guide = page.getByRole('dialog', { name: 'A quick look around' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Skip tour', exact: true }).click()
  await expect(guide).toBeHidden()
  await page.reload()
  await expect(guide).toBeHidden()
  await page.getByRole('button', { name: 'Quick tour', exact: true }).click()
  await expect(guide).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
  await expect(page.locator('body')).toHaveCSS('opacity', '1')
})
