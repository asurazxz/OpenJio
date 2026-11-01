import { test, expect } from '@playwright/test'

async function signInAs(page, name) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

test('time tab shows who has replied', async ({ page }) => {
  // Mei hosts "Saturday catch-up" (h-catchup): 4 members, Jun Hao Tan has not replied.
  await signInAs(page, 'Mei Lin')
  await page.goto('/h/h-catchup?tab=time')

  const strip = page.getByRole('region', { name: 'Reply status' })
  await expect(strip).toBeVisible()
  await expect(strip.getByText('3 of 4 replied', { exact: true })).toBeVisible()
  await expect(strip.getByRole('group', { name: /^Replied: .*Waiting for: Jun Hao Tan$/ })).toBeAttached()

  // The strip must not cause horizontal scrolling on phones (the mobile project runs at 375px).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
