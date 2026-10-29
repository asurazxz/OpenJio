import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

test('Mei creates a group plan, locks a time, generates and confirms a plan', async ({ page }) => {
  await signInAs(page, 'Mei Lin')

  await page.goto('/new?mode=group')
  await page.getByLabel('Name', { exact: true }).fill('E2E catch-up')
  await page.getByRole('button', { name: 'Makan' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Create and invite' }).click()

  // The invite slip shows the link before going to the jio.
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/j\//)
  await page.getByRole('link', { name: 'Go to jio' }).click()

  await expect(page).toHaveURL(/\/h\/[^/?]+\?created=1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E catch-up' })).toBeVisible()

  // Time tab: fill with a preset, then save.
  await page.getByRole('button', { name: /^All day/ }).click()
  await page.getByRole('button', { name: 'Save my times' }).click()

  // Best times: with one responder who is also the host, a slot is offered.
  const lock = page.getByRole('button', { name: 'Lock this time' }).first()
  await expect(lock).toBeVisible()
  await lock.click()

  // Locking moves to the Plan tab.
  await expect(page.getByRole('button', { name: 'Generate plan' })).toBeVisible()
  await page.getByRole('button', { name: 'Generate plan' }).click()
  const stopTitles = page.getByRole('heading', { level: 4 })
  await expect(stopTitles.nth(1)).toBeVisible()

  await page.getByRole('button', { name: 'Close voting and confirm' }).click()

  await page.getByRole('tab', { name: 'On the day' }).click()
  await expect(page.getByText('Joining later?')).toBeVisible()
  await page.getByRole('button', { name: 'Find where to meet them' }).click()
  await expect(page.getByText(/Meet them at|No stop works from there/)).toBeVisible()
})
