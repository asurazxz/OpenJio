import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your plans' })).toBeVisible()
}

test('the how-it-works page renders the evaluation table', async ({ page }) => {
  await signInAs(page, 'Mei Lin')
  await page.goto('/how')
  await expect(page.getByRole('heading', { level: 1, name: 'How OpenJio plans' })).toBeVisible()

  const beamRows = page.getByRole('row').filter({ hasText: 'Beam' })
  await expect(beamRows.nth(5)).toBeVisible()
  expect(await beamRows.count()).toBeGreaterThanOrEqual(6)
})

test('a member can open the on-the-day tab of a confirmed plan', async ({ page }) => {
  await signInAs(page, 'Arjun Nair')
  await page.goto('/h/h-friday?tab=go')
  await expect(page.getByText('Joining later?')).toBeVisible()
})

test('a non-member cannot see a private hangout', async ({ page }) => {
  await signInAs(page, 'Priya Raman')
  await page.goto('/h/h-friday')
  await expect(page.getByText('This hangout is private')).toBeVisible()
})
