import { test, expect } from '@playwright/test'

async function signInAsMei(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /, Mei\?/ })).toBeVisible()
}

// Mei hosts "Saturday catch-up", still choosing a time. Marks the whole range free without saving.
// Phones split the Time tab into "Your times" and "Best times"; desktop shows both side by side.
async function showTimes(page, testInfo, which) {
  if (testInfo.project.name === 'mobile') await page.getByRole('tab', { name: which }).click()
}
async function openCatchupWithUnsavedTimes(page, testInfo) {
  await page.goto('/h/h-catchup')
  await page.getByRole('button', { name: /^All day/ }).click()
  await expect(page.getByText(/Unsaved changes/)).toBeVisible()
  await showTimes(page, testInfo, /^Best times/)
}

test('locking with unsaved free times asks first, and Keep editing changes nothing', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await openCatchupWithUnsavedTimes(page, testInfo)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  const ask = page.getByRole('dialog', { name: 'Save your free times first?', exact: true })
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused()
  await ask.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(ask).toBeHidden()
  // Still on the Time tab with the edit intact and nothing locked.
  await expect(page).not.toHaveURL(/tab=plan/)
  await showTimes(page, testInfo, /^Your times/)
  await expect(page.getByText(/Unsaved changes/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toHaveCount(0)
  await expect(page.locator('.locked-time')).toHaveCount(0)
})

test('Save and review times saves without locking', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await openCatchupWithUnsavedTimes(page, testInfo)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Save your free times first?', exact: true }).getByRole('button', { name: 'Save and review times', exact: true }).click()
  await expect(page.getByText(/The best times may have changed/)).toBeVisible()
  await expect(page.getByText(/Unsaved changes/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lock this time', exact: true }).first()).toBeVisible()
})

test('Discard edits and lock locks and moves to the plan', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await openCatchupWithUnsavedTimes(page, testInfo)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Save your free times first?', exact: true }).getByRole('button', { name: 'Discard edits and lock', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toHaveCount(0)
})

test('a late-arrival result is cleared when its origin or departure changes', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-friday?tab=go')
  await page.getByRole('button', { name: 'Find where to meet them', exact: true }).click()
  const result = page.getByRole('status').filter({ hasText: /Based on leaving/ })
  await expect(result).toBeVisible()
  await expect(result).toContainText(/Based on leaving .+ at .+, \w{3} \d+ \w{3}\./)
  await expect(page.getByRole('link', { name: 'View directions' })).toBeVisible()
  await page.getByLabel(/^Leaving( on .+)? at$/).fill('23:55')
  await expect(result).toBeHidden()
  await expect(page.getByRole('link', { name: 'View directions' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share my ETA' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Find where to meet them', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Based on leaving .+ at 11:55 pm/ })).toBeVisible()
  await page.getByLabel('Leaving from', { exact: true }).selectOption({ index: 1 })
  await expect(page.getByText(/Based on leaving/)).toHaveCount(0)
})

test('a generated plan never calls sample deals verified, and tags them', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup')
  await showTimes(page, testInfo, /^Best times/)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click()
  await expect(page.getByRole('heading', { level: 4 }).first()).toBeVisible()
  await expect(page.getByText(/verified deal/i)).toHaveCount(0)
  await expect(page.locator('.tag', { hasText: /^Sample (deal|data)$/ }).first()).toBeVisible()
})

test('removing a stop on a confirmed plan asks first; a draft stop can be restored with Undo', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup')
  await showTimes(page, testInfo, /^Best times/)
  await page.getByRole('button', { name: 'Lock this time', exact: true }).first().click()
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click()
  const stops = page.locator('li.stop')
  await expect(stops.first()).toBeVisible()
  const titles = await stops.locator('h4').allTextContents()
  expect(titles.length).toBeGreaterThan(1)

  // A draft plan with no votes: no dialog, an Undo on the toast instead.
  await page.getByRole('button', { name: /^Remove / }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(stops).toHaveCount(titles.length - 1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(stops).toHaveCount(titles.length)
  expect(await stops.locator('h4').allTextContents()).toEqual(titles)

  // Once confirmed, the same control asks first and names the consequence.
  await page.getByRole('button', { name: 'Close voting and confirm', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^On the day/ })).toHaveAttribute('aria-selected', 'true')
  // The URL follows the stage's new tab, so the Plan tab button still switches back.
  await expect(page).toHaveURL(/tab=go/)
  await page.getByRole('tab', { name: /^Plan/ }).click()
  await expect(page.getByRole('tab', { name: /^Plan/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Confirmed.', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /^Remove / }).first().click()
  const ask = page.getByRole('dialog', { name: 'Change the confirmed plan?', exact: true })
  await expect(ask).toBeVisible()
  await expect(ask).toContainText('This reopens voting and resets votes on changed stops.')
  await ask.getByRole('button', { name: 'Keep plan', exact: true }).click()
  await expect(stops).toHaveCount(titles.length)
  await expect(page.getByText('Confirmed.', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /^Remove / }).first().click()
  await page.getByRole('dialog', { name: 'Change the confirmed plan?', exact: true }).getByRole('button', { name: 'Remove stop', exact: true }).click()
  await expect(stops).toHaveCount(titles.length - 1)
  await expect(page.getByText('The plan changed.')).toBeVisible()
})
