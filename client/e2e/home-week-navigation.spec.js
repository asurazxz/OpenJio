import { test, expect } from '@playwright/test'

test('Home browses past and future weeks, keeps past outings visible, and returns to today', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00+08:00'))
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mei')
  await page.evaluate(async () => {
    const { load, persist } = await import('/src/api/store.js')
    const state = load()
    const past = state.hangouts.find(h => h.id === 'h-friday')
    past.title = 'Last week with friends'
    past.stage = 'ended'
    past.lockedSlot = {
      start: Date.parse('2026-10-28T18:00:00+08:00'),
      end: Date.parse('2026-10-28T22:00:00+08:00'),
    }
    state.published.push({
      id: 'week-navigation-past-event', type: 'event', status: 'published',
      title: 'Last week gallery opening', area: 'bugis', interests: ['arts'],
      startsAt: '2026-10-28T18:00:00+08:00', endsAt: '2026-10-28T20:00:00+08:00',
    }, {
      id: 'week-navigation-event', type: 'event', status: 'published',
      title: 'Next week art night', area: 'bugis', interests: ['arts'],
      startsAt: '2026-11-12T18:00:00+08:00', endsAt: '2026-11-12T20:00:00+08:00',
    })
    persist()
  })
  const week = page.getByRole('region', { name: /week around you|Events around you/i })
  await expect(week.getByRole('button', { name: /^Today, Tuesday 3 November/ })).toHaveAttribute('aria-current', 'date')

  await week.getByRole('button', { name: 'Previous week', exact: true }).click()
  const pastDay = week.getByRole('button', { name: /^Past, Wednesday 28 October/ })
  await expect(pastDay).toBeEnabled()
  await pastDay.click()
  await expect(pastDay).toHaveAttribute('aria-pressed', 'true')
  await expect(pastDay).toContainText('Past')
  await expect(week.getByRole('link', { name: /Last week with friends/ })).toBeVisible()
  await expect(week.getByRole('link', { name: /Last week gallery opening/ })).toBeVisible()
  await expect(week.getByRole('heading', { level: 3 })).toHaveText('Wednesday 28 October')
  await expect(week.getByRole('button', { name: /^Today,/ })).toHaveCount(0)

  await week.getByRole('button', { name: 'Next week', exact: true }).click()
  await week.getByRole('button', { name: 'Next week', exact: true }).click()
  await expect(week.getByRole('link', { name: /Next week art night/ })).toBeVisible()
  await expect(week.getByRole('button', { name: /^Past,/ })).toHaveCount(0)

  await week.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(week.getByRole('button', { name: /^Today, Tuesday 3 November/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(week.getByRole('heading', { level: 3 })).toHaveText('Today')
})

test('week navigation crosses a year boundary and labels the actual current date', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-29T23:30:00-08:00')) // 30 Dec in Singapore
  await page.addInitScript(() => localStorage.setItem('openjio:onboarding:v1', 'done'))
  await page.goto('/signin')
  await page.getByRole('button', { name: /^Mei Lin/ }).click()
  const week = page.getByRole('region', { name: /week around you|Events around you/i })
  await expect(week.getByRole('button', { name: /^Today, Wednesday 30 December/ })).toHaveAttribute('aria-current', 'date')
  await expect(week).toContainText('2026')
  await expect(week).toContainText('2027')
  await week.getByRole('button', { name: 'Next week', exact: true }).click()
  await expect(week.getByRole('button', { name: /^Wednesday 6 January/ })).toBeVisible()
  await expect(week.getByRole('button', { name: /^Today,/ })).toHaveCount(0)
  await week.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(week.getByRole('heading', { level: 3 })).toHaveText('Today')
})
