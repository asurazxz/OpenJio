import { test, expect } from '@playwright/test'

test.skip(process.env.OPENJIO_DEMO_TEST !== '1', 'Only run against the separate database-backed demo')

test('database demo supports real accounts, shared votes and confirmed relative-date reset', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByLabel('Email', { exact: true }).fill('andrew@demo.openjio.test')
  await page.getByLabel('Password', { exact: true }).fill('OpenJioDemo123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Andrew')
  await expect(page.getByRole('link', { name: /^Find a time with the crew/ })).toBeVisible()
  const reset = page.getByRole('button', { name: 'Reset demo data', exact: true })
  await reset.click()
  const dialog = page.getByRole('dialog', { name: 'Reset demo data?' })
  await expect(dialog).toContainText('shared demo for everyone')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()

  await page.getByRole('link', { name: /^Vote on our city afternoon/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Vote on our city afternoon' })).toBeVisible()
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    const friend = await other.newPage()
    await friend.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
    await friend.goto('/signin')
    await friend.getByLabel('Email', { exact: true }).fill('mei@demo.openjio.test')
    await friend.getByLabel('Password', { exact: true }).fill('OpenJioDemo123!')
    await friend.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(friend.getByRole('heading', { level: 1 })).toContainText('Mei')
    await friend.getByRole('link', { name: /^Vote on our city afternoon/ }).click()
    await expect(friend.getByRole('heading', { level: 1, name: 'Vote on our city afternoon' })).toBeVisible()
    await expect(friend.getByRole('button', { name: /^Keep / }).first()).toHaveAttribute('aria-pressed', 'true')
  } finally { await other.close() }

  await reset.click()
  const response = page.waitForResponse(r => r.url().endsWith('/api/app/resetDemo') && r.request().method() === 'POST')
  await page.getByRole('dialog', { name: 'Reset demo data?' }).getByRole('button', { name: 'Reset demo', exact: true }).click()
  const reply = await response
  expect(reply.ok()).toBe(true)
  const summary = (await reply.json()).result
  const singaporeToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const expected = new Date(Date.parse(singaporeToday) + 14 * 864e5).toISOString().slice(0, 10)
  expect(summary.anchorDate).toBe(expected)
  expect(summary.accounts).toBe(6)
  expect(summary.hangouts).toBe(5)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Andrew')
  await expect(page.getByRole('link', { name: /^Find a time with the crew/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Andrew')
})
