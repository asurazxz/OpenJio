import { test, expect } from '@playwright/test'

async function signInAsMei(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Mei Lin' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^(Kopi first|Free later|Jio makan), / })).toBeVisible()
}

test('comparison follows the highlighted recommendation day on phones', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup')
  if (testInfo.project.name === 'mobile') await page.getByRole('tab', { name: /Best times/ }).click()
  await page.getByRole('button', { name: 'Adjust time' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Group overlap and timing' })
  await expect(dialog.getByLabel('Date')).toHaveValue('2026-11-14')
  if (testInfo.project.name === 'mobile') await expect(dialog.getByRole('tab', { name: /Sat 14 Nov/ })).toHaveAttribute('aria-selected', 'true')
})

test('host previews an adjusted recommendation and closes the dialog before plan handoff', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/new?mode=group')
  await page.getByLabel('Name', { exact: true }).fill('Flexible time check')
  await page.getByRole('button', { name: 'Makan' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const firstDate = await page.locator('#from').inputValue()
  await page.locator('#to').fill(firstDate)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Create and invite' }).click()
  await page.getByRole('link', { name: 'Go to jio' }).click()

  await page.getByRole('button', { name: /^All day/ }).click()
  await page.getByRole('button', { name: 'Save my times' }).click()
  await page.getByRole('button', { name: 'Show on grid' }).first().click()
  const overlap = page.getByRole('dialog', { name: 'Group overlap' })
  await expect(overlap).toBeVisible()
  await expect(overlap.getByRole('region', { name: 'Availability overlap' })).toBeVisible()
  await overlap.getByRole('button', { name: 'Close' }).click()

  const firstCard = page.locator('.slot').first()
  await expect(firstCard.getByRole('button', { name: 'Lock this time' })).toBeEnabled()
  await expect(firstCard.getByRole('button', { name: 'Adjust time' })).toBeVisible()
  await page.getByRole('button', { name: 'Adjust time' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'Group overlap and timing' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Availability overlap for proposed time' })).toBeVisible()
  await expect(dialog.getByLabel('Date')).toHaveValue(/\d{4}-\d{2}-\d{2}/)
  await expect(dialog.getByLabel('End time').locator('option', { hasText: '12:00 am (midnight)' })).toHaveCount(1)
  await expect(dialog.getByText('This time can be locked')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeEnabled()

  const endSelect = dialog.getByLabel('End time')
  const originalStart = await dialog.getByLabel('Start time').inputValue()
  const originalEnd = await endSelect.inputValue()

  const nextDate = new Date(`${firstDate}T00:00:00Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const outOfRangeDate = nextDate.toISOString().slice(0, 10)
  await dialog.getByLabel('Date').fill(outOfRangeDate)
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeDisabled()
  await expect(dialog.getByText(/within the selected date range/i)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeDisabled()

  await dialog.getByLabel('Date').fill(firstDate)
  await dialog.getByLabel('Start time').selectOption('08:00')
  await endSelect.selectOption('10:00')
  await expect(dialog.getByText('This time needs changes')).toBeVisible()
  await expect(dialog.getByText(/Every required person must be free/i)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeDisabled()

  await dialog.getByLabel('Start time').selectOption('20:00')
  await endSelect.selectOption('21:00')
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeDisabled()
  await expect(dialog.getByText(/at least 2 hours/i)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Lock this time' })).toBeDisabled()

  await dialog.getByLabel('Start time').selectOption(originalStart)
  await dialog.getByLabel('Date').fill(firstDate)
  await endSelect.selectOption(originalEnd)
  await expect(dialog.getByText('This time can be locked')).toBeVisible()
  await dialog.getByRole('button', { name: 'Lock this time' }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate plan' })).toBeVisible()
})
