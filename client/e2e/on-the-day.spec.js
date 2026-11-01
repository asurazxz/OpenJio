import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

test('an unconfirmed hangout previews the on-the-day view for a member and the host', async ({ page, browser }, testInfo) => {
  // Arjun is a member of the unconfirmed "Saturday catch-up" (h-catchup, hosted by Mei Lin).
  await signInAs(page, 'Arjun Nair')
  await page.goto('/h/h-catchup?tab=go')
  await expect(page.getByRole('heading', { level: 3, name: 'Not confirmed yet' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 4, name: /^Final timeline/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 4, name: /^Join later/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 4, name: /^Weather/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review and confirm the plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'See the draft plan', exact: true })).toBeVisible()

  // Mei hosts the same hangout in a fresh context (separate demo session) and gets the confirm action.
  const hostContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport })
  try {
    const host = await hostContext.newPage()
    await signInAs(host, 'Mei Lin')
    await host.goto('/h/h-catchup?tab=go')
    await expect(host.getByRole('heading', { level: 3, name: 'Not confirmed yet' })).toBeVisible()
    await expect(host.getByRole('button', { name: 'See the draft plan', exact: true })).toBeVisible()
    // The catch-up has no locked time yet, so the host is sent to choose one first.
    await host.getByRole('button', { name: 'Choose a time first', exact: true }).click()
    await expect(host.getByRole('tab', { name: 'Time', exact: true })).toHaveAttribute('aria-selected', 'true')
  } finally {
    await hostContext.close()
  }
})
