import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your plans' })).toBeVisible()
}

test('an invite link lets Priya join the seeded hangout and the host sees her', async ({ page }) => {
  // Two tabs in one browser context: the demo store lives in localStorage, which tabs share,
  // so the host's open page sees the guest's join (via the storage event or a reload).
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-catchup')
  const invite = page.getByLabel('Invite link')
  await expect(invite).toBeVisible()
  const link = await invite.inputValue()
  expect(link).toMatch(/\/j\/catchup1$/)

  // A fresh visitor has no session. The demo session is also kept in localStorage,
  // so clear it to make this tab start signed out, as a new browser would.
  await page.evaluate(() => localStorage.removeItem('openjio:session'))

  const guest = await page.context().newPage()
  await guest.goto(link)
  await guest.getByRole('button', { name: 'Sign in to join' }).click()
  await guest.getByRole('button', { name: 'Priya Raman' }).click()
  await expect(guest).toHaveURL(/\/j\/catchup1$/)

  await guest.getByRole('button', { name: /^Join/ }).click()
  await expect(guest.getByRole('heading', { level: 1, name: 'Saturday catch-up' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('region', { name: 'People' }).getByText('Priya Raman', { exact: true })).toBeVisible()
})
