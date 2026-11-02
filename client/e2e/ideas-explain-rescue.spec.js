import { test, expect } from '@playwright/test'

async function signInAsMei(page) {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

// Phones split the Time tab into "Your times" and "Best times"; desktop shows both side by side.
async function showBestTimes(page, testInfo) {
  if (testInfo.project.name === 'mobile') await page.getByRole('tab', { name: /^Best times/ }).click()
}

// Edit the saved demo state, then reload so the app reads it.
async function patchState(page, patch) {
  await page.evaluate((src) => {
    const s = JSON.parse(localStorage.getItem('openjio:demo:v1'))
    // eslint-disable-next-line no-new-func
    new Function('s', src)(s)
    localStorage.setItem('openjio:demo:v1', JSON.stringify(s))
  }, patch)
  await page.reload()
}

test('best-time cards lead with who is free, who has not replied, and when', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup?tab=time')
  await showBestTimes(page, testInfo)
  const first = page.locator('.slot').first()
  await expect(first.locator('.slot-line')).toHaveText("Mei, Arjun and Farah are free · Jun hasn't replied · Saturday afternoon, 5 h")
  // The Free / No reply breakdown stays, and the old jargon is gone.
  await expect(first.getByText('No reply', { exact: true })).toBeVisible()
  await expect(page.getByText(/preferred hours/i)).toHaveCount(0)
  // A required person who cannot make a time is named as required.
  await expect(page.locator('.slot-line', { hasText: "can't make it" }).first()).toBeVisible()
})

test('a confirmed plan leads with time, stops, spend and travel', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/h/h-friday?tab=plan')
  const lead = page.getByTestId('plan-lead')
  await expect(lead).toHaveText(/^Fits 6:20–9:55 pm · 2 stops · about \$43 each · \d+ min travel$/)
  await expect(page.getByText('Dinner covered', { exact: true })).toBeVisible()
  // The method sits on a quieter line with the How it works link.
  await expect(page.getByText(/Picked by comparing many possible orders/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'How it works' }).last()).toBeVisible()
})

test('spend is not estimated when a stop has no price', async ({ page }) => {
  await signInAsMei(page)
  await page.goto('/h/h-friday?tab=plan')
  await patchState(page, `
    const plan = s.itineraries['h-friday']
    plan.customPlaces = [{ id: 'x-no-price', type: 'place', kind: 'activity', title: 'Mystery spot', summary: 'No price listed.', interests: ['arts'], area: 'marina-bay', address: '1 Test Road', lat: 1.2816, lng: 103.8636, durationMins: 150, priceText: null, openingHours: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [['00:00', '23:59']]])) }]
    plan.stops[1].listingId = 'x-no-price'
  `)
  const lead = page.getByTestId('plan-lead')
  await expect(lead).toContainText('Spend not estimated')
  await expect(lead).not.toContainText('each')
  await expect(page.getByText('1 stop has no clear price', { exact: true })).toBeVisible()
})

test('when no time works, the host can make the blocking person optional and then lock a time', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup?tab=time')
  // Farah (required) is only free for two hours on Friday, when nobody else is.
  await patchState(page, `s.availability['h-catchup']['u-farah'] = [{ start: Date.UTC(2026, 10, 13, 2), end: Date.UTC(2026, 10, 13, 4), source: 'grid' }]`)
  await showBestTimes(page, testInfo)
  const rescue = page.getByTestId('rescue')
  await expect(rescue.getByRole('heading', { name: 'No time works for everyone yet' })).toBeVisible()
  await expect(rescue).toContainText('Nothing changes until you choose')
  await expect(rescue.getByRole('button', { name: 'Add more dates' })).toBeVisible()
  await expect(rescue.getByRole('button', { name: /^Use Sat .* without Farah$/ })).toBeVisible()
  // Choosing the option changes only Farah's role; the time then shows up to lock.
  await rescue.getByRole('button', { name: 'Make Farah optional', exact: true }).click()
  await expect(page.getByTestId('rescue')).toHaveCount(0)
  const best = page.locator('.slot').first()
  await expect(best.locator('.slot-line')).toContainText('Mei and Arjun are free')
  await expect(best.locator('.slot-line')).toContainText("Farah can't make it")
  await best.getByRole('button', { name: 'Lock this time', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toBeVisible()
})

test('Use this time without a person makes them optional and locks it in one step', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup?tab=time')
  await patchState(page, `s.availability['h-catchup']['u-farah'] = [{ start: Date.UTC(2026, 10, 13, 2), end: Date.UTC(2026, 10, 13, 4), source: 'grid' }]`)
  await showBestTimes(page, testInfo)
  await page.getByTestId('rescue').getByRole('button', { name: /^Use Sat .* without Farah$/ }).click()
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toBeVisible()
})

test('members see the explanation but no buttons; a waiting required person is a calm note', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Farah/ }).click()
  await expect(page).not.toHaveURL(/\/signin/)
  await page.goto('/h/h-catchup?tab=time')
  await patchState(page, `s.availability['h-catchup']['u-farah'] = [{ start: Date.UTC(2026, 10, 13, 2), end: Date.UTC(2026, 10, 13, 4), source: 'grid' }]`)
  await showBestTimes(page, testInfo)
  const rescue = page.getByTestId('rescue')
  await expect(rescue).toContainText('The host can choose one of these')
  await expect(rescue.getByRole('button')).toHaveCount(0)

  // Make Jun required and still waiting: no failure panel, just who we are waiting on.
  await patchState(page, `s.members.find((m) => m.hangoutId === 'h-catchup' && m.userId === 'u-jun').required = true`)
  await showBestTimes(page, testInfo)
  await expect(page.getByTestId('rescue')).toHaveCount(0)
  await expect(page.getByTestId('waiting-required')).toContainText('Waiting on Jun')
  await expect(page.getByRole('button', { name: /nudge|remind/i })).toHaveCount(0)
})

test('Add more dates opens the Edit dialog with the date fields', async ({ page }, testInfo) => {
  await signInAsMei(page)
  await page.goto('/h/h-catchup?tab=time')
  await patchState(page, `s.availability['h-catchup']['u-farah'] = [{ start: Date.UTC(2026, 10, 13, 2), end: Date.UTC(2026, 10, 13, 4), source: 'grid' }]`)
  await showBestTimes(page, testInfo)
  await page.getByTestId('rescue').getByRole('button', { name: 'Add more dates' }).click()
  await expect(page.getByLabel('Last date')).toBeVisible()
  await expect(page.getByText('Changing dates clears the previous availability responses.')).toBeVisible()
})
