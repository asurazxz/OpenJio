import { test, expect } from '@playwright/test'

async function signInAsMei(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
}
// Phones split the Time tab into "Your times" and "Best times"; desktop shows both side by side.
async function showTimes(page, testInfo, which) {
  if (testInfo.project.name === 'mobile') await page.getByRole('tab', { name: which }).click()
}

test('F06: the late-join result separates when you arrive from when the group does', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/h/h-friday?tab=go')
  // The outing's date sits beside the departure time.
  await expect(page.getByLabel(/^Leaving on \w{3} \d+ \w{3} at$/)).toBeVisible()
  await page.getByRole('button', { name: 'Find where to meet them', exact: true }).click()
  const result = page.getByRole('status').filter({ hasText: /Based on leaving/ })
  await expect(result).toBeVisible()
  await expect(result.getByText('You arrive', { exact: true })).toBeVisible()
  await expect(result.getByText('Group arrives', { exact: true })).toBeVisible()
  await expect(result).toContainText(/Wait about|You join them partway/)
  await expect(result).toContainText(/Together until .+ \(.+\)/)
})

test('F14: unsaved edits show a save bar that stays in view, and saving removes it', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup')
  const bar = page.locator('.save-bar.unsaved')
  await expect(bar).toHaveCount(0)
  await page.getByRole('button', { name: /^All day/ }).click()
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(/Unsaved changes · .* marked/)
  // Stuck to the bottom of the viewport (above the phone tab bar).
  const box = await bar.boundingBox()
  const height = page.viewportSize().height
  expect(box.y + box.height).toBeLessThanOrEqual(height)
  expect(box.y).toBeGreaterThan(0)
  // Undo is part of the bar.
  const undo = bar.getByRole('button', { name: 'Undo last change' })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: /^All day/ }).click()
  await bar.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByText('Free times saved')).toBeVisible()
  await showTimes(page, testInfo, /^Your times/)
  await expect(page.locator('.save-bar.unsaved')).toHaveCount(0)
  // The range alternative is a visible control next to the presets.
  await page.getByRole('button', { name: 'Add a time range', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add as free' })).toBeVisible()
})

test('F16: each wizard step moves focus to its heading, announced with its position', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/new?mode=group')
  await page.getByLabel('Name').fill('Focus test jio')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const heading = page.locator('h2.step-title')
  await expect(heading).toContainText('Step 2 of 4: When')
  await expect(heading).toBeFocused()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(heading).toContainText('Step 3 of 4: Where to start')
  await expect(heading).toBeFocused()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(heading).toContainText('Step 4 of 4')
  await expect(heading).toBeFocused()
  // A repeated Enter lands on the heading, not on the now-final submit button, so nothing is created.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/new/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(heading).toBeFocused()
})

test('F16: date errors are linked to their fields', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/new?mode=group')
  await page.getByLabel('Name').fill('Bad dates')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('h2.step-title')).toBeFocused()
  await page.getByLabel('To', { exact: true }).fill('2020-01-01')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const to = page.getByLabel('To', { exact: true })
  await expect(to).toHaveAttribute('aria-invalid', 'true')
  await expect(to).toHaveAttribute('aria-describedby', 'dates-err')
  await expect(page.locator('#dates-err')).toContainText(/before the start date|Choose both/)
})

test('F17: a page change moves focus to the new page heading', async ({ page }) => {
  await signInAsMei(page)
  await page.getByRole('link', { name: 'Discover', exact: true }).first().click()
  await expect(page).toHaveURL(/\/discover/)
  const h1 = page.locator('main h1').first()
  await expect(h1).toBeFocused()
  // Typing in a filter on the same page keeps focus where it is.
  const search = page.getByRole('searchbox').first()
  if (await search.count()) {
    await search.focus()
    await search.fill('cafe')
    await expect(search).toBeFocused()
  }
})

async function openAddDialog(page) {
  await page.getByRole('button', { name: 'Add a stop', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a stop', exact: true })
  await dlg.getByRole('button', { name: 'Enter manually', exact: true }).click()
  return dlg
}
async function planWithStops(page, testInfo) {
  await page.goto('/h/h-catchup')
  await showTimes(page, testInfo, /^Best times/)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click()
  await expect(page.locator('li.stop').first()).toBeVisible()
}

test('F21: a half-typed custom place survives closing and asks before it is discarded', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await planWithStops(page, testInfo)
  const dlg = await openAddDialog(page)
  await dlg.getByLabel('Place name').fill('Aunty Lim Kopi')
  await dlg.getByLabel('Address').fill('1 Test Road')

  // Switching add-source tabs keeps the draft.
  await dlg.getByRole('button', { name: 'Find a place', exact: true }).click()
  await dlg.getByRole('button', { name: 'Enter manually', exact: true }).click()
  await expect(dlg.getByLabel('Place name')).toHaveValue('Aunty Lim Kopi')

  // Closing with edits asks first; Keep editing changes nothing.
  await page.keyboard.press('Escape')
  const ask = page.getByRole('dialog', { name: 'Discard this place?', exact: true })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(ask).toBeHidden()
  await expect(dlg).toBeVisible()
  await expect(dlg.getByLabel('Place name')).toHaveValue('Aunty Lim Kopi')

  // Close but keep the draft, then reopen: it is restored.
  await dlg.getByRole('button', { name: 'Close', exact: true }).click()
  await ask.getByRole('button', { name: 'Close, keep draft', exact: true }).click()
  await expect(dlg).toBeHidden()
  const reopened = await openAddDialog(page)
  await expect(reopened.getByLabel('Place name')).toHaveValue('Aunty Lim Kopi')
  await expect(reopened.getByLabel('Address')).toHaveValue('1 Test Road')

  // Discard clears it.
  await reopened.getByRole('button', { name: 'Close', exact: true }).click()
  await ask.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(reopened).toBeHidden()
  const fresh = await openAddDialog(page)
  await expect(fresh.getByLabel('Place name')).toHaveValue('')
})

test('F21: adding a custom place to a confirmed plan asks first', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await planWithStops(page, testInfo)
  await page.getByRole('button', { name: 'Close voting and confirm', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^On the day/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^Plan/ }).click()
  const dlg = await openAddDialog(page)
  await dlg.getByLabel('Place name').fill('Aunty Lim Kopi')
  await dlg.getByLabel('Address').fill('1 Test Road')
  await dlg.getByText('Advanced: enter coordinates instead').click()
  await dlg.getByLabel('Latitude').fill('1.3')
  await dlg.getByLabel('Longitude').fill('103.85')
  await dlg.getByRole('button', { name: 'Add to route', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'Change the confirmed plan?', exact: true })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Keep plan', exact: true }).click()
  await expect(ask).toBeHidden()
  await expect(dlg.getByLabel('Place name')).toHaveValue('Aunty Lim Kopi')
})
