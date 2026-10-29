import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

test('Mei finds an open jio, joins it and votes on a stop', async ({ page }) => {
  await signInAs(page, 'Mei Lin')

  await page.goto('/discover')
  await page.getByRole('button', { name: 'Open jios' }).click()

  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Sunday Chinatown wander' }) })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'View', exact: true }).click()

  await expect(page).toHaveURL(/\/o\/h-hawker$/)
  await expect(page.getByText('Hosted by Priya Raman')).toBeVisible()
  await page.getByRole('button', { name: 'Join this jio' }).click()

  await expect(page).toHaveURL(/\/h\/h-hawker$/)
  const keep = page.getByRole('button', { name: /^Keep / }).first()
  await expect(keep).toBeVisible()
  await keep.click()
  await expect(keep).toHaveAttribute('aria-pressed', 'true')
})
